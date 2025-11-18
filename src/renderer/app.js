// src/renderer/app.js

import { Hgmd } from './editor/hgmd.js';
import { ProjectStateService } from './project.js';
import { Sidebar } from './sidebar/sidebar.js';
import { Main } from './mainArea.js'; // 1. Import the new component
import { Settings } from './settings.js';
import { Titlebar } from './titlebar.js';
import { Chat } from './chat.js';
import { SearchModal } from './search-modal.js';
import { ContextMenuService } from './context-menu.js';

class App {
  constructor() {
    // State related to editors and panes has been moved to Main.js
    this.sidebarWidth = 280; // Default width
    this.renderLayout();
    this.projectState = new ProjectStateService(); 
    this.initServices();
    this.initComponents();
    this.connectComponents();
    this.bindStateListeners(); 
    this.start();
    this.handleEscKey = this.handleEscKey.bind(this);
  }

  get activeFileId() {
    return this.projectState.activeTabId;
  }

  renderLayout() {
    // 2. The main area is now a simple container for the Main component
    document.getElementById('app').innerHTML = `
      <div id="app-titlebar"></div> 
      <div id="app-view">
        <div id="app-sidebar" class="sidebar"></div>
        <div id="app-main" class="main-content"></div>
        <div id="app-chat" class="chat-panel"></div>
      </div>
      <div id="settings-modal" class="settings-overlay"></div>
      <div id="search-modal" class="search-overlay"></div>
      <div id="context-menu-container"></div>
    `;
  }

  initServices() {
    this.hgmd = new Hgmd();
    const contextMenuContainer = document.getElementById('context-menu-container');
    this.contextMenuService = new ContextMenuService(contextMenuContainer);
  }

  initComponents() {
    const titlebarContainer = document.getElementById('app-titlebar');
    const sidebarContainer = document.getElementById('app-sidebar');
    const mainContainer = document.getElementById('app-main');
    const settingsContainer = document.getElementById('settings-modal');
    const chatContainer = document.getElementById('app-chat');
    const searchContainer = document.getElementById('search-modal');
    
    this.titlebar = new Titlebar(titlebarContainer);
    this.sidebar = new Sidebar(this.projectState, sidebarContainer, this.contextMenuService); 
    // 3. Instantiate the new Main component
    this.main = new Main(this.projectState, this.hgmd, mainContainer, this.contextMenuService);
    this.settings = new Settings(settingsContainer);
    this.chat = new Chat(chatContainer);
    this.searchModal = new SearchModal(this.projectState, searchContainer);
  }

  getActiveEditor() {
    // 4. Delegate to the Main component
    return this.main.getActiveEditor();
  }
  
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

