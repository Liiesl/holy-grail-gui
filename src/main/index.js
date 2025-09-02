// src/main/index.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');
const { readSettings, saveSettings } = require('./settings'); // Added this line

let mainWindow;
let sessionRef = { current: {} }; // Use a reference object to hold renderer state

async function createWindow() {
  const settings = await readSettings();
  const session = settings.session || {};

  mainWindow = new BrowserWindow({
    // Use saved bounds or a default
    ...(session.windowBounds || { width: 1000, height: 700 }),
    titleBarStyle: 'hidden', // Hides the title bar but keeps controls
    titleBarOverlay: {
      color: '#2f3241', // A fallback background color (var(--color-surface-alt))
      symbolColor: '#c2c8e2', // The color of the icons (var(--color-text))
      height: 40 // Must match your CSS height
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../../icons/icon.png')
  });

  // Save session on close
  mainWindow.on('close', async (event) => {
    // Prevent the window from closing immediately.
    // This allows our async save operation to complete.
    event.preventDefault(); 
    
    try {
        if (mainWindow) { // Ensure window object exists
            const currentSettings = await readSettings();
            const sessionToSave = {
                ...sessionRef.current,
                windowBounds: mainWindow.getBounds()
            };
            currentSettings.session = sessionToSave;
            await saveSettings(currentSettings);
        }
    } catch (error) {
        console.error('Failed to save session on close:', error);
    } finally {
        // After saving, we must manually close the window.
        // Using destroy() bypasses this 'close' event handler, preventing a loop.
        if (mainWindow) {
            const win = mainWindow; // Capture reference before nulling
            mainWindow = null; // Help with GC and prevent race conditions on fast re-open
            win.destroy();
        }
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  // Pre-load last known session data
  const settings = await readSettings();
  if (settings.session) {
      const { windowBounds, ...rendererSession } = settings.session;
      sessionRef.current = rendererSession;
  }
  // Register all IPC handlers for the application
  registerIpcHandlers(sessionRef);

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});