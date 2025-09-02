// src/main/projectManager.js
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { dialog, BrowserWindow } = require('electron');
const { readSettings, saveSettings } = require('./settings');

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
        // If file doesn't exist or is corrupt, return an empty object.
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
        // Create .hggui and .hggui/objects directories if they don't exist.
        await fs.mkdir(objectsPath, { recursive: true });
        
        // Create files with 'wx' flag: write if it doesn't exist, otherwise fail.
        // We catch the 'EEXIST' error, effectively making this a "create if not exists" operation.
        await fs.writeFile(logPath, '{}', { flag: 'wx' });
        await fs.writeFile(pagesPath, '{}', { flag: 'wx' });

    } catch (error) {
        // EEXIST is expected if the folder/file is already there, which is fine.
        // For any other error, log it.
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

    if (!settings.projects.some(p => p.path === projectPath)) {
      settings.projects.push({
          name: path.basename(projectPath),
          path: projectPath
      });
      await saveSettings(settings);

      // Ensure the version control directory is initialized.
      await ensureHgGuiInitialized(projectPath);
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

    // Reconcile: If a physical file exists but isn't in config, add it.
    for (const filename of hgmdFiles) {
        if (!pagesConfig[filename]) {
            pagesConfig[filename] = {
                name: filename.replace('.hgmd', ''), // Use filename as default name
                parentId: null,
                icon: '📄',
                currentHash: null,
                status: 'active'
            };
            configNeedsUpdate = true;
        }
    }
    // Reconcile: If a config entry has no physical file, mark it as deleted.
    for (const filename in pagesConfig) {
        if (!hgmdFiles.includes(filename) && pagesConfig[filename].status === 'active') {
            pagesConfig[filename].status = 'deleted';
            configNeedsUpdate = true;
        }
    }

    if (configNeedsUpdate) {
        await savePagesConfig(projectPath, pagesConfig);
    }

    // Generate the note structure for the UI based on pages.json
    const notes = Object.entries(pagesConfig)
        .filter(([, data]) => data.status === 'active')
        .map(([id, data]) => ({
            id: id, // The filename is the ID
            name: data.name,
            path: path.join(projectPath, id), // Full path using ID
            parentId: data.parentId,
            icon: data.icon,
        }));
        
    return notes;
}

async function getNoteContent({ projectPath, filename }) {
    const filePath = path.join(projectPath, filename);
    if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
    return fs.readFile(filePath, 'utf8');
}

async function saveNote({ projectPath, filename, content }) {
    // filename is now the unique ID, e.g., 'abc123xyz.hgmd'
    const filePath = path.join(projectPath, filename);
    if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
    
    // ROBUSTNESS: This is the primary write operation, so ensure structure exists first.
    await ensureHgGuiInitialized(projectPath);

    await fs.writeFile(filePath, content);

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

        // Update pages.json with the current hash
        const pagesConfig = await readPagesConfig(projectPath);
        if (pagesConfig[filename]) { // Should always be true for an existing note
            pagesConfig[filename].currentHash = hash;
            await savePagesConfig(projectPath, pagesConfig);
        }

    } catch (error) {
        console.error(`Failed to version note ${filename}:`, error);
    }
    
    return { success: true, path: filePath, filename: filename };
}

async function createNote({ projectPath, name, parentId = null }) { // Accept parentId from payload
    if (!(await isPathInProjects(projectPath))) throw new Error("Access denied.");
    await ensureHgGuiInitialized(projectPath);
    
    const pagesConfig = await readPagesConfig(projectPath);

    // Check for unique name
    const nameExists = Object.values(pagesConfig).some(p => p.status === 'active' && p.name === name);
    if (nameExists) {
        return { success: false, error: 'A page with this name already exists.' };
    }

    // Generate unique ID for the filename
    const id = `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}.hgmd`;
    const filePath = path.join(projectPath, id);

    // Create empty file
    await fs.writeFile(filePath, '');

    // Add to config, now including the parentId
    pagesConfig[id] = {
        name: name,
        parentId: parentId, // Use the passed parentId
        icon: '📄',
        currentHash: null,
        status: 'active'
    };
    await savePagesConfig(projectPath, pagesConfig);

    return { success: true, note: { id: id, name: name } };
}

async function renameNote({ projectPath, id, newName }) {
    if (!(await isPathInProjects(projectPath))) throw new Error("Access denied.");
    
    const pagesConfig = await readPagesConfig(projectPath);

    if (!pagesConfig[id]) {
        return { success: false, error: 'Page not found.' };
    }

    // Check for unique name (excluding the current page itself)
    const nameExists = Object.entries(pagesConfig).some(([key, page]) => {
        return key !== id && page.status === 'active' && page.name === newName;
    });
    if (nameExists) {
        return { success: false, error: 'A page with this name already exists.' };
    }

    // Update name
    pagesConfig[id].name = newName;
    await savePagesConfig(projectPath, pagesConfig);

    return { success: true };
}


async function deleteNote({ projectPath, filename }) {
    try {
        const filePath = path.join(projectPath, filename);
        if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
        await ensureHgGuiInitialized(projectPath); // ROBUSTNESS: Ensure config file exists before write.
        
        // Physically remove the file
        await fs.unlink(filePath);
        
        // Update the status in pages.json to 'deleted'
        const pagesConfig = await readPagesConfig(projectPath);
        if (pagesConfig[filename]) {
            pagesConfig[filename].status = 'deleted';
            await savePagesConfig(projectPath, pagesConfig);
        }

        return { success: true };
    } catch (error) {
        // Handle case where file doesn't exist to be unlinked
        if (error.code === 'ENOENT') {
            // Even if the file is gone, ensure its status is 'deleted' in the config
            const pagesConfig = await readPagesConfig(projectPath);
            if (pagesConfig[filename] && pagesConfig[filename].status !== 'deleted') {
                pagesConfig[filename].status = 'deleted';
                await savePagesConfig(projectPath, pagesConfig);
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

    if (response === 1) { // User clicked 'Delete Project'
        try {
            // First, untrack it
            await untrackProject(projectPath);
            // Then, delete the folder
            await fs.rm(projectPath, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            console.error(`Failed to delete project at ${projectPath}:`, error);
            // It's possible untracking succeeded but deletion failed. The user should know.
            return { success: false, error: `Project was untracked, but folder deletion failed: ${error.message}` };
        }
    } else {
        return { success: false, reason: 'cancelled' };
    }
}


async function getNoteHistory({ projectPath, filename }) {
    if (!(await isPathInProjects(projectPath))) return [];
    await ensureHgGuiInitialized(projectPath); // ROBUSTNESS: Ensure log file exists before read.

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

    // No need to call ensureHgGuiInitialized here, because if the object file
    // doesn't exist, we want it to fail anyway. The directory check is implicit.
    return fs.readFile(objectPath, 'utf8');
}


module.exports = {
  getProjects,
  addProject,
  getNotes,
  getNoteContent,
  saveNote,
  createNote,
  renameNote,
  deleteNote,
  getNoteHistory,
  getNoteVersionContent,
  untrackProject,
  deleteProject
};