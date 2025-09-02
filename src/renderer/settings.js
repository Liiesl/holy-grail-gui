// src/renderer/settings.js

export class Settings {
  constructor(container) {
    this.container = container;
    this.listeners = {};
    this.render();
    this.initElements();
    this.addEventListeners();
    this.showTab('general'); // Show the first tab by default
  }

  // Simple event emitter
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
              <li data-tab="appearance">Appearance</li>
              <li data-tab="projects">Projects</li>
              <li data-tab="about">About</li>
            </ul>
          </div>
          <div class="settings-content">
            <div id="tab-general" class="tab-content">
              <h2>General Settings</h2>
              
              <div class="settings-form-group">
                <label for="gemini-api-key">Gemini API Key</label>
                <input type="password" id="gemini-api-key" placeholder="Enter your Gemini API Key">
                <p>Your API key is stored locally and is only used to communicate with the Google Gemini API.</p>
              </div>

              <button class="settings-save-btn" id="save-settings-btn">Save Settings</button>
              <span id="save-status" class="save-status"></span>
            </div>
            <div id="tab-appearance" class="tab-content hidden">
              <h2>Appearance</h2>
              <p>Placeholder for theme settings (e.g., Light/Dark mode), font sizes, etc.</p>
            </div>
            <div id="tab-projects" class="tab-content hidden">
                <h2>Project Management</h2>
                <p>Placeholder for managing project locations and settings.</p>
            </div>
            <div id="tab-about" class="tab-content hidden">
                <h2>About</h2>
                <p>Application Name: Hgmd Editor</p>
                <p>Version: 1.0.0</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  initElements() {
    this.geminiApiKeyInput = this.container.querySelector('#gemini-api-key');
    this.saveBtn = this.container.querySelector('#save-settings-btn');
    this.saveStatusEl = this.container.querySelector('#save-status');
  }


  addEventListeners() {
    // NEW: Handle clicking the overlay to close
    this.container.addEventListener('click', (e) => {
      // If the direct target of the click is the overlay itself, not the panel
      if (e.target === this.container) {
        this.emit('closeSettings');
      }
    });

    // Handle closing the settings view with the button
    this.container.querySelector('#settings-close-btn').addEventListener('click', () => {
      this.emit('closeSettings');
    });

    // Handle tab switching
    this.navItems = this.container.querySelectorAll('.settings-nav li');
    this.navItems.forEach(li => {
      li.addEventListener('click', () => this.showTab(li.dataset.tab));
    });

    // Handle saving settings
    this.saveBtn.addEventListener('click', () => this.saveSettings());
  }
  
  async loadCurrentSettings() {
    const settings = await window.api.getSettings();
    this.geminiApiKeyInput.value = settings.geminiApiKey || '';
  }

  async saveSettings() {
    this.saveBtn.disabled = true;
    const settingsToSave = {
      geminiApiKey: this.geminiApiKeyInput.value.trim()
    };
    await window.api.saveSettings(settingsToSave);
    
    this.saveStatusEl.textContent = 'Saved!';
    this.saveBtn.disabled = false;
    setTimeout(() => {
        this.saveStatusEl.textContent = '';
    }, 2500);
  }


  showTab(tabId) {
    // Update active state on nav items
    this.navItems.forEach(li => {
      li.classList.toggle('active', li.dataset.tab === tabId);
    });

    // Show/hide content panels
    this.container.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.toggle('hidden', tab.id !== `tab-${tabId}`);
    });
  }
}