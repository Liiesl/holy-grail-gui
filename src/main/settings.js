// src/main/settings.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

/**
 * Reads the application settings from the user data directory.
 * @returns {Promise<object>} - The settings object. Returns a default if not found.
 */
async function readSettings() {
  const defaults = {
    projects: [],
    geminiApiKey: '',
    session: null,
    autoCheckForUpdates: false, // Default setting for auto-updates
  };
  try {
    await fs.access(settingsPath);
    const rawData = await fs.readFile(settingsPath);
    const settings = JSON.parse(rawData.toString());
    // Merge defaults to ensure new settings are present
    return { ...defaults, ...settings };
  } catch (error) {
    console.error('Failed to read settings, returning default:', error.message);
    return defaults;
  }
}

/**
 * Saves the provided settings object to the user data directory.
 * @param {object} settings - The settings object to save.
 */
async function saveSettings(settings) {
  try {
    // Before saving, read existing settings to not overwrite unrelated ones
    const currentSettings = await readSettings();
    const newSettings = { ...currentSettings, ...settings };
    await fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

module.exports = { readSettings, saveSettings };