// src/renderer/tabs.js

export class Tabs {
  constructor(container) {
    this.container = container;
    this.tabs = new Map(); // Using a Map to store tab data { project, fileId, title }
    this.activeTabId = null;
    this.listeners = {};
    this.render();
    this.addEventListeners();
  }

  // --- Event Emitter ---
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
      <div class="tabs-container">
        <ul class="tabs-list"></ul>
        <div class="tab-actions">
            <button id="chat-toggle-btn" class="tab-action-btn" title="Toggle AI Chat">💬</button>
            <button id="history-btn" class="tab-action-btn" title="View Page History">📜</button>
            <button id="delete-note-btn" class="tab-action-btn danger" title="Delete Page">🗑️</button>
        </div>
      </div>
    `;
    this.tabsList = this.container.querySelector('.tabs-list');
    this.chatToggleBtn = this.container.querySelector('#chat-toggle-btn');
    this.historyBtn = this.container.querySelector('#history-btn');
    this.deleteNoteBtn = this.container.querySelector('#delete-note-btn');
    this.updateActionButtons(); // Initially disable buttons
  }
  
  addEventListeners() {
    this.tabsList.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab-item');
        if (!tabEl) return;
        
        const tabId = tabEl.dataset.tabId;

        if (e.target.classList.contains('close-tab')) {
            this.emit('tabCloseRequested', { fileId: tabId });
        } else {
            // Instead of emitting 'tabSelected', Tabs now manages its own active state.
            this.setActiveTab(tabId);
        }
    });
    
    // Wire up action buttons
    this.chatToggleBtn.addEventListener('click', () => this.emit('chatToggled'));
    this.historyBtn.addEventListener('click', () => this.emit('historyClicked'));
    this.deleteNoteBtn.addEventListener('click', () => this.emit('deleteClicked'));
  }

  openTab(tabData) {
    if (!this.tabs.has(tabData.fileId)) {
      this.tabs.set(tabData.fileId, tabData);
      const tabEl = document.createElement('li');
      tabEl.className = 'tab-item';
      tabEl.dataset.tabId = tabData.fileId;
      tabEl.innerHTML = `
        <span class="tab-title">${tabData.title}</span>
        <button class="close-tab">&times;</button>
      `;
      this.tabsList.appendChild(tabEl);
    }
    
    this.setActiveTab(tabData.fileId);
  }

  closeTab(fileId) {
    if (!this.tabs.has(fileId)) return;

    const wasActive = this.activeTabId === fileId;

    this.tabs.delete(fileId);
    const tabEl = this.tabsList.querySelector(`.tab-item[data-tab-id="${fileId}"]`);
    if (tabEl) {
        tabEl.remove();
    }
    
    if (wasActive) {
        // The closed tab was active, so we need to select a new one.
        // A simple strategy: select the last tab in the list.
        const remainingTabIds = Array.from(this.tabs.keys());
        const newActiveId = remainingTabIds.length > 0 ? remainingTabIds[remainingTabIds.length - 1] : null;
        this.setActiveTab(newActiveId);
    }
    // If the closed tab was not active, the active tab remains the same, so no further action is needed.
  }
  
  setActiveTab(fileId) {
    if (this.activeTabId === fileId) return;

    // Deactivate old tab
    if (this.activeTabId) {
      const oldTab = this.tabsList.querySelector(`.tab-item[data-tab-id="${this.activeTabId}"]`);
      if (oldTab) oldTab.classList.remove('active');
    }

    // Activate new tab
    const newTab = this.tabsList.querySelector(`.tab-item[data-tab-id="${fileId}"]`);
    if (newTab) {
      newTab.classList.add('active');
      this.activeTabId = fileId;
    } else {
      this.activeTabId = null; // No tab is active if it doesn't exist
    }

    this.updateActionButtons();
    
    // Notify listeners that the active tab has changed.
    this.emit('activeTabChanged', { activeTabId: this.activeTabId });
  }

  updateTabTitle(fileId, newTitle) {
      const tabData = this.tabs.get(fileId);
      if (tabData) {
          tabData.title = newTitle;
          const tabEl = this.tabsList.querySelector(`.tab-item[data-tab-id="${fileId}"] .tab-title`);
          if (tabEl) {
              tabEl.textContent = newTitle;
          }
      }
  }
  
  setTabDirty(fileId, isDirty) {
    const tabEl = this.tabsList.querySelector(`.tab-item[data-tab-id="${fileId}"]`);
    if (tabEl) {
      tabEl.classList.toggle('dirty', isDirty);
    }
  }

  updateActionButtons() {
    const isTabActive = !!this.activeTabId;
    this.historyBtn.disabled = !isTabActive;
    this.deleteNoteBtn.disabled = !isTabActive;
  }
}