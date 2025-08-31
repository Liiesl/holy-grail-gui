// src/renderer/app.js

import { Hgmd } from './hgmd.js';
// Import both classes from project.js
import { ProjectManager } from './project.js';
import { Sidebar } from './sidebar.js';
import { Editor } from './editor.js';

class App {
  constructor() {
    this.renderLayout();
    this.initServices();
    this.initComponents();
    this.connectComponents();
    this.start();
  }

  renderLayout() {
    document.getElementById('app').innerHTML = `
      <div class="container">
        <div id="app-sidebar" class="sidebar"></div>
        <div id="app-main" class="main-content"></div>
      </div>
    `;
  }

  initServices() {
    this.hgmd = new Hgmd();
    this.projectManager = new ProjectManager();
  }

  initComponents() {
    const sidebarContainer = document.getElementById('app-sidebar');
    const mainContainer = document.getElementById('app-main');

    this.sidebar = new Sidebar(this.projectManager, sidebarContainer);
    this.editor = new Editor(this.projectManager, this.hgmd, mainContainer);
  }

  connectComponents() {
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