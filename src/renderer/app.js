// src/renderer/app.js

import { Hgmd } from './editor/hgmd.js';
// 1. Import the new state service
import { ProjectStateService } from './project.js';
import { Sidebar } from './sidebar/sidebar.js';
import { Editor } from './editor/editor.js';
import { Settings } from './settings.js';
import { Titlebar } from './titlebar.js';
import { Chat } from './chat.js';
import { Tabs } from './tabs.js';
import { SearchModal } from './search-modal.js';
import { ContextMenuService } from './context-menu.js'; // 1. Import the new service

class App {
  constructor() {
    this.editors = new Map();
    // REMOVED: this.activeFileId = null;

    this.renderLayout();
    // 2. Instantiate the service FIRST, as it's the source of truth
    this.projectState = new ProjectStateService(); 
    this.initServices();
    this.initComponents();
    this.connectComponents();
    // 3. Add a new step to bind to state changes
    this.bindStateListeners(); 
    this.start();
    this.handleEscKey = this.handleEscKey.bind(this);
  }

  // Helper getter for convenience
  get activeFileId() {
    return this.projectState.activeTabId;
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
      <div id="search-modal" class="search-overlay"></div>
      <div id="context-menu-container"></div> <!-- 2. Add a container for the menu -->
    `;
  }

  initServices() {
    this.hgmd = new Hgmd();
    // this.projectManager is now this.projectState
    const contextMenuContainer = document.getElementById('context-menu-container');
    this.contextMenuService = new ContextMenuService(contextMenuContainer);
  }

  initComponents() {
    const titlebarContainer = document.getElementById('app-titlebar');
    const sidebarContainer = document.getElementById('app-sidebar');
    const settingsContainer = document.getElementById('settings-modal');
    const chatContainer = document.getElementById('app-chat');
    const tabsContainer = document.getElementById('app-tabs');
    const searchContainer = document.getElementById('search-modal');
    
    this.editorsWrapper = document.getElementById('app-editors-wrapper');
    this.welcomeMessageEl = document.getElementById('welcome-message');

    this.titlebar = new Titlebar(titlebarContainer);
    // 4. Pass the new service to components that need it
    // The Editor and SearchModal also need it to perform actions
    this.sidebar = new Sidebar(this.projectState, sidebarContainer, this.contextMenuService); 
    this.tabs = new Tabs(tabsContainer, this.contextMenuService);
    this.settings = new Settings(settingsContainer);
    this.chat = new Chat(chatContainer);
    this.searchModal = new SearchModal(this.projectState, searchContainer);
  }

  // Helper to get the currently active editor instance
  getActiveEditor() {
    return this.activeFileId ? this.editors.get(this.activeFileId)?.editor : null;
  }
  // 5. NEW: A dedicated place for reacting to state changes
  bindStateListeners() {
    this.projectState.on('projects-changed', ({ projects }) => {
        const currentPath = this.projectState.activeProject?.path;
        this.titlebar.updateProjectList(projects, currentPath);
    });

    this.projectState.on('active-project-changed', ({ project }) => {
        this.sidebar.displayProject(project);
        this.titlebar.setCurrentProjectName(project?.name);
        this.titlebar.updateProjectList(this.projectState.projects, project?.path);
    });

    // The logic for closing tabs when a project/note is removed is now handled
    // internally by the ProjectStateService. This component just needs to react
    // to the final `tabs-changed` event.

    // NEW: The primary driver for UI updates related to tabs and editors.
    this.projectState.on('tabs-changed', ({ openTabs, activeTabId }) => {
        // 1. Update the visual tabs component
        this.tabs.update({ openTabs, activeTabId });

        // 2. Update the visible editor pane
        this.setActiveEditor(activeTabId);

        // 3. Clean up any editor instances that are no longer needed
        const openFileIds = new Set(openTabs.map(t => t.fileId));
        for (const fileId of this.editors.keys()) {
            if (!openFileIds.has(fileId)) {
                const instance = this.editors.get(fileId);
                instance.container.remove();
                this.editors.delete(fileId);
            }
        }
    });
  }


  connectComponents() {
    // ... connections for titlebar, etc.
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
    // 6. Update handlers to call the state service instead of managing state directly
    this.titlebar.container.addEventListener('projectChange', (e) => {
        // DISPATCH action to the service
        this.projectState.setActiveProject(e.detail.path);
    });

    this.titlebar.container.addEventListener('projectAction', async (e) => {
        const { action, path } = e.detail;
        // DISPATCH actions to the service
        if (action === 'add_new_project') {
            await this.projectState.addProject();
        } else if (action === 'untrack_project') {
            await this.projectState.untrackProject(path);
        } else if (action === 'delete_project') {
            await this.projectState.deleteProject(path);
        }
    });
    
    // --- Tabs to App/Editor connections ---
    this.tabs.on('setActiveTabRequested', ({ fileId }) => {
        this.projectState.setActiveTab(fileId);
    });

    this.tabs.on('tabCloseRequested', ({ fileId }) => {
        const instance = this.editors.get(fileId);
        // Check for unsaved changes before dispatching the close action
        if (instance && !instance.editor.confirmDiscardChanges()) {
            return; // User cancelled
        }
        this.projectState.closeTab(fileId);
    });
    
    this.tabs.on('closeOtherTabsRequested', ({ fileId }) => {
        let canClose = true;
        for (const [id, instance] of this.editors.entries()) {
            if (id !== fileId && instance.editor.isDirty) {
                if (!instance.editor.confirmDiscardChanges()) {
                    canClose = false;
                    break;
                }
            }
        }
        if (canClose) {
            this.projectState.closeOtherTabs(fileId);
        }
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
            const name = this.sidebar.getFileName(fileId);

            const confirmed = confirm(`Are you sure you want to delete "${name || fileId}"? This action cannot be undone.`);
            if (confirmed) {
                // DISPATCH action to the service
                await this.projectState.deleteNote(project.path, fileId);
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
      // DISPATCH action to the service
      const result = await this.projectState.createNote({ projectPath: project.path, name, parentId });
      if (result.success) {
        // We no longer need to manually refresh the sidebar. The 'notes-changed' event handles it.
        await this.openOrFocusFile(project, result.note.id);
      } else {
        alert(`Error creating page: ${result.error || 'Unknown error'}`);
      }
    });
    
    this.sidebar.on('renameNote', async ({ project, id, newName }) => {
        // DISPATCH action to the service
        const result = await this.projectState.renameNote(project.path, id, newName);
        if (!result.success) {
            alert(`Error renaming page: ${result.error || 'Unknown error'}`);
            // The sidebar will auto-refresh from the 'notes-changed' event,
            // or we could force a refresh on failure.
            await this.sidebar.refreshFileTree(); 
        }
    });

    this.sidebar.on('deleteNoteRequested', async ({ project, file }) => {
      const confirmed = confirm(`Are you sure you want to delete this file? This action cannot be undone.`);
      if (confirmed) {
        // DISPATCH action to the service
        const result = await this.projectState.deleteNote(project.path, file);
        if (!result.success) {
          alert(`Error deleting note: ${result.error || 'Unknown error'}`);
        }
        // The 'note-deleted' event will close the tab automatically via the state service.
      }
    });
    this.sidebar.on('searchInitiated', ({ project }) => {
        let context = {};
        if (project) {
            context = {
                projectPath: project.path,
                projectName: project.name,
            };
        }
        this.openSearchModal(context);
    });
    // --- View Switching Connections ---
    this.sidebar.on('settingsClicked', () => this.showSettingsView());
    this.settings.on('closeSettings', () => this.showMainView());
    
    // --- NEW: Search Modal Connection ---
    this.searchModal.on('resultSelected', async ({ type, metadata }) => {
        this.searchModal.hide();
        if (type === 'page' || type === 'content_line') {
            await this.projectState.setActiveProject(metadata.projectPath);
            const project = this.projectState.activeProject;
            await this.openOrFocusFile(project, metadata.noteId);
        } else if (type === 'project') {
            await this.projectState.setActiveProject(metadata.projectPath);
        }
    });
  }

  // Helper to create an editor without opening a tab, used for session restore
  async ensureEditorExists(project, fileId) {
    if (this.editors.has(fileId)) return true;

    const editorContainer = document.createElement('div');
    editorContainer.className = 'editor-instance';
    this.editorsWrapper.appendChild(editorContainer);
    
    const newEditor = new Editor(this.projectState, this.hgmd, editorContainer);
    this.editors.set(fileId, { editor: newEditor, container: editorContainer, project: project });

    newEditor.on('dirtyStateChanged', ({ isDirty }) => {
        this.projectState.setTabDirty({ fileId, isDirty });
    });
    
    newEditor.on('noteSaved', () => {
        this.sidebar.setCurrentFile(project, fileId);
    });

    const loadSuccess = await newEditor.loadNoteContent(project.path, fileId);
    if (loadSuccess) {
        newEditor.setCurrentFile(project, fileId);
        return true;
    } else {
        this.editors.delete(fileId);
        editorContainer.remove();
        return false;
    }
  }

  async openOrFocusFile(project, fileId) {
    // If the editor for this file doesn't exist yet, create it.
    await this.ensureEditorExists(project, fileId);

    // Now that the editor is guaranteed to exist, tell the state service to open/focus the tab.
    // This will trigger the 'tabs-changed' event, which handles all subsequent UI updates.
    this.projectState.openTab({ projectPath: project.path, fileId });
  }

  // This method now ONLY handles editor visibility, driven by state changes.
  setActiveEditor(fileId) {
    // Hide or show each editor instance based on the active fileId
    this.editors.forEach((instance, id) => {
        const shouldBeVisible = id === fileId;
        // Use 'flex' to match the intended layout from CSS, and 'none' to hide.
        instance.container.style.display = shouldBeVisible ? 'flex' : 'none';
    });

    if (fileId && this.editors.has(fileId)) {
      // If an editor is active, hide the welcome message
      this.welcomeMessageEl.style.display = 'none';
      const activeInstance = this.editors.get(fileId);
      this.sidebar.setCurrentFile(activeInstance.project, fileId);
    } else {
      // If no editor is active, show the welcome message
      this.welcomeMessageEl.style.display = 'flex';
      this.sidebar.setCurrentFile(null, null);
    }

    this.titlebar.setHistoryModeAvailable(!!fileId);
    this.updateSession();
  }
  
  // REMOVED `closeTab`. Logic is now in state service and `tabs-changed` listener.
  // REMOVED `handleProjectSelection`. Logic is now `projectState.setActiveProject`.

  updateSession() {
    const sessionData = {
        lastProjectPath: this.projectState.activeProject?.path || null,
        // Save all open tabs and the active one from the state service
        openTabs: this.projectState.openTabs.map(t => ({ fileId: t.fileId, projectPath: t.project.path })),
        activeTabId: this.projectState.activeTabId,
        sidebarCollapsed: document.getElementById('app-view').classList.contains('sidebar-collapsed'),
        chatVisible: document.getElementById('app-view').classList.contains('chat-visible'),
    };
    window.api.updateSessionData(sessionData);
  }

  // REMOVED `restoreSession`. Logic is now integrated into `start`.

  handleEscKey(e) {
    if (e.key === 'Escape') {
      if (this.searchModal.isVisible) {
        this.searchModal.hide();
      } else {
        this.showMainView();
      }
    }
  }

  showMainView() {
    document.getElementById('app').classList.remove('modal-open');
    document.getElementById('settings-modal').classList.remove('visible');
    // Only remove the listener if the search modal is also not visible
    if (!this.searchModal.isVisible) {
      window.removeEventListener('keydown', this.handleEscKey);
    }
  }

  openSearchModal(context = {}) {
    document.getElementById('app').classList.add('modal-open');
    this.searchModal.show(context);
    window.addEventListener('keydown', this.handleEscKey);
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
    
    // 7. Load initial data from the service
    await this.projectState.loadInitialData();
    
    if (session) {
      if (session.sidebarCollapsed) {
        document.getElementById('app-view').classList.add('sidebar-collapsed');
        document.getElementById('app-titlebar').classList.add('sidebar-collapsed');
      }
      if (session.chatVisible) {
        document.getElementById('app-view').classList.add('chat-visible');
      }

      if (session.lastProjectPath) {
        const projectExists = this.projectState.projects.some(p => p.path === session.lastProjectPath);
        if (projectExists) {
            // This loads notes for the project
            await this.projectState.setActiveProject(session.lastProjectPath);

            if (session.openTabs && session.openTabs.length > 0) {
                for (const tab of session.openTabs) {
                    const project = this.projectState.projects.find(p => p.path === tab.projectPath);
                    if (project) {
                        await this.ensureEditorExists(project, tab.fileId);
                    }
                }
                // Restore tab state AFTER all editors are created
                this.projectState.restoreTabs(session.openTabs, session.activeTabId);
            }
        }
      }
    }
    
    // Global keyboard listeners
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            
            // Check for shift key to determine search context
            if (e.shiftKey) {
                // Page-specific search (Ctrl+Shift+K)
                const activeEditorInstance = this.activeFileId ? this.editors.get(this.activeFileId) : null;
                if (activeEditorInstance) {
                    const { project, editor } = activeEditorInstance;
                    const noteName = this.sidebar.getFileName(editor.currentFile) || 'Untitled';
                    
                    const context = {
                        projectPath: project.path,
                        projectName: project.name,
                        noteId: editor.currentFile,
                        noteName: noteName
                    };
                    this.openSearchModal(context);
                }
            } else {
                // Project-wide (or global) search (Ctrl+K)
                const currentProject = this.projectState.activeProject;
                let context = {};
                if (currentProject) {
                    context.projectPath = currentProject.path;
                    context.projectName = currentProject.name;
                }
                this.openSearchModal(context);
            }
        }
    });

    loader.classList.add('hidden');
    appContainer.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});