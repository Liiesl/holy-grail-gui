// src/main/projectManager.js
import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { dialog, BrowserWindow } from 'electron';
import { readSettings, saveSettings } from './settings.js';
import searchManager from './searchManager.js';

// --- START: Indexing Logic ---
// This section is responsible for reading data from the filesystem and
// preparing it for the search index.

/**
 * Updates the index for a single note (page name and content).
 * It generates index items and passes them to the searchManager.
 */
async function updateIndexForNote(projectPath, noteId, noteName, content) {
    // First, remove old entries for this note from the index
    searchManager.removeIndexForNote(projectPath, noteId);

    const projectName = path.basename(projectPath);
    const newItems = [];

    // Create item for the page name
    newItems.push({
        type: 'page',
        text: noteName,
        metadata: { projectPath, projectName, noteId, noteName }
    });

    // Create items for content lines
    content.split('\n').forEach((line, index) => {
        if (line.trim()) {
            newItems.push({
                type: 'content_line',
                text: line,
                metadata: { projectPath, projectName, noteId, noteName, lineNumber: index + 1 }
            });
        }
    });

    // Add all new items to the index in one go
    searchManager.addItemsToIndex(newItems);
}

/**
 * Builds the search index for a single project.
 * This version is highly optimized for bulk indexing. It reads all note files
 * in parallel and returns an array of index items.
 * @param {object} project - The project object { name, path }.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of index items for the project.
 */
async function buildIndexForProject(project) {
    console.log(`[Search] Indexing project: ${project.name}`);
    const projectItems = [];

    // Index the project name itself
    projectItems.push({
        type: 'project',
        text: project.name,
        metadata: { projectPath: project.path, projectName: project.name }
    });

    try {
        const pagesConfig = await readPagesConfig(project.path);
        const activePages = Object.entries(pagesConfig).filter(([, data]) => data.status === 'active');
        
        const notesData = await Promise.all(activePages.map(async ([noteId, noteData]) => {
            try {
                const notePath = path.join(project.path, noteId);
                const content = await fs.readFile(notePath, 'utf8');
                return { noteId, noteData, content };
            } catch (err) {
                console.error(`[Search] Could not index note ${noteId} in ${project.name}: ${err.message}`);
                return null;
            }
        }));

        for (const note of notesData.filter(Boolean)) {
            const { noteId, noteData, content } = note;
            
            projectItems.push({
                type: 'page',
                text: noteData.name,
                metadata: { projectPath: project.path, projectName: project.name, noteId, noteName: noteData.name }
            });
            
            content.split('\n').forEach((line, index) => {
                if (line.trim()) {
                    projectItems.push({
                        type: 'content_line',
                        text: line,
                        metadata: { projectPath: project.path, projectName: project.name, noteId, noteName: noteData.name, lineNumber: index + 1 }
                    });
                }
            });
        }
    } catch (err) {
        console.error(`[Search] Failed to build index for ${project.name}: ${err.message}`);
    }
    
    return projectItems;
}

/** Builds the search index for all tracked projects. */
async function buildAllIndices() {
    searchManager.clearIndex(); // Clear the index via the manager
    console.log('[Search] Building all indices...');
    const settings = await readSettings();

    // Concurrently generate index items for all projects.
    const allProjectsItems = await Promise.all(settings.projects.map(p => buildIndexForProject(p)));
    
    // Add the generated items to the search index.
    searchManager.addItemsToIndex(allProjectsItems.flat());

    console.log(`[Search] Indexing complete. ${searchManager._getSearchIndex_FOR_TESTING().length} items indexed.`);
}

// --- END: Indexing Logic ---


// --- Helper Functions for .hggui management ---

/**
 * Reads the page configuration file (pages.json).
 * @param {string} projectPath - The absolute path to the project.
 * @returns {Promise<object>} - The parsed page configuration.
 */
