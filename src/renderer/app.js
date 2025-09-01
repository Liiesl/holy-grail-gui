// src/renderer/app.js

import { Hgmd } from './editor/hgmd.js';
import { ProjectManager } from './project.js';
import { Sidebar } from './sidebar/sidebar.js';
import { Editor } from './editor/editor.js';
import { Settings } from './settings.js';
import { Titlebar } from './titlebar.js'; // Import the new Titlebar class
import { Chat } from './chat.js'; // Import the new Chat class

class App {
  constructor() {
    this.renderLayout();
    this.initServices();
    this.initComponents();
    this.connectComponents();
    this.start();
  }

  renderLayout() {
    // We add a new container for the chat panel.
    document.getElementById('app').innerHTML = `
      <div id="app-titlebar"></div> 
      <div id="app-view">
        <div id="app-sidebar" class="sidebar"></div>
        <div id="app-main" class="main-content"></div>
        <div id="app-chat" class="chat-panel"></div>
      </div>
      <div id="settings-view" class="hidden"></div>
    `;
  }

  initServices() {
    this.hgmd = new Hgmd();
    this.projectManager = new ProjectManager();
  }

  initComponents() {
    const titlebarContainer = document.getElementById('app-titlebar');
    const sidebarContainer = document.getElementById('app-sidebar');
    const mainContainer = document.getElementById('app-main');
    const settingsContainer = document.getElementById('settings-view');
    const chatContainer = document.getElementById('app-chat');

    this.titlebar = new Titlebar(titlebarContainer); // Initialize the titlebar
    this.sidebar = new Sidebar(this.projectManager, sidebarContainer);
    this.editor = new Editor(this.projectManager, this.hgmd, mainContainer);
    this.settings = new Settings(settingsContainer);
    this.chat = new Chat(chatContainer); // Initialize chat component
  }

  // ... (rest of the file is unchanged) ...
  
  connectComponents() {
    // --- Editor to App connection ---
    this.editor.on('chatToggled', () => {
      document.getElementById('app-view').classList.toggle('chat-visible');
    });

    // --- Sidebar to Editor connections ---

    this.sidebar.on('projectSelected', (project) => {
      const success = this.editor.showWelcomeMessage();
      if (success && project) {
        this.editor.editorEl.innerHTML = 'Select a note or create a new one.';
      } else if (!success) {
        // User cancelled, revert dropdown. This is hard, so we'll just leave it for now.
      }
    });

    this.sidebar.on('fileSelected', async ({ project, file }) => {
      const success = await this.editor.loadNoteContent(project.path, file);
      if (success) {
        this.editor.setCurrentFile(project, file);
        this.sidebar.setCurrentFile(project, file);
      } else {
        // If user cancelled, revert the selection in the sidebar
        this.sidebar.setCurrentFile(project, this.editor.currentFile);
      }
    });
    
    this.sidebar.on('newNoteClicked', (project) => {
      const success = this.editor.clearAndFocus();
      if (success) {
        this.editor.setCurrentFile(project, null);
        this.sidebar.setCurrentFile(project, null);
      }
    });
    
    this.sidebar.on('backToNotes', async () => {
        // This event is fired when switching from history back to files view.
        if (this.editor.isReadOnly) {
            await this.editor.loadNoteContent(this.sidebar.currentProject.path, this.sidebar.currentFile);
            this.editor.setReadOnly(false);
        }
    });
    
    this.sidebar.on('versionSelected', async ({ project, version }) => {
        const content = await this.projectManager.getNoteVersionContent(project.path, version.hash);
        this.editor.displayHistoricalContent(content, version);
        this.editor.setReadOnly(true);
    });

    // --- Editor to Sidebar connections ---

    this.editor.on('dirtyStateChanged', ({ isDirty }) => {
      this.sidebar.setEditorDirty(isDirty);
    });

    this.editor.on('noteSaved', ({ isNew, isRestore }) => {
      if (isNew || isRestore) {
        this.sidebar.refreshFileTree();
      }
      // After save, update sidebar's file state
      this.sidebar.setCurrentFile(this.editor.currentProject, this.editor.currentFile);
      
      if (isRestore) {
        // If it was a restore, exit history mode
        this.sidebar.showProjectView();
      }
    });
    
    this.editor.on('noteDeleted', () => {
        this.sidebar.setCurrentFile(this.sidebar.currentProject, null);
        this.sidebar.refreshFileTree();
    });

    this.editor.on('historyClicked', () => {
      if (this.editor.currentProject && this.editor.currentFile) {
        this.sidebar.showHistoryView();
      }
    });

    // --- View Switching Connections ---
    this.sidebar.on('settingsClicked', () => this.showSettingsView());
    this.settings.on('closeSettings', () => this.showMainView());
  }
  
  showMainView() {
    document.getElementById('app-view').classList.remove('hidden');
    document.getElementById('settings-view').classList.add('hidden');
  }

  async showSettingsView() {
    await this.settings.loadCurrentSettings(); // Load data before showing
    document.getElementById('app-view').classList.add('hidden');
    document.getElementById('settings-view').classList.remove('hidden');
  }

  async start() {
    const appContainer = document.getElementById('app');
    const loader = document.getElementById('loader');
    
    await this.sidebar.loadProjects();
    
    loader.classList.add('hidden');
    appContainer.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});