// src/renderer/tabs.js

export class Tabs {
  // 1. Accept the service in the constructor
  constructor(container, contextMenuService) {
    this.container = container;
    this.contextMenuService = contextMenuService; // Store the service
    this.listeners = {};
    // REMOVED state properties: this.tabs, this.activeTabId
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
    this.updateActionButtons(null); // Initially disable buttons
  }
  
  addEventListeners() {
    this.tabsList.addEventListener('click', (e) => {
        const tabEl = e.target.closest('.tab-item');
        if (!tabEl) return;
        
        const tabId = tabEl.dataset.tabId;

        if (e.target.classList.contains('close-tab')) {
            this.emit('tabCloseRequested', { fileId: tabId });
        } else {
            this.emit('setActiveTabRequested', { fileId: tabId });
        }
    });

    // 2. Add the context menu event listener
    this.tabsList.addEventListener('contextmenu', (e) => {
      const tabEl = e.target.closest('.tab-item');
      if (tabEl) {
        e.preventDefault();
        const tabId = tabEl.dataset.tabId;
        const totalTabs = this.tabsList.childElementCount;

        const menuItems = [
          {
            label: 'Close Tab',
            callback: () => this.emit('tabCloseRequested', { fileId: tabId })
          },
          {
            label: 'Close Other Tabs',
            disabled: totalTabs <= 1,
            callback: () => this.emit('closeOtherTabsRequested', { fileId: tabId })
          }
        ];

        this.contextMenuService.show(e.clientX, e.clientY, menuItems);
      }
    });
    
    // Wire up action buttons
    this.chatToggleBtn.addEventListener('click', () => this.emit('chatToggled'));
    this.historyBtn.addEventListener('click', () => this.emit('historyClicked'));
    this.deleteNoteBtn.addEventListener('click', () => this.emit('deleteClicked'));
  }

  /**
   * NEW: Renders the entire component based on the provided state.
   * @param {{openTabs: Array, activeTabId: string}} state 
   */
  update({ openTabs, activeTabId }) {
    this.tabsList.innerHTML = ''; // Clear existing tabs

    openTabs.forEach(tabData => {
        const tabEl = document.createElement('li');
        tabEl.className = 'tab-item';
        if (tabData.fileId === activeTabId) {
            tabEl.classList.add('active');
        }
        if (tabData.isDirty) {
            tabEl.classList.add('dirty');
        }
        tabEl.dataset.tabId = tabData.fileId;
        tabEl.innerHTML = `
            <span class="tab-title">${tabData.title}</span>
            <button class="close-tab">&times;</button>
        `;
        this.tabsList.appendChild(tabEl);
    });

    this.updateActionButtons(activeTabId);
  }

  // All previous state-mutating methods have been removed:
  // openTab, closeTab, setActiveTab, updateTabTitle, setTabDirty, getAllOpenTabs

  updateActionButtons(activeTabId) {
    const isTabActive = !!activeTabId;
    this.historyBtn.disabled = !isTabActive;
    this.deleteNoteBtn.disabled = !isTabActive;
  }
}