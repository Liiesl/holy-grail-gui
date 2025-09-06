// src/main/index.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron'); // Added dialog
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');
const { readSettings, saveSettings } = require('./settings'); // Added this line
const { autoUpdater } = require('electron-updater'); // Added for auto-updates
const log = require('electron-log'); // Recommended for electron-updater logging

let mainWindow;
let sessionRef = { current: {} }; // Use a reference object to hold renderer state
let isAutoUpdateCheck = false; // Flag to differentiate auto vs manual update checks

// --- AutoUpdater Configuration & Logging ---
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// --- AutoUpdater Event Handlers ---
function sendStatusToWindow(status) {
    log.info(status);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', status);
    }
}

autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow({ event: 'checking' });
});

autoUpdater.on('update-available', (info) => {
    sendStatusToWindow({ event: 'available', info });
    if (isAutoUpdateCheck) {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Found',
            message: `A new version (${info.version}) is available. It will be downloaded in the background.`,
            buttons: ['OK']
        });
    }
});

autoUpdater.on('update-not-available', () => {
    sendStatusToWindow({ event: 'not-available' });
});

autoUpdater.on('error', (err) => {
    sendStatusToWindow({ event: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
    sendStatusToWindow({ event: 'progress', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow({ event: 'downloaded', info });
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart the application to apply the updates.`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
    }).then(result => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});


async function createWindow() {
  const settings = await readSettings();
  const session = settings.session || {};

  mainWindow = new BrowserWindow({
    // Use saved bounds or a default
    ...(session.windowBounds || { width: 1000, height: 700 }),
    titleBarStyle: 'hidden', // Hides the title bar but keeps controls
    titleBarOverlay: {
      color: '#191919', // A fallback background color (var(--color-surface-alt))
      symbolColor: '#c2c8e2', // The color of the icons (var(--color-text))
      height: 39 // Must match your CSS height
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

  // --- NEW: Update-related IPC Handlers ---
  ipcMain.on('check-for-updates', () => {
    isAutoUpdateCheck = false; // This is a manual check
    autoUpdater.checkForUpdates();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });
  
  // --- NEW: Auto-update check on startup ---
  if (settings.autoCheckForUpdates !== false) { // Check for explicit false, default to true
    // Wait a bit after the window is ready before checking
    setTimeout(() => {
        isAutoUpdateCheck = true;
        autoUpdater.checkForUpdates();
    }, 5000); 
  }


  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});