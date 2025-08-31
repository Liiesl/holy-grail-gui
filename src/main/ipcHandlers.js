// src/main/ipcHandlers.js
const { ipcMain } = require('electron');
const projectManager = require('./projectManager');

/**
 * Registers all IPC handlers for the application.
 */
function registerIpcHandlers() {
  // --- Markdown Conversion Handlers ---
  // REMOVED: These are now handled directly in the renderer process.

  // --- Project & Note Handlers ---
  ipcMain.handle('get-projects', () => {
    return projectManager.getProjects();
  });

  ipcMain.handle('add-project', (event) => {
    return projectManager.addProject(event);
  });

  ipcMain.handle('get-notes', (event, projectPath) => {
    return projectManager.getNotes(projectPath);
  });

  ipcMain.handle('get-note-content', (event, payload) => {
    return projectManager.getNoteContent(payload);
  });

  ipcMain.handle('save-note', (event, payload) => {
    return projectManager.saveNote(payload);
  });

  ipcMain.handle('delete-note', (event, payload) => {
    return projectManager.deleteNote(payload);
  });

  // --- NEW: Version History Handlers ---
  ipcMain.handle('get-note-history', (event, payload) => {
    return projectManager.getNoteHistory(payload);
  });

  ipcMain.handle('get-note-version-content', (event, payload) => {
    return projectManager.getNoteVersionContent(payload);
  });
}

module.exports = { registerIpcHandlers };