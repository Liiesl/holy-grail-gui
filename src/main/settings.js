// src/main/settings.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Define the version of the settings structure your current code expects.
// Increment this number whenever you make a breaking change to the settings/session format.
const CURRENT_SETTINGS_VERSION = 'v0.1.26.2';

/**
 * Reads the application settings from the user data directory.
 * @returns {Promise<object>} - The settings object. Returns a default if not found.
 */
async function readSettings() {
  const defaults = {
    settingsVersion: 'v0.0.0.0', // Assume old settings are version 0
    projects: [],
    geminiApiKey: '',
    session: null,
    autoCheckForUpdates: false,
    autoDownloadUpdates: false,
    availableUpdateInfo: null,
  };
  try {
    await fs.access(settingsPath);
    const rawData = await fs.readFile(settingsPath);
    const settings = JSON.parse(rawData.toString());
    
    // Backward compatibility for when settingsVersion was a number or didn't exist
    if (typeof settings.settingsVersion !== 'string' || !settings.settingsVersion.startsWith('v')) {
      settings.settingsVersion = 'v0.0.0.0'; 
    }

    return { ...defaults, ...settings };
  } catch (error) {
    // If the file doesn't exist or is corrupt, return defaults with the LATEST version.
    console.error('Failed to read settings, returning default:', error.message);
    return { ...defaults, settingsVersion: CURRENT_SETTINGS_VERSION };
  }
}

/**
 * Saves the provided settings object to the user data directory.
 * @param {object} settings - The settings object to save.
 */
async function saveSettings(settings) {
  try {
    const currentSettings = await readSettings();
    // Always save with the current version number.
    const newSettings = {
        ...currentSettings,
        ...settings,
        settingsVersion: CURRENT_SETTINGS_VERSION
    };
    await fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

module.exports = { readSettings, saveSettings };