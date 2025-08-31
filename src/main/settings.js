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
  try {
    await fs.access(settingsPath);
    const rawData = await fs.readFile(settingsPath);
    return JSON.parse(rawData.toString());
  } catch (error) {
    console.error('Failed to read settings, returning default:', error.message);
    return { projects: [] };
  }
}

/**
 * Saves the provided settings object to the user data directory.
 * @param {object} settings - The settings object to save.
 */
async function saveSettings(settings) {
  try {
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

module.exports = { readSettings, saveSettings };