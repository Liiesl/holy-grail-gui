// src/main/index.js
const { app, BrowserWindow, ipcMain } = require('electron'); // Add ipcMain
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    // --- KEY CHANGES ---
    frame: false, // Make the window frameless
    // -------------------
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../../icons/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // --- NEW: Listen for window events and notify renderer ---
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-state-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-state-changed', false);
  });
}

app.whenReady().then(() => {
  // Register all IPC handlers for the application
  registerIpcHandlers();

  createWindow();

  // --- Window Control Handlers ---
  ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    mainWindow.close();
  });
  // ------------------------------------

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});