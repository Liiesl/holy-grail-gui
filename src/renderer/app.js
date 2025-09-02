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

  connectComponents() {
    // --- Titlebar to App connections ---
    this.titlebar.container.addEventListener('sidebarToggle', () => {
      document.getElementById('app-view').classList.toggle('sidebar-collapsed');
    });

    this.titlebar.container.addEventListener('modeChange', (e) => {
      const mode = e.detail.mode;
      if (mode === 'project') {
        this.sidebar.showProjectView();
      } else if (mode === 'pageHistory') {
        this.sidebar.showHistoryView();
      }
      // 'projectHistory' is disabled for now.
    });

    // NEW: Handle project selection from titlebar
    this.titlebar.container.addEventListener('projectChange', (e) => {
        this.handleProjectSelection(e.detail.path);
    });
    
    // Listen for project actions from the titlebar menus
    this.titlebar.container.addEventListener('projectAction', async (e) => {
        const { action, path } = e.detail;

        if (action === 'add_new_project') {
            const projectsBefore = this.sidebar.projects.length;
            const updatedProjects = await this.projectManager.addProject();
            // If a project was actually added, refresh the list
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


    // --- Editor to App connection ---
    this.editor.on('chatToggled', () => {
      document.getElementById('app-view').classList.toggle('chat-visible');
    });

    // --- Sidebar to App/Other Components connections ---

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
    
    // New connection to manage history button availability
    this.sidebar.on('currentFileChanged', ({ hasFile }) => {
        this.titlebar.setHistoryModeAvailable(hasFile);
        // If file is deselected and we are in history view, switch back
        if (!hasFile) {
            this.sidebar.showProjectView();
            this.titlebar.setActiveMode('project');
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

    // --- Editor to Sidebar/Titlebar connections ---

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
        this.titlebar.setActiveMode('project');
      }
    });
    
    this.editor.on('noteDeleted', () => {
        this.sidebar.setCurrentFile(this.sidebar.currentProject, null);
        this.sidebar.refreshFileTree();
    });

    this.editor.on('historyClicked', () => {
      if (this.editor.currentProject && this.editor.currentFile) {
        this.sidebar.showHistoryView();
        this.titlebar.setActiveMode('pageHistory'); // NEW: Update titlebar state
      }
    });

    // --- View Switching Connections ---
    this.sidebar.on('settingsClicked', () => this.showSettingsView());
    this.settings.on('closeSettings', () => this.showMainView());
  }

  // NEW: Centralized project selection logic
  async handleProjectSelection(projectPath) {
    if (projectPath === "") { // Should not happen with new UI, but good to have
      this.sidebar.displayProject(null);
      this.titlebar.setCurrentProjectName(null);
      this.titlebar.updateProjectList(this.sidebar.projects, null);
    } else {
      const project = this.sidebar.projects.find(p => p.path === projectPath);
      if (project) {
        this.sidebar.displayProject(project);
        this.titlebar.setCurrentProjectName(project.name);
        this.titlebar.updateProjectList(this.sidebar.projects, project.path);
      }
    }
  }
  
  // Helper function to refresh project list and UI state
  async refreshProjects() {
    const currentProjectPath = this.sidebar.currentProject?.path;

    // Reload projects from main process
    await this.sidebar.loadProjects(); // This updates this.sidebar.projects internally

    const currentProjectStillExists = currentProjectPath && 
        this.sidebar.projects.some(p => p.path === currentProjectPath);

    if (currentProjectStillExists) {
        // Project list changed, but our current project is safe. Just update the UI.
        this.titlebar.updateProjectList(this.sidebar.projects, currentProjectPath);
    } else {
        // The current project was removed (untracked or deleted). Reset the view.
        this.sidebar.displayProject(null);
        this.editor.showWelcomeMessage();
        this.titlebar.setCurrentProjectName(null);
        this.titlebar.updateProjectList(this.sidebar.projects, null);
    }
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
    // NEW: Initialize titlebar with project list
    this.titlebar.updateProjectList(this.sidebar.projects, null);
    
    loader.classList.add('hidden');
    appContainer.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});