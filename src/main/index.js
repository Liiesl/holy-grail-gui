// src/main/index.js
const { app, BrowserWindow, ipcMain } = require('electron'); // Add ipcMain
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    titleBarStyle: 'hidden', // Hides the title bar but keeps controls
    titleBarOverlay: {
      color: '#2f3241', // A fallback background color (var(--color-surface-alt))
      symbolColor: '#c2c8e2', // The color of the icons (var(--color-text))
      height: 32 // Must match your CSS height
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../../icons/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  // Register all IPC handlers for the application
  registerIpcHandlers();

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});