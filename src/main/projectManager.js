// src/main/projectManager.js
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { dialog, BrowserWindow } = require('electron');
const { readSettings, saveSettings } = require('./settings');

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
 * Ensures the .hggui directory structure exists for a project.
 * @param {string} projectPath - The absolute path to the project.
 */
async function ensureHgGuiInitialized(projectPath) {
    const objectsPath = path.join(projectPath, '.hggui', 'objects');
    const logPath = path.join(projectPath, '.hggui', 'log.json');
    try {
        // Create .hggui and .hggui/objects directories if they don't exist.
        await fs.mkdir(objectsPath, { recursive: true });
        // Create an empty log file only if it doesn't already exist.
        await fs.writeFile(logPath, '{}', { flag: 'wx' });
    } catch (error) {
        // EEXIST is expected if the folder/file is already there, which is fine.
        // For any other error, log it and move on. The versioning might fail,
        // but it shouldn't block the primary operation (e.g., saving).
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
  const files = await fs.readdir(projectPath);
  return files
    .filter(file => file.endsWith('.md'))
    .map(file => ({
        name: file,
        path: path.join(projectPath, file)
    }));
}

async function getNoteContent({ projectPath, filename }) {
    const filePath = path.join(projectPath, filename);
    if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
    return fs.readFile(filePath, 'utf8');
}

async function saveNote({ projectPath, filename, content }) {
    const filePath = path.join(projectPath, filename);
    if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
    
    // 1. Write the latest version of the file to the project directory.
    await fs.writeFile(filePath, content);

    // 2. Version the change in the .hggui directory.
    try {
        // Ensure the version control directory exists before proceeding.
        await ensureHgGuiInitialized(projectPath);

        // Create a hash of the content to use as a version identifier.
        const hash = crypto.createHash('sha1').update(content).digest('hex');

        // Save the content to the objects store, named by its hash.
        const objectPath = path.join(projectPath, '.hggui', 'objects', hash);
        try {
            await fs.access(objectPath);
        } catch {
            // File doesn't exist, so write it.
            await fs.writeFile(objectPath, content);
        }

        // Update the log file with the new version.
        const logPath = path.join(projectPath, '.hggui', 'log.json');
        let logData = {};
        try {
            const rawLog = await fs.readFile(logPath, 'utf8');
            logData = JSON.parse(rawLog);
        } catch {
            // Log file might not exist or is invalid, start with an empty object.
            logData = {};
        }

        const history = logData[filename] || [];
        // Avoid creating duplicate version entries if content hasn't changed.
        const lastHash = history.length > 0 ? history[history.length - 1].hash : null;
        if (lastHash === hash) {
            return { success: true, path: filePath }; // No changes, exit early.
        }

        history.push({
            hash,
            timestamp: Date.now(),
            message: 'Note saved' // A default commit message.
        });
        logData[filename] = history;

        await fs.writeFile(logPath, JSON.stringify(logData, null, 2));

    } catch (error) {
        console.error(`Failed to version note ${filename}:`, error);
        // Don't throw, as the primary save succeeded. The versioning is a secondary concern.
    }
    
    return { success: true, path: filePath };
}

async function deleteNote({ projectPath, filename }) {
    try {
        const filePath = path.join(projectPath, filename);
        if (!(await isPathInProjects(filePath))) throw new Error("Access denied.");
        await fs.unlink(filePath);
        
        // Update the version control log to remove the file's history.
        try {
            const logPath = path.join(projectPath, '.hggui', 'log.json');
            const rawLog = await fs.readFile(logPath, 'utf8');
            const logData = JSON.parse(rawLog);

            if (logData[filename]) {
                delete logData[filename];
                await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
            }
        } catch (error) {
            // If log doesn't exist or is unreadable, we can't update it.
            // Log the error but don't cause the delete operation to fail.
            console.error(`Could not update version control log for deleted file ${filename}:`, error);
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to delete note:", error);
        return { success: false, error: error.message };
    }
}

/**
 * NEW: Gets the version history for a specific note.
 * @param {object} payload - { projectPath, filename }
 * @returns {Promise<Array>} - An array of version objects, or an empty array.
 */
async function getNoteHistory({ projectPath, filename }) {
    if (!(await isPathInProjects(projectPath))) return [];
    const logPath = path.join(projectPath, '.hggui', 'log.json');
    try {
        const rawLog = await fs.readFile(logPath, 'utf8');
        const logData = JSON.parse(rawLog);
        return (logData[filename] || []).reverse(); // Return newest first
    } catch (error) {
        console.error(`Could not read history for ${filename}:`, error);
        return [];
    }
}

/**
 * NEW: Gets the content of a specific version of a note.
 * @param {object} payload - { projectPath, hash }
 * @returns {Promise<string>} - The content of the versioned file.
 */
async function getNoteVersionContent({ projectPath, hash }) {
    // Basic security check on hash to prevent path traversal.
    if (!/^[a-f0-9]{40}$/.test(hash)) {
        throw new Error("Invalid version hash.");
    }
    const objectPath = path.join(projectPath, '.hggui', 'objects', hash);
    if (!(await isPathInProjects(objectPath))) throw new Error("Access denied.");
    return fs.readFile(objectPath, 'utf8');
}


module.exports = {
  getProjects,
  addProject,
  getNotes,
  getNoteContent,
  saveNote,
  deleteNote,
  getNoteHistory,
  getNoteVersionContent
};