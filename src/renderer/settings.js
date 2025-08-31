// src/renderer/settings.js

export class Settings {
  constructor(container) {
    this.container = container;
    this.listeners = {};
    this.render();
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
              <p>Placeholder for general application settings.</p>
              <p>For example, auto-save options, default project, etc.</p>
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

  addEventListeners() {
    // Handle closing the settings view
    this.container.querySelector('#settings-close-btn').addEventListener('click', () => {
      this.emit('closeSettings');
    });

    // Handle tab switching
    this.navItems = this.container.querySelectorAll('.settings-nav li');
    this.navItems.forEach(li => {
      li.addEventListener('click', () => this.showTab(li.dataset.tab));
    });
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