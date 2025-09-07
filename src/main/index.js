// src/main/index.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron'); // Added dialog
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');
const { readSettings, saveSettings } = require('./settings'); // Added this line
const { autoUpdater } = require('electron-updater'); // Added for auto-updates
const log = require('electron-log'); // Recommended for electron-updater logging
const projectManager = require('./projectManager'); // Import projectManager

let mainWindow;
let sessionRef = { current: {} }; // Use a reference object to hold renderer state
let isAutoUpdateCheck = false; // Flag to differentiate auto vs manual update checks
let availableUpdate = null; // To hold update info if download is not automatic

// --- AutoUpdater Configuration & Logging ---
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false; // <--- ADD THIS LINE

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

autoUpdater.on('update-available', async (info) => {
    const totalSize = info.files.reduce((acc, file) => acc + (file.size || 0), 0);
    const infoWithSize = { ...info, size: totalSize };

    availableUpdate = infoWithSize; // Store the update info with size
    sendStatusToWindow({ event: 'available', info: infoWithSize });

    const settings = await readSettings();
    // Persist update info in case user closes app before downloading
    settings.availableUpdateInfo = infoWithSize;
    await saveSettings(settings);
    
    if (settings.autoDownloadUpdates) {
        autoUpdater.downloadUpdate();
    } else {
        // Send a specific status to renderer to show the download button
        sendStatusToWindow({ event: 'available-not-downloaded', info: infoWithSize });
        if (isAutoUpdateCheck) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Available',
                message: `A new version (${info.version}) is available. You can download it from the Settings > About page.`,
                buttons: ['OK']
            });
        }
    }
});

autoUpdater.on('update-not-available', async () => {
    sendStatusToWindow({ event: 'not-available' });
    // Clear any previously stored update info if the update is no longer available
    const settings = await readSettings();
    if (settings.availableUpdateInfo) {
        settings.availableUpdateInfo = null;
        await saveSettings(settings);
    }
});

autoUpdater.on('error', (err) => {
    sendStatusToWindow({ event: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
    sendStatusToWindow({ event: 'progress', progress: progressObj });
});

autoUpdater.on('update-downloaded', async (info) => {
    const totalSize = info.files.reduce((acc, file) => acc + (file.size || 0), 0);
    const infoWithSize = { ...info, size: totalSize };
    sendStatusToWindow({ event: 'downloaded', info: infoWithSize });
    
    // Clear the persisted update info now that it's downloaded
    const settings = await readSettings();
    settings.availableUpdateInfo = null;
    await saveSettings(settings);
    availableUpdate = null;

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

  // After window is created and ready, handle updates
  mainWindow.webContents.on('did-finish-load', () => {
      // If an update was found previously but not downloaded, notify renderer immediately
      if (settings.availableUpdateInfo) {
          availableUpdate = settings.availableUpdateInfo;
          sendStatusToWindow({ event: 'available-not-downloaded', info: settings.availableUpdateInfo });
      }

      // Now, perform the startup check if enabled
      if (settings.autoCheckForUpdates !== false) {
          setTimeout(() => {
              isAutoUpdateCheck = true;
              autoUpdater.checkForUpdates();
          }, 5000);
      } else if (settings.availableUpdateInfo) {
          // If auto-check is off, but we know an update is available, still show the dialog
          dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Update Available',
              message: `A new version (${settings.availableUpdateInfo.version}) is available. You can download it from the Settings > About page.`,
              buttons: ['OK']
          });
      }
  });
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

  // --- NEW: Build search index on startup ---
  // This is done in the background and does not block window creation.
  projectManager.buildAllIndices().catch(err => {
    console.error("Failed to build search index on startup:", err);
  });

  createWindow();

  // --- Update-related IPC Handlers ---
  ipcMain.on('check-for-updates', () => {
    isAutoUpdateCheck = false; // This is a manual check
    autoUpdater.checkForUpdates();
  });

  ipcMain.on('download-update', () => {
    const startDownload = () => {
        if (availableUpdate) {
            autoUpdater.downloadUpdate();
        } else {
            log.warn('Download requested but no update is available.');
        }
    };

    if (availableUpdate) {
        startDownload();
    } else {
        readSettings().then(settings => {
            if (settings.availableUpdateInfo) {
                availableUpdate = settings.availableUpdateInfo;
                startDownload();
            }
        });
    }
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});