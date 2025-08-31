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

  // NEW: Version History
  getNoteHistory: (projectPath, filename) => ipcRenderer.invoke('get-note-history', { projectPath, filename }),
  getNoteVersionContent: (projectPath, hash) => ipcRenderer.invoke('get-note-version-content', { projectPath, hash }),

  // REMOVED: The conversion functions are no longer handled by the main process.
});