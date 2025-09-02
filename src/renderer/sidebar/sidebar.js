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

  async loadProjects() {
    this.projects = await this.projectManager.getProjects();
    this.projectView.load(null); // Clear project view
  }

  // Called by App.js when a project is selected in the titlebar
  displayProject(project) {
    if (this.currentProject?.path === project?.path) return;
    
    this.currentProject = project;
    this.setCurrentFile(project, null); // Deselect any open file from old project
    this.projectView.load(project);
    
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