    // 5. This listener is now much simpler.
    this.projectState.on('tabs-changed', ({ openTabs, activeTabId }) => {
        // Delegate all UI updates for the main area to the Main component
        this.main.updateOnTabsChanged({ openTabs, activeTabId });
        
        // Update other components that depend on the active file
        const editor = this.getActiveEditor();
        if (editor) {
            this.sidebar.setCurrentFile(editor.currentProject, editor.currentFile);
        } else {
            this.sidebar.setCurrentFile(null, null);
        }
        this.titlebar.setHistoryModeAvailable(!!this.activeFileId);
        this.updateSession();
    });
  }

  connectComponents() {
    // --- Titlebar to App connections ---
    this.titlebar.container.addEventListener('sidebarToggle', () => {
      const isCollapsed = document.getElementById('app-view').classList.toggle('sidebar-collapsed');
      document.getElementById('app-titlebar').classList.toggle('sidebar-collapsed', isCollapsed);
      this.updateSession();
    });
    
    this.titlebar.container.addEventListener('chatToggle', () => {
      document.getElementById('app-view').classList.toggle('chat-visible');
      this.updateSession();
    });

    this.titlebar.container.addEventListener('modeChange', (e) => {
      const mode = e.detail.mode;
      if (!this.getActiveEditor()) return;
      if (mode === 'project') this.sidebar.showProjectView();
      else if (mode === 'pageHistory') this.sidebar.showHistoryView();
    });
    
    this.titlebar.container.addEventListener('projectChange', (e) => {
        this.projectState.setActiveProject(e.detail.path);
    });

    this.titlebar.container.addEventListener('projectAction', async (e) => {
        const { action, path } = e.detail;
        if (action === 'add_new_project') await this.projectState.addProject();
        else if (action === 'untrack_project') await this.projectState.untrackProject(path);
        else if (action === 'delete_project') await this.projectState.deleteProject(path);
    });
    
    // --- 6. Listen for events bubbled up from the Main component ---
    this.main.on('setActiveTabRequested', ({ fileId }) => this.projectState.setActiveTab(fileId));
    this.main.on('openTabRequested', ({ projectPath, fileId }) => this.projectState.openTab({ projectPath, fileId }));
    this.main.on('closeTabRequested', ({ fileId }) => this.projectState.closeTab(fileId));
    this.main.on('closeOtherTabsRequested', ({ fileId }) => this.projectState.closeOtherTabs(fileId));
    this.main.on('editorDirtyStateChanged', ({ fileId, isDirty }) => this.projectState.setTabDirty({ fileId, isDirty }));
    this.main.on('noteSavedInActivePane', ({ project, fileId }) => this.sidebar.setCurrentFile(project, fileId));
    
    // --- Sidebar to App connections ---
    this.sidebar.on('fileSelected', async ({ project, file }) => {
      await this.main.openOrFocusFile(project, file);
    });
    this.sidebar.on('currentFileChanged', ({ hasFile }) => {
        this.titlebar.setHistoryModeAvailable(hasFile);
        if (!hasFile) {
            this.sidebar.showProjectView();
            this.titlebar.setActiveMode('project');
        }
    });
    this.sidebar.on('createNote', async ({ project, name, parentId }) => {
      const result = await this.projectState.createNote({ projectPath: project.path, name, parentId });
      if (result.success) {
        await this.main.openOrFocusFile(project, result.note.id);
      } else {
        alert(`Error creating page: ${result.error || 'Unknown error'}`);
      }
    });
    this.sidebar.on('renameNote', async ({ project, id, newName }) => {
        const result = await this.projectState.renameNote(project.path, id, newName);
        if (!result.success) {
            alert(`Error renaming page: ${result.error || 'Unknown error'}`);
            await this.sidebar.refreshFileTree(); 
        }
    });
    this.sidebar.on('deleteNoteRequested', async ({ project, file }) => {
      const confirmed = confirm(`Are you sure you want to delete this file? This action cannot be undone.`);
      if (confirmed) {
        const result = await this.projectState.deleteNote(project.path, file);
        if (!result.success) alert(`Error deleting note: ${result.error || 'Unknown error'}`);
      }
    });
    this.sidebar.on('searchInitiated', ({ project }) => {
        this.openSearchModal(project ? { projectPath: project.path, projectName: project.name } : {});
    });
    this.sidebar.on('resized', ({ width }) => {
        this.titlebar.setLeftControlsWidth(width);
    });
    this.sidebar.on('resizeEnd', ({ width }) => {
        this.sidebarWidth = width;
        this.updateSession();
    });

    this.sidebar.on('noteMoved', async ({ project, noteId, newParentId }) => {
        const result = await this.projectState.moveNote({ projectPath: project.path, noteId, newParentId });
        if (!result.success) {
            alert(`Error moving page: ${result.error || 'Unknown error'}`);
            // The 'notes-changed' event will automatically refresh the tree on success.
            // On failure, you might want to force a refresh to revert any optimistic UI changes,
            // but our current implementation re-renders from state, so it's handled.
        }
    });
    
    this.sidebar.on('notesReordered', async ({ project, noteIds, parentId }) => {
        const result = await this.projectState.reorderNotes({ 
            projectPath: project.path, 
            noteIds, 
            parentId 
        });
        if (!result.success) {
            alert(`Error reordering pages: ${result.error || 'Unknown error'}`);
        }
    });
    
    // --- View Switching & Modal connections ---
    this.sidebar.on('settingsClicked', () => this.showSettingsView());
    this.settings.on('closeSettings', () => this.showMainView());
    this.searchModal.on('resultSelected', async ({ type, metadata }) => {
        this.searchModal.hide();
        if (type === 'page' || type === 'content_line') {
            await this.projectState.setActiveProject(metadata.projectPath);
            const project = this.projectState.activeProject;
            await this.main.openOrFocusFile(project, metadata.noteId);
        } else if (type === 'project') {
            await this.projectState.setActiveProject(metadata.projectPath);
        }
    });
  }

  updateSession() {
    const sessionData = {
        lastProjectPath: this.projectState.activeProject?.path || null,
        openTabs: this.projectState.openTabs.map(t => ({ fileId: t.fileId, projectPath: t.project.path })),
        activeTabId: this.projectState.activeTabId,
        sidebarCollapsed: document.getElementById('app-view').classList.contains('sidebar-collapsed'),
        chatVisible: document.getElementById('app-view').classList.contains('chat-visible'),
        sidebarWidth: this.sidebarWidth,
        // 7. Get layout from the Main component for saving
        paneLayout: this.main.getPaneLayout(),
    };
    window.api.updateSessionData(sessionData);
  }

  handleEscKey(e) {
    if (e.key === 'Escape') {
      if (this.searchModal.isVisible) this.searchModal.hide();
      else this.showMainView();
    }
  }

  showMainView() {
    document.getElementById('app').classList.remove('modal-open');
    document.getElementById('settings-modal').classList.remove('visible');
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

    // Get session data first
    const settings = await window.api.getSettings();
    const session = settings.session || {};
    
    await this.projectState.loadInitialData();
    
    // Apply session settings that affect layout
    this.sidebarWidth = session.sidebarWidth || 280;
    document.getElementById('app-sidebar').style.width = `${this.sidebarWidth}px`;
    this.titlebar.setLeftControlsWidth(this.sidebarWidth);
    
    if (session.sidebarCollapsed) {
      document.getElementById('app-view').classList.add('sidebar-collapsed');
      document.getElementById('app-titlebar').classList.add('sidebar-collapsed');
    }
    if (session.chatVisible) document.getElementById('app-view').classList.add('chat-visible');
    if (session.paneLayout) this.main.setPaneLayout(session.paneLayout);

    // Restore project and tab state
    if (session.lastProjectPath) {
      const projectExists = this.projectState.projects.some(p => p.path === session.lastProjectPath);
      if (projectExists) {
          await this.projectState.setActiveProject(session.lastProjectPath);

          if (session.openTabs?.length > 0) {
              for (const tab of session.openTabs) {
                  const project = this.projectState.projects.find(p => p.path === tab.projectPath);
                  if (project) await this.main.ensureEditorExists(project, tab.fileId);
              }
              this.projectState.restoreTabs(session.openTabs, session.activeTabId);
          }
      }
    }
    
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (e.shiftKey) {
                const editor = this.getActiveEditor();
                if (editor) {
                    const { currentProject: project, currentFile: noteId } = editor;
                    const noteName = this.sidebar.getFileName(noteId) || 'Untitled';
                    this.openSearchModal({ projectPath: project.path, projectName: project.name, noteId, noteName });
                }
            } else {
                const project = this.projectState.activeProject;
                this.openSearchModal(project ? { projectPath: project.path, projectName: project.name } : {});
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