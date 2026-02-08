// src/renderer/settings.js

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export class Settings {
  constructor(container) {
    this.container = container;
    this.listeners = {};
    this.render();
    this.initElements();
    this.addEventListeners();
    this.loadAppVersion();
    this.showTab('general'); 
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="settings-container">
        <div class="settings-header">
          <h1>Settings</h1>
          <button id="settings-close-btn" title="Back to App">&times;</button>
        </div>
        <div class="settings-body">
          <div class="settings-nav">
            <ul>
              <li data-tab="general" class="active">General</li>
              <li data-tab="ai" class="active">AI & Chat</li>
              <li data-tab="appearance">Appearance</li>
              <li data-tab="projects">Projects</li>
              <li data-tab="about">About</li>
            </ul>
          </div>
          <div class="settings-content">
            
            <div id="tab-general" class="tab-content">
              <h2>General Settings</h2>
              <div class="settings-form-group">
                <label style="display: block; font-weight: normal; margin-bottom: 10px;">
                    <input type="checkbox" id="auto-check-updates" style="margin-right: 8px;">
                    Automatically check for updates on startup
                </label>
                <label style="display: block; font-weight: normal; margin-bottom: 0;">
                    <input type="checkbox" id="auto-download-updates" style="margin-right: 8px;">
                    Automatically download updates when found
                </label>
              </div>
            </div>

            <div id="tab-ai" class="tab-content hidden">
              <h2>AI Configuration</h2>
              
              <div class="settings-form-group">
                <label for="ai-provider">AI Provider</label>
                <select id="ai-provider" style="width: 100%; max-width: 500px; padding: 8px; border-radius: 6px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text);">
                    <option value="gemini">Google Gemini</option>
                    <option value="mistral">Mistral AI</option>
                </select>
              </div>

              <div id="config-gemini" class="provider-config">
                  <div class="settings-form-group">
                    <label for="gemini-api-key">Gemini API Key</label>
                    <input type="password" id="gemini-api-key" placeholder="Enter your Gemini API Key">
                    <p>Get your key from Google AI Studio.</p>
                  </div>
              </div>

              <div id="config-mistral" class="provider-config hidden">
                  <div class="settings-form-group">
                    <label for="mistral-api-key">Mistral API Key</label>
                    <input type="password" id="mistral-api-key" placeholder="Enter your Mistral API Key">
                    <p>Get your key from console.mistral.ai.</p>
                  </div>
              </div>

              <div class="settings-form-group" style="margin-top: 30px; border-top: 1px solid var(--color-border); padding-top: 20px;">
                <p><strong>Note:</strong> API keys are stored locally on your device.</p>
              </div>
            </div>

            <div id="tab-appearance" class="tab-content hidden">
              <h2>Appearance</h2>
              <p>Placeholder for theme settings.</p>
            </div>
            <div id="tab-projects" class="tab-content hidden">
                <h2>Project Management</h2>
                <p>Placeholder for managing project locations and settings.</p>
            </div>
            <div id="tab-about" class="tab-content hidden">
                <h2>About</h2>
                <p>Application Name: Hgmd Editor</p>
                <p id="app-version">Version: ...</p>
                <hr style="margin: 20px 0; border-color: var(--color-border);">
                <h2>Updates</h2>
                <div id="update-info">
                  <p id="update-status-text">Check for the latest version.</p>
                  <div id="update-progress-container" class="hidden">
                    <div id="update-progress-bar"></div>
                  </div>
                </div>
                <div id="update-controls" style="margin-top: 15px;">
                    <button id="check-for-updates-btn" class="settings-save-btn">Check for Updates</button>
                    <button id="download-update-btn" class="settings-save-btn hidden">Download Update</button>
                    <button id="install-update-btn" class="settings-save-btn hidden">Restart & Install</button>
                </div>
            </div>

            <!-- Save button is global for the panel now -->
            <div style="margin-top: 20px; border-top: 1px solid var(--color-border); padding-top: 20px;">
                <button class="settings-save-btn" id="save-settings-btn">Save All Settings</button>
                <span id="save-status" class="save-status"></span>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  initElements() {
    this.aiProviderSelect = this.container.querySelector('#ai-provider');
    this.geminiApiKeyInput = this.container.querySelector('#gemini-api-key');
    this.mistralApiKeyInput = this.container.querySelector('#mistral-api-key');
    
    this.configGemini = this.container.querySelector('#config-gemini');
    this.configMistral = this.container.querySelector('#config-mistral');

    this.autoCheckUpdatesCheckbox = this.container.querySelector('#auto-check-updates');
    this.autoDownloadUpdatesCheckbox = this.container.querySelector('#auto-download-updates');
    this.saveBtn = this.container.querySelector('#save-settings-btn');
    this.saveStatusEl = this.container.querySelector('#save-status');

    this.updateStatusText = this.container.querySelector('#update-status-text');
    this.updateProgressContainer = this.container.querySelector('#update-progress-container');
    this.updateProgressBar = this.container.querySelector('#update-progress-bar');
    this.checkForUpdatesBtn = this.container.querySelector('#check-for-updates-btn');
    this.downloadUpdateBtn = this.container.querySelector('#download-update-btn');
    this.installUpdateBtn = this.container.querySelector('#install-update-btn');
  }

  addEventListeners() {
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.emit('closeSettings');
      }
    });

    this.container.querySelector('#settings-close-btn').addEventListener('click', () => {
      this.emit('closeSettings');
    });

    this.navItems = this.container.querySelectorAll('.settings-nav li');
    this.navItems.forEach(li => {
      li.addEventListener('click', () => this.showTab(li.dataset.tab));
    });

    this.saveBtn.addEventListener('click', () => this.saveSettings());
    
    // Toggle Provider Views
    this.aiProviderSelect.addEventListener('change', () => {
        this.updateProviderVisibility();
    });

    // Updates
    this.checkForUpdatesBtn.addEventListener('click', () => window.api.checkForUpdates());
    this.downloadUpdateBtn.addEventListener('click', () => {
        window.api.downloadUpdate();
        this.downloadUpdateBtn.classList.add('hidden');
    });
    this.installUpdateBtn.addEventListener('click', () => window.api.installUpdate());
    window.api.onUpdateStatus((status) => this.handleUpdateStatus(status));
  }
  
  updateProviderVisibility() {
      const provider = this.aiProviderSelect.value;
      if (provider === 'gemini') {
          this.configGemini.classList.remove('hidden');
          this.configMistral.classList.add('hidden');
      } else {
          this.configGemini.classList.add('hidden');
          this.configMistral.classList.remove('hidden');
      }
  }

  async loadCurrentSettings() {
    const settings = await window.api.getSettings();
    
    // AI Settings
    this.aiProviderSelect.value = settings.aiProvider || 'gemini';
    this.geminiApiKeyInput.value = settings.geminiApiKey || '';
    this.mistralApiKeyInput.value = settings.mistralApiKey || '';
    this.updateProviderVisibility();

    // General
    this.autoCheckUpdatesCheckbox.checked = settings.autoCheckForUpdates !== false;
    this.autoDownloadUpdatesCheckbox.checked = settings.autoDownloadUpdates === true;
  }

  async saveSettings() {
    this.saveBtn.disabled = true;
    const settingsToSave = {
      // AI
      aiProvider: this.aiProviderSelect.value,
      geminiApiKey: this.geminiApiKeyInput.value.trim(),
      mistralApiKey: this.mistralApiKeyInput.value.trim(),
      // General
      autoCheckForUpdates: this.autoCheckUpdatesCheckbox.checked,
      autoDownloadUpdates: this.autoDownloadUpdatesCheckbox.checked
    };
    await window.api.saveSettings(settingsToSave);
    
    this.saveStatusEl.textContent = 'Saved!';
    this.saveBtn.disabled = false;
    setTimeout(() => {
        this.saveStatusEl.textContent = '';
    }, 2500);
  }

  async loadAppVersion() {
    const version = await window.api.getAppVersion();
    const versionEl = this.container.querySelector('#app-version');
    if (versionEl) {
        versionEl.textContent = `Version: ${version}`;
    }
  }

  handleUpdateStatus(status) {
    this.checkForUpdatesBtn.classList.remove('hidden');
    this.checkForUpdatesBtn.style.display = 'inline-block';
    this.downloadUpdateBtn.classList.add('hidden');
    this.installUpdateBtn.classList.add('hidden');
    this.updateProgressContainer.classList.add('hidden');
    this.checkForUpdatesBtn.disabled = false;

    const formattedSize = status.info && status.info.size ? `(${formatBytes(status.info.size)})` : '';

    switch (status.event) {
        case 'checking':
            this.updateStatusText.textContent = 'Checking for updates...';
            this.checkForUpdatesBtn.disabled = true;
            break;
        case 'available-not-downloaded':
            this.updateStatusText.textContent = `A new version (${status.info.version}) is available. ${formattedSize}`;
            this.downloadUpdateBtn.classList.remove('hidden');
            this.checkForUpdatesBtn.style.display = 'none';
            break;
        case 'available': 
            this.updateStatusText.textContent = `A new version (${status.info.version}) is available. Downloading... ${formattedSize}`;
            this.checkForUpdatesBtn.disabled = true;
            this.checkForUpdatesBtn.style.display = 'none';
            break;
        case 'not-available':
            this.updateStatusText.textContent = 'You are on the latest version.';
            break;
        case 'progress':
            this.updateProgressContainer.classList.remove('hidden');
            this.updateProgressBar.style.width = `${status.progress.percent.toFixed(2)}%`;
            const transferred = formatBytes(status.progress.transferred);
            const total = formatBytes(status.progress.total);
            this.updateStatusText.textContent = `Downloading... ${transferred} / ${total} (${status.progress.percent.toFixed(0)}%)`;
            this.checkForUpdatesBtn.style.display = 'none';
            break;
        case 'downloaded':
            this.updateStatusText.textContent = `Update downloaded. Version ${status.info.version} ${formattedSize} is ready to be installed.`;
            this.installUpdateBtn.classList.remove('hidden');
            this.checkForUpdatesBtn.style.display = 'none';
            this.updateProgressContainer.classList.add('hidden');
            break;
        case 'error':
            this.updateStatusText.textContent = `Error during update: ${status.error}`;
            break;
    }
  }

  showTab(tabId) {
    this.navItems.forEach(li => {
      li.classList.toggle('active', li.dataset.tab === tabId);
    });
    this.container.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.toggle('hidden', tab.id !== `tab-${tabId}`);
    });
  }
}