async function readPagesConfig(projectPath) {
    const pagesPath = path.join(projectPath, '.hggui', 'pages.json');
    try {
        const rawData = await fs.readFile(pagesPath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Could not read pages.json for ${projectPath}:`, error.message);
        }
        return {};
    }
}

/**
 * Writes to the page configuration file (pages.json).
 * @param {string} projectPath - The absolute path to the project.
 * @param {object} config - The configuration object to save.
 */
async function savePagesConfig(projectPath, config) {
    const pagesPath = path.join(projectPath, '.hggui', 'pages.json');
    try {
        await fs.writeFile(pagesPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error(`Failed to save pages.json for ${projectPath}:`, error);
    }
}


/**
 * Security check to ensure a file path is within a registered project directory.
 * @param {string} filePath - The absolute path to the file to check.
 * @returns {Promise<boolean>} - True if the path is safe, false otherwise.
 */
async function isPathInProjects(filePath) {
    const settings = await readSettings();
    return settings.projects.some(p => filePath.startsWith(p.path));
}

/**
 * Ensures the .hggui directory structure exists for a project. This function
 * is idempotent and can be called safely multiple times.
 * @param {string} projectPath - The absolute path to the project.
 */
async function ensureHgGuiInitialized(projectPath) {
    const hgGuiPath = path.join(projectPath, '.hggui');
    const objectsPath = path.join(hgGuiPath, 'objects');
    const logPath = path.join(hgGuiPath, 'log.json');
    const pagesPath = path.join(hgGuiPath, 'pages.json'); // New config file

    try {
        await fs.mkdir(objectsPath, { recursive: true });
        await fs.writeFile(logPath, '{}', { flag: 'wx' });
        await fs.writeFile(pagesPath, '{}', { flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            console.error(`Failed to initialize or verify .hggui repository in ${projectPath}:`, error);
        }
    }
}

async function getProjects() {
  const settings = await readSettings();
  return settings.projects;
}

async function addProject(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });

  if (!canceled && filePaths.length > 0) {
    const projectPath = filePaths[0];
    const settings = await readSettings();
    const projectName = path.basename(projectPath);

    if (!settings.projects.some(p => p.path === projectPath)) {
      const project = { name: projectName, path: projectPath };
      settings.projects.push(project);
      await saveSettings(settings);

      await ensureHgGuiInitialized(projectPath);
      // SEARCH: Generate index items for the new project and add them.
      const projectIndexItems = await buildIndexForProject(project);
      searchManager.addItemsToIndex(projectIndexItems);
    }
    return settings.projects;
  }
  return (await readSettings()).projects;
}

async function getNotes(projectPath) {
    if (!(await isPathInProjects(projectPath))) return [];
    await ensureHgGuiInitialized(projectPath);

    const physicalFiles = await fs.readdir(projectPath);
    const hgmdFiles = physicalFiles.filter(file => file.endsWith('.hgmd'));

    const pagesConfig = await readPagesConfig(projectPath);
    let configNeedsUpdate = false;

    for (const filename of hgmdFiles) {
        if (!pagesConfig[filename]) {
            pagesConfig[filename] = {
                name: filename.replace('.hgmd', ''),
                parentId: null,
                icon: '📄',
                currentHash: null,
                status: 'active'
            };
            configNeedsUpdate = true;
        }
    }
    for (const filename in pagesConfig) {
        if (!hgmdFiles.includes(filename) && pagesConfig[filename].status === 'active') {
            pagesConfig[filename].status = 'deleted';
            configNeedsUpdate = true;
        }
    }

    if (configNeedsUpdate) {
        await savePagesConfig(projectPath, pagesConfig);
    }

    const notes = Object.entries(pagesConfig)
        .filter(([, data]) => data.status === 'active')
        .map(([id, data]) => ({
            id: id,
            name: data.name,
            path: path.join(projectPath, id),
            parentId: data.parentId,
            icon: data.icon,
            order: data.order // <-- ADDED: Return order property
        }));
        
    return notes;
}

async function getNoteContent({ projectPath, filename }) {
    const filePath = path.join(projectPath, filename);
    if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
    return fs.readFile(filePath, 'utf8');
}

async function saveNote({ projectPath, filename, content }) {
    const filePath = path.join(projectPath, filename);
    if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
    
    await ensureHgGuiInitialized(projectPath);
    await fs.writeFile(filePath, content);
    
    // SEARCH: Update index after saving
    const pagesConfig = await readPagesConfig(projectPath);
    const noteName = pagesConfig[filename]?.name || filename.replace('.hgmd', '');
    updateIndexForNote(projectPath, filename, noteName, content).catch(console.error);

    try {
        const hash = crypto.createHash('sha1').update(content).digest('hex');
        const objectPath = path.join(projectPath, '.hggui', 'objects', hash);
        try {
            await fs.access(objectPath);
        } catch {
            await fs.writeFile(objectPath, content);
        }

        const logPath = path.join(projectPath, '.hggui', 'log.json');
        let logData = {};
        try {
            const rawLog = await fs.readFile(logPath, 'utf8');
            logData = JSON.parse(rawLog);
        } catch {
            logData = {};
        }

        const history = logData[filename] || [];
        const lastHash = history.length > 0 ? history[history.length - 1].hash : null;
        if (lastHash !== hash) {
            history.push({ hash, timestamp: Date.now(), message: 'Note saved' });
            logData[filename] = history;
            await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
        }

        if (pagesConfig[filename]) {
            pagesConfig[filename].currentHash = hash;
            await savePagesConfig(projectPath, pagesConfig);
        }

    } catch (error) {
        console.error(`Failed to version note ${filename}:`, error);
    }
    
    return { success: true, path: filePath, filename: filename };
}

async function createNote({ projectPath, name, parentId = null }) {
    if (!(await isPathInProjects(projectPath))) throw new Error("Access denied.");
    await ensureHgGuiInitialized(projectPath);
    
    const pagesConfig = await readPagesConfig(projectPath);

    const nameExists = Object.values(pagesConfig).some(p => p.status === 'active' && p.name === name);
    if (nameExists) {
        return { success: false, error: 'A page with this name already exists.' };
    }

    const id = `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}.hgmd`;
    const filePath = path.join(projectPath, id);
    const content = '';

    await fs.writeFile(filePath, content);

    pagesConfig[id] = {
        name: name,
        parentId: parentId,
        icon: '📄',
        currentHash: null,
        status: 'active'
    };
    await savePagesConfig(projectPath, pagesConfig);
    
    // SEARCH: Index the new note
    updateIndexForNote(projectPath, id, name, content).catch(console.error);

    return { success: true, note: { id: id, name: name } };
}

async function renameNote({ projectPath, id, newName }) {
    if (!(await isPathInProjects(projectPath))) throw new Error("Access denied.");
    
    const pagesConfig = await readPagesConfig(projectPath);

    if (!pagesConfig[id]) {
        return { success: false, error: 'Page not found.' };
    }

    const nameExists = Object.entries(pagesConfig).some(([key, page]) => {
        return key !== id && page.status === 'active' && page.name === newName;
    });
    if (nameExists) {
        return { success: false, error: 'A page with this name already exists.' };
    }

    pagesConfig[id].name = newName;
    await savePagesConfig(projectPath, pagesConfig);
    
    // SEARCH: Re-index with new name.
    try {
        const content = await fs.readFile(path.join(projectPath, id), 'utf8');
        updateIndexForNote(projectPath, id, newName, content).catch(console.error);
    } catch (e) {
        updateIndexForNote(projectPath, id, newName, '').catch(console.error);
    }

    return { success: true };
}

async function moveNote({ projectPath, noteId, newParentId }) {
    if (!(await isPathInProjects(projectPath))) throw new Error("Access denied.");

    const pagesConfig = await readPagesConfig(projectPath);

    if (!pagesConfig[noteId]) {
        return { success: false, error: 'Page to move not found.' };
    }
    if (newParentId && !pagesConfig[newParentId]) {
        return { success: false, error: 'Target parent page not found.' };
    }

    // Circular dependency check
    let currentId = newParentId;
    while (currentId) {
        if (currentId === noteId) {
            return { success: false, error: 'Cannot move a page into one of its own children.' };
        }
        currentId = pagesConfig[currentId] ? pagesConfig[currentId].parentId : null;
    }

    pagesConfig[noteId].parentId = newParentId;
    await savePagesConfig(projectPath, pagesConfig);

    return { success: true };
}

// --- NEW FUNCTION for Reordering ---
async function reorderNotes({ projectPath, noteIds, parentId }) {
    if (!(await isPathInProjects(projectPath))) throw new Error("Access denied.");

    const pagesConfig = await readPagesConfig(projectPath);
    let changed = false;

    // noteIds contains the IDs in the new sorted order
    noteIds.forEach((id, index) => {
        if (pagesConfig[id]) {
            // Update order based on array index
            if (pagesConfig[id].order !== index) {
                pagesConfig[id].order = index;
                changed = true;
            }
            // Update parentId if provided (handles reordering within a new parent context)
            if (parentId !== undefined && pagesConfig[id].parentId !== parentId) {
                pagesConfig[id].parentId = parentId;
                changed = true;
            }
        }
    });

    if (changed) {
        await savePagesConfig(projectPath, pagesConfig);
    }

    return { success: true };
}

async function deleteNote({ projectPath, filename }) {
    try {
        const filePath = path.join(projectPath, filename);
        if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
        await ensureHgGuiInitialized(projectPath);
        
        await fs.unlink(filePath);
        
        const pagesConfig = await readPagesConfig(projectPath);
        if (pagesConfig[filename]) {
            pagesConfig[filename].status = 'deleted';
            await savePagesConfig(projectPath, pagesConfig);
        }
        
        // SEARCH: Remove from index
        searchManager.removeIndexForNote(projectPath, filename);

        return { success: true };
    } catch (error) {
        if (error.code === 'ENOENT') {
            const pagesConfig = await readPagesConfig(projectPath);
            if (pagesConfig[filename] && pagesConfig[filename].status !== 'deleted') {
                pagesConfig[filename].status = 'deleted';
                await savePagesConfig(projectPath, pagesConfig);
                searchManager.removeIndexForNote(projectPath, filename);
            }
            return { success: true, message: 'File already deleted.' };
        }
        console.error("Failed to delete note:", error);
        return { success: false, error: error.message };
    }
}

async function untrackProject(projectPath) {
    try {
        const settings = await readSettings();
        settings.projects = settings.projects.filter(p => p.path !== projectPath);
        await saveSettings(settings);
        // SEARCH: Remove project from index
        searchManager.removeIndexForProject(projectPath);
        return { success: true };
    } catch (error) {
        console.error(`Failed to untrack project at ${projectPath}:`, error);
        return { success: false, error: error.message };
    }
}

async function deleteProject(event, projectPath) {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Cancel', 'Delete Project'],
        defaultId: 0,
        title: 'Confirm Project Deletion',
        message: `Are you sure you want to permanently delete project '${path.basename(projectPath)}'?`,
        detail: `This action is irreversible and will delete the entire folder at "${projectPath}".`
    });

    if (response === 1) {
        try {
            await untrackProject(projectPath);
            await fs.rm(projectPath, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            console.error(`Failed to delete project at ${projectPath}:`, error);
            return { success: false, error: `Project was untracked, but folder deletion failed: ${error.message}` };
        }
    } else {
        return { success: false, reason: 'cancelled' };
    }
}


async function getNoteHistory({ projectPath, filename }) {
    if (!(await isPathInProjects(projectPath))) return [];
    await ensureHgGuiInitialized(projectPath);

    const logPath = path.join(projectPath, '.hggui', 'log.json');
    try {
        const rawLog = await fs.readFile(logPath, 'utf8');
        const logData = JSON.parse(rawLog);
        return (logData[filename] || []).reverse();
    } catch (error) {
        console.error(`Could not read history for ${filename}:`, error);
        return [];
    }
}

async function getNoteVersionContent({ projectPath, hash }) {
    if (!/^[a-f0-9]{40}$/.test(hash)) throw new Error("Invalid version hash.");
    
    const objectPath = path.join(projectPath, '.hggui', 'objects', hash);
    if (!(await isPathInProjects(objectPath))) throw new Error("Access denied.");

    return fs.readFile(objectPath, 'utf8');
}

export default {
  getProjects,
  addProject,
  getNotes,
  getNoteContent,
  saveNote,
  createNote,
  renameNote,
  moveNote,
  reorderNotes,
  deleteNote,
  getNoteHistory,
  getNoteVersionContent,
  untrackProject,
  deleteProject,
  buildAllIndices,
  _getSearchIndex_FOR_TESTING: searchManager._getSearchIndex_FOR_TESTING,
};
