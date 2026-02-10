// src/main/ipcHandlers.js
import { ipcMain, app } from 'electron';
import projectManager from './projectManager.js';
import searchManager from './searchManager.js';
import { readSettings, saveSettings } from './settings.js';
import aiManager from './aiManager.js';
/**
 * Registers all IPC handlers for the application.
 * @param {object} sessionRef - A reference object to store session data.
 */
export function registerIpcHandlers(sessionRef) {
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

  // --- Settings Handlers ---
  ipcMain.handle('get-settings', async () => {
    return readSettings();
  });

  ipcMain.handle('save-settings', async (event, settings) => {
    return saveSettings(settings);
  });
  
  // --- UPGRADED: Chat Handler ---
  ipcMain.handle('chat-with-gemini', async (event, messages) => {
    try {
      const settings = await readSettings();
      // Use the generic manager
      return await aiManager.continueChat(messages, settings, event.sender);
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
