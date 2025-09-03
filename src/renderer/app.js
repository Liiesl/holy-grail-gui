// src/renderer/app.js

import { Hgmd } from './editor/hgmd.js';
import { ProjectManager } from './project.js';
import { Sidebar } from './sidebar/sidebar.js';
import { Editor } from './editor/editor.js';
import { Settings } from './settings.js';
import { Titlebar } from './titlebar.js';
import { Chat } from './chat.js';
import { Tabs } from './tabs.js'; // Import the new Tabs class

class App {
  constructor() {
    this.editors = new Map(); // fileId -> { editor, container, project }
    this.activeFileId = null;

    this.renderLayout();
    this.initServices();
    this.initComponents();
    this.connectComponents();
    this.start();
    this.handleEscKey = this.handleEscKey.bind(this);
  }

  renderLayout() {
    document.getElementById('app').innerHTML = `
      <div id="app-titlebar"></div> 
      <div id="app-view">
        <div id="app-sidebar" class="sidebar"></div>
        <div id="app-main" class="main-content">
          <div id="app-tabs"></div>
          <div id="app-editors-wrapper">
             <div id="welcome-message" class="editor-instance">
                <p>Select a page to begin, or create a new one.</p>
             </div>
          </div>
        </div>
        <div id="app-chat" class="chat-panel"></div>
      </div>
      <div id="settings-modal" class="settings-overlay"></div>
    `;
  }

  initServices() {
    this.hgmd = new Hgmd();
    this.projectManager = new ProjectManager();
  }

  initComponents() {
    const titlebarContainer = document.getElementById('app-titlebar');
    const sidebarContainer = document.getElementById('app-sidebar');
    const settingsContainer = document.getElementById('settings-modal');
    const chatContainer = document.getElementById('app-chat');
    const tabsContainer = document.getElementById('app-tabs');
    
    this.editorsWrapper = document.getElementById('app-editors-wrapper');
    this.welcomeMessageEl = document.getElementById('welcome-message');

    this.titlebar = new Titlebar(titlebarContainer);
    this.sidebar = new Sidebar(this.projectManager, sidebarContainer);
    this.tabs = new Tabs(tabsContainer);
    this.settings = new Settings(settingsContainer);
    this.chat = new Chat(chatContainer);
  }

  // Helper to get the currently active editor instance
  getActiveEditor() {
    return this.activeFileId ? this.editors.get(this.activeFileId)?.editor : null;
  }

