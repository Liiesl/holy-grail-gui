// src/main/ipcHandlers.js
const { ipcMain } = require('electron');
const projectManager = require('./projectManager');
const { readSettings, saveSettings } = require('./settings'); // Import settings functions
const { generateChatResponse } = require('./gemini'); // Import Gemini function

/**
 * Registers all IPC handlers for the application.
 */
function registerIpcHandlers() {
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
  
  // --- NEW: Gemini Chat Handler ---
  ipcMain.handle('chat-with-gemini', async (event, prompt) => {
    try {
      const settings = await readSettings();
      const response = await generateChatResponse(prompt, settings.geminiApiKey);
      return { success: true, response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerIpcHandlers };