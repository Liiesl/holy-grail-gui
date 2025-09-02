// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Project management
  getProjects: () => ipcRenderer.invoke('get-projects'),
  addProject: () => ipcRenderer.invoke('add-project'),

  // Note management (now project-specific)
  getNotes: (projectPath) => ipcRenderer.invoke('get-notes', projectPath),
  getNoteContent: (projectPath, filename) => ipcRenderer.invoke('get-note-content', { projectPath, filename }),
  saveNote: (note) => ipcRenderer.invoke('save-note', note),
  deleteNote: (projectPath, filename) => ipcRenderer.invoke('delete-note', { projectPath, filename }),

  // Version History
  getNoteHistory: (projectPath, filename) => ipcRenderer.invoke('get-note-history', { projectPath, filename }),
  getNoteVersionContent: (projectPath, hash) => ipcRenderer.invoke('get-note-version-content', { projectPath, hash }),

  // --- Project Actions ---
  untrackProject: (projectPath) => ipcRenderer.invoke('untrack-project', projectPath),
  deleteProject: (projectPath) => ipcRenderer.invoke('delete-project', projectPath),

  // --- Window Controls ---
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // --- Listen for maximize/unmaximize events from main ---
  onWindowMaximizedStateChanged: (callback) => ipcRenderer.on(
    'window-maximized-state-changed', 
    (event, isMaximized) => callback(isMaximized)
  ),

  // --- NEW: Settings ---
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // --- NEW: Gemini Chat ---
  chatWithGemini: (prompt) => ipcRenderer.invoke('chat-with-gemini', prompt),
});