// src/renderer/sidebar.js
import { ProjectView } from './projectView.js';
import { HistoryView } from './versionControl.js'; 

/**
 * Main controller for the entire sidebar, managing views and state.
 */
export class Sidebar {
  constructor(projectManager, container) {
    this.projectManager = projectManager;
    this.container = container;
    this.currentProject = null;
    this.currentFile = null;
    this.projects = [];
    this.listeners = {};

    this.render();
    this.initElements();
    this.initViews();
    this.addEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="sidebar-main-content">
        <div id="project-view-container"></div>
        <div id="history-view-container" class="hidden"></div>
      </div>
      <div class="sidebar-footer">
          <button id="settings-btn" class="sidebar-footer-btn" title="Settings">&#9881; <span>Settings</span></button>
      </div>
    `;
  }

  initElements() {
    this.settingsBtn = this.container.querySelector('#settings-btn');
    this.projectViewContainer = this.container.querySelector('#project-view-container');
    this.historyViewContainer = this.container.querySelector('#history-view-container');
  }

  initViews() {
    this.projectView = new ProjectView(this.projectManager, this.projectViewContainer);
    this.historyView = new HistoryView(this.projectManager, this.historyViewContainer);
  }

  addEventListeners() {
    this.settingsBtn.addEventListener('click', () => this.emit('settingsClicked'));
    
    // Bubble up events from child views
    this.projectView.on('fileSelected', (data) => {
        this.setCurrentFile(data.project, data.file);
        this.emit('fileSelected', data)
    });
    this.projectView.on('newNoteClicked', (data) => this.emit('newNoteClicked', data));
    this.projectView.on('deleteNoteRequested', (data) => this.emit('deleteNoteRequested', data));
    this.projectView.on('createNote', (data) => this.emit('createNote', data));
    this.projectView.on('renameNote', (data) => this.emit('renameNote', data));
    this.projectView.on('searchInitiated', (data) => this.emit('searchInitiated', data));
    this.historyView.on('versionSelected', (data) => this.emit('versionSelected', data));
  }
  
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * NEW: Passthrough method to get a file name from the ProjectView.
   * @param {string} noteId The unique ID of the note.
   * @returns {string|null}
   */
  getFileName(noteId) {
    return this.projectView.getFileName(noteId);
  }

  async loadProjects() {
    this.projects = await this.projectManager.getProjects();
    this.projectView.load(null); // Clear project view
  }

  // Called by App.js when a project is selected in the titlebar
  async displayProject(project) {
    if (this.currentProject?.path === project?.path) return;
    
    this.currentProject = project;
    this.setCurrentFile(project, null); // Deselect any open file from old project
    // await is important here to ensure the file list is loaded before we might need it
    await this.projectView.load(project);
    
    // Let App.js know to update the editor, etc.
    this.emit('projectSelected', project);
  }

  showProjectView() {
    this.projectViewContainer.classList.remove('hidden');
    this.historyViewContainer.classList.add('hidden');
    // When returning to file view, tell editor to exit read-only mode if it was in it
    this.emit('backToNotes');
  }

  showHistoryView() {
    if (!this.currentFile) return;
    this.projectViewContainer.classList.add('hidden');
    this.historyViewContainer.classList.remove('hidden');
    this.historyView.load(this.currentProject, this.currentFile);
  }

  setCurrentFile(project, file) {
    this.currentProject = project;
    this.currentFile = file;
    this.projectView.setCurrentFile(file);
    
    // Emit an event so the App can tell the Titlebar to enable/disable history
    this.emit('currentFileChanged', { hasFile: !!file });

    if (!file) {
      this.historyView.clear();
    }
  }
  
  setEditorDirty(isDirty) {
    this.projectView.setEditorDirty(isDirty);
  }

  refreshFileTree() {
    if (this.currentProject) {
        this.projectView.load(this.currentProject);
    }
  }
}