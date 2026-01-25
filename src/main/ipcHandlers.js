// src/main/ipcHandlers.js
const { ipcMain, app } = require('electron'); // Added app
const projectManager = require('./projectManager');
const searchManager = require('./searchManager'); // Import the new search manager
const { readSettings, saveSettings } = require('./settings'); // Import settings functions
const { continueChat } = require('./gemini'); // Import Gemini function

/**
 * Registers all IPC handlers for the application.
 * @param {object} sessionRef - A reference object to store session data.
 */
function registerIpcHandlers(sessionRef) {
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

  ipcMain.handle('create-note', (event, payload) => {
    return projectManager.createNote(payload);
  });

  ipcMain.handle('rename-note', (event, payload) => {
    return projectManager.renameNote(payload);
  });

  ipcMain.handle('move-note', (event, payload) => {
    return projectManager.moveNote(payload);
  });

  ipcMain.handle('reorder-notes', (event, payload) => {
    return projectManager.reorderNotes(payload);
  });

  // --- Version History Handlers ---
  ipcMain.handle('get-note-history', (event, payload) => {
    return projectManager.getNoteHistory(payload);
  });

  ipcMain.handle('get-note-version-content', (event, payload) => {
    return projectManager.getNoteVersionContent(payload);
  });
  
  // --- NEW: Project Actions ---
  ipcMain.handle('untrack-project', (event, projectPath) => {
    return projectManager.untrackProject(projectPath);
  });
 
  ipcMain.handle('delete-project', (event, projectPath) => {
    // Pass the event to get the window for the dialog
    return projectManager.deleteProject(event, projectPath);
  });

  // --- NEW: Settings Handlers ---
  ipcMain.handle('get-settings', async () => {
    return readSettings();
  });

  ipcMain.handle('save-settings', async (event, settings) => {
    return saveSettings(settings);
  });
  
  // --- UPGRADED: Gemini Chat Handler ---
  // The logic is now centralized in gemini.js
  ipcMain.handle('chat-with-gemini', async (event, messages) => {
    try {
      const settings = await readSettings();
      // We pass 'event.sender' so gemini.js can send 'tool_start' updates to the UI
      return await continueChat(messages, settings, event.sender);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // --- NEW: Session Handler ---
  ipcMain.on('update-session-data', (event, data) => {
    sessionRef.current = data;
  });

  // --- NEW: App Info ---
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // --- NEW: Search Handlers ---
  ipcMain.handle('search-perform', (event, { query, context }) => {
    // Now calls the dedicated search manager for performing a search
    return searchManager.performSearch(query, context);
  });

  ipcMain.handle('search-build-all-indices', () => {
    // Building the index is an orchestration task that projectManager handles
    return projectManager.buildAllIndices();
  });
}

module.exports = { registerIpcHandlers };