  connectComponents() {
    // --- Titlebar to App connections ---
    this.titlebar.container.addEventListener('sidebarToggle', () => {
      const isCollapsed = document.getElementById('app-view').classList.toggle('sidebar-collapsed');
      document.getElementById('app-titlebar').classList.toggle('sidebar-collapsed', isCollapsed);
      this.updateSession();
    });

    this.titlebar.container.addEventListener('modeChange', (e) => {
      const mode = e.detail.mode;
      const editor = this.getActiveEditor();
      if (!editor) return;

      if (mode === 'project') {
        this.sidebar.showProjectView();
      } else if (mode === 'pageHistory') {
        this.sidebar.showHistoryView();
      }
    });

    this.titlebar.container.addEventListener('projectChange', (e) => {
        this.handleProjectSelection(e.detail.path);
    });
    
    this.titlebar.container.addEventListener('projectAction', async (e) => {
        const { action, path } = e.detail;

        if (action === 'add_new_project') {
            const projectsBefore = this.sidebar.projects.length;
            const updatedProjects = await this.projectManager.addProject();
            if (updatedProjects && updatedProjects.length > projectsBefore) {
                await this.refreshProjects();
            }
        } else if (action === 'untrack_project') {
            await this.projectManager.untrackProject(path);
            await this.refreshProjects();
        } else if (action === 'delete_project') {
            const result = await this.projectManager.deleteProject(path);
            if (result.success) {
                await this.refreshProjects();
            }
        }
    });

    // --- Tabs to App/Editor connections ---
    this.tabs.on('activeTabChanged', ({ activeTabId }) => {
      this.setActiveEditor(activeTabId);
    });

    this.tabs.on('tabCloseRequested', ({ fileId }) => {
      this.closeTab(fileId);
    });

    this.tabs.on('chatToggled', () => {
      document.getElementById('app-view').classList.toggle('chat-visible');
      this.updateSession();
    });
    
    this.tabs.on('historyClicked', () => {
        const editor = this.getActiveEditor();
        if (editor) {
            this.sidebar.showHistoryView();
            this.titlebar.setActiveMode('pageHistory');
        }
    });

    this.tabs.on('deleteClicked', async () => {
        const editorInstance = this.editors.get(this.activeFileId);
        if (editorInstance) {
            const { project, editor } = editorInstance;
            const fileId = editor.currentFile;
            const name = this.sidebar.getFileName(project.path, fileId);

            const confirmed = confirm(`Are you sure you want to delete "${name || fileId}"? This action cannot be undone.`);
            if (confirmed) {
                await this.projectManager.deleteNote(project.path, fileId);
                // The closeTab will handle UI cleanup, and it gets called by the sidebar's delete handler
            }
        }
    });
    

    // --- Sidebar to App/Other Components connections ---
    this.sidebar.on('fileSelected', async ({ project, file }) => {
      await this.openOrFocusFile(project, file);
    });

    this.sidebar.on('currentFileChanged', ({ hasFile }) => {
        this.titlebar.setHistoryModeAvailable(hasFile);
        if (!hasFile) {
            this.sidebar.showProjectView();
            this.titlebar.setActiveMode('project');
        }
    });

    this.sidebar.on('createNote', async ({ project, name, parentId }) => {
      const result = await this.projectManager.createNote(project.path, name, parentId);
      if (result.success) {
        await this.sidebar.refreshFileTree();
        await this.openOrFocusFile(project, result.note.id);
      } else {
        alert(`Error creating page: ${result.error || 'Unknown error'}`);
      }
    });
    
    this.sidebar.on('renameNote', async ({ project, id, newName }) => {
        const result = await this.projectManager.renameNote(project.path, id, newName);
        if (result.success) {
            await this.sidebar.refreshFileTree();
            // Update tab title if it's open
            if(this.editors.has(id)) {
                this.tabs.updateTabTitle(id, newName);
            }
        } else {
            alert(`Error renaming page: ${result.error || 'Unknown error'}`);
            await this.sidebar.refreshFileTree();
        }
    });

    this.sidebar.on('deleteNoteRequested', async ({ project, file }) => {
      const confirmed = confirm(`Are you sure you want to delete this file? This action cannot be undone.`);
      if (confirmed) {
        const result = await this.projectManager.deleteNote(project.path, file);
        if (result.success) {
          this.closeTab(file, true); // Force close without confirmation
          this.sidebar.refreshFileTree();
        } else {
          alert(`Error deleting note: ${result.error || 'Unknown error'}`);
        }
      }
    });

    // --- View Switching Connections ---
    this.sidebar.on('settingsClicked', () => this.showSettingsView());
    this.settings.on('closeSettings', () => this.showMainView());
  }

  async openOrFocusFile(project, fileId) {
    // If the editor for this file doesn't exist yet, create it.
    if (!this.editors.has(fileId)) {
        // --- Create a new editor instance ---
        const editorContainer = document.createElement('div');
        editorContainer.className = 'editor-instance';
        this.editorsWrapper.appendChild(editorContainer);
        
        const newEditor = new Editor(this.projectManager, this.hgmd, editorContainer);
        this.editors.set(fileId, { editor: newEditor, container: editorContainer, project: project });

        // --- Connect events for the new editor ---
        newEditor.on('dirtyStateChanged', ({ isDirty }) => {
            this.tabs.setTabDirty(fileId, isDirty);
        });
        
        newEditor.on('noteSaved', () => {
            // After saving, the sidebar might need to know about the current file state.
            this.sidebar.setCurrentFile(project, fileId);
        });

        // --- Load content and update UI ---
        const loadSuccess = await newEditor.loadNoteContent(project.path, fileId);
        if (loadSuccess) {
            newEditor.setCurrentFile(project, fileId);
        } else {
            // Cleanup if loading failed (e.g., file deleted externally)
            this.editors.delete(fileId);
            editorContainer.remove();
            return; // Abort opening
        }
    }

    // Now that the editor is guaranteed to exist, open/focus the tab.
    // This will trigger the 'activeTabChanged' event, which in turn calls setActiveEditor.
    const fileName = this.sidebar.getFileName(project.path, fileId);
    this.tabs.openTab({ fileId: fileId, title: fileName || 'Untitled', project: project });
  }
  
  // This method now ONLY handles editor visibility, not tab state.
  setActiveEditor(fileId) {
    if (this.activeFileId === fileId) return;

    this.activeFileId = fileId;

    // Hide all editor containers
    this.editors.forEach((instance) => {
        instance.container.style.display = 'none';
    });
    
    this.welcomeMessageEl.style.display = 'none';

    if (fileId && this.editors.has(fileId)) {
      // Show the selected editor's container
      const activeInstance = this.editors.get(fileId);
      activeInstance.container.style.display = 'block';
      this.sidebar.setCurrentFile(activeInstance.project, fileId);
    } else {
      // If no fileId or instance, show welcome message
      this.welcomeMessageEl.style.display = 'block';
      this.sidebar.setCurrentFile(null, null);
    }

    this.titlebar.setHistoryModeAvailable(!!fileId);
    this.updateSession();
  }
  
  closeTab(fileId, force = false) {
    const instance = this.editors.get(fileId);
    if (!instance) return;

    if (!force) {
        if (!instance.editor.confirmDiscardChanges()) {
            return; // User cancelled
        }
    }

    // Cleanup editor instance
    instance.container.remove();
    this.editors.delete(fileId);

    // Tell Tabs component to close the tab. It will handle activating the next one
    // and emitting 'activeTabChanged', which our listener will catch to update the editor view.
    this.tabs.closeTab(fileId);
  }
  
  async handleProjectSelection(projectPath) {
    // Logic remains mostly the same
    if (projectPath === "") {
      this.sidebar.displayProject(null);
      this.titlebar.setCurrentProjectName(null);
      this.titlebar.updateProjectList(this.sidebar.projects, null);
    } else {
      const project = this.sidebar.projects.find(p => p.path === projectPath);
      if (project) {
        this.sidebar.displayProject(project);
        this.titlebar.setCurrentProjectName(project.name);
        this.titlebar.updateProjectList(this.sidebar.projects, project.path);
        this.updateSession();
      }
    }
  }

  async refreshProjects() {
    const currentProjectPath = this.sidebar.currentProject?.path;
    await this.sidebar.loadProjects();
    const currentProjectStillExists = currentProjectPath && this.sidebar.projects.some(p => p.path === currentProjectPath);

    if (currentProjectStillExists) {
        this.titlebar.updateProjectList(this.sidebar.projects, currentProjectPath);
    } else {
        this.sidebar.displayProject(null);
        this.titlebar.setCurrentProjectName(null);
        this.titlebar.updateProjectList(this.sidebar.projects, null);
        // FUTURE: Close all tabs belonging to the deleted/untracked project
    }
  }

  updateSession() {
    const sessionData = {
        lastProjectPath: this.sidebar.currentProject?.path || null,
        // FUTURE: could save all open tabs here. For now, just the active one.
        lastOpenFileId: this.activeFileId || null,
        sidebarCollapsed: document.getElementById('app-view').classList.contains('sidebar-collapsed'),
        chatVisible: document.getElementById('app-view').classList.contains('chat-visible'),
    };
    window.api.updateSessionData(sessionData);
  }

  async restoreSession(session) {
    if (session.sidebarCollapsed) {
      document.getElementById('app-view').classList.add('sidebar-collapsed');
      document.getElementById('app-titlebar').classList.add('sidebar-collapsed');
    }
    if (session.chatVisible) {
      document.getElementById('app-view').classList.add('chat-visible');
    }

    if (session.lastProjectPath) {
      const projectExists = this.sidebar.projects.some(p => p.path === session.lastProjectPath);
      if (projectExists) {
        await this.handleProjectSelection(session.lastProjectPath);
        if (session.lastOpenFileId) {
            const project = this.sidebar.currentProject;
            // openOrFocusFile handles creating the editor and tab
            await this.openOrFocusFile(project, session.lastOpenFileId);
        }
      }
    }
  }

  handleEscKey(e) {
    if (e.key === 'Escape') {
      this.showMainView();
    }
  }

  showMainView() {
    document.getElementById('app').classList.remove('modal-open');
    document.getElementById('settings-modal').classList.remove('visible');
    window.removeEventListener('keydown', this.handleEscKey);
  }

  async showSettingsView() {
    await this.settings.loadCurrentSettings();
    document.getElementById('app').classList.add('modal-open');
    document.getElementById('settings-modal').classList.add('visible');
    window.addEventListener('keydown', this.handleEscKey);
  }

  async start() {
    const appContainer = document.getElementById('app');
    const loader = document.getElementById('loader');

    const settings = await window.api.getSettings();
    const session = settings.session;
    
    await this.sidebar.loadProjects();
    this.titlebar.updateProjectList(this.sidebar.projects, null);

    if (session) {
      await this.restoreSession(session);
    }

    loader.classList.add('hidden');
    appContainer.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});