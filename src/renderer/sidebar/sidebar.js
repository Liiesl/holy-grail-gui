// src/renderer/sidebar.js
import { ProjectView } from '../project.js';
import { HistoryView } from '../versionControl.js'; 

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
      <div class="sidebar-mode-switcher">
        <div class="mode-group-top">
            <button id="mode-btn-files" class="mode-btn active" title="Explorer">&#128193;</button>
            <button id="mode-btn-history" class="mode-btn" title="Version History" disabled>&#128337;</button>
        </div>
        <div class="mode-group-bottom">
            <button id="mode-btn-settings" class="mode-btn" title="Settings">&#9881;</button>
        </div>
      </div>
      <div class="sidebar-content">
        <div class="sidebar-header">
          <select id="project-selector">
            <option>Loading projects...</option>
          </select>
        </div>
        <div id="project-view-container"></div>
        <div id="history-view-container" class="hidden"></div>
      </div>
    `;
  }

  initElements() {
    this.modeBtnFiles = this.container.querySelector('#mode-btn-files');
    this.modeBtnHistory = this.container.querySelector('#mode-btn-history');
    this.modeBtnSettings = this.container.querySelector('#mode-btn-settings'); // New button
    this.projectSelector = this.container.querySelector('#project-selector');
    this.projectViewContainer = this.container.querySelector('#project-view-container');
    this.historyViewContainer = this.container.querySelector('#history-view-container');
  }

  initViews() {
    this.projectView = new ProjectView(this.projectManager, this.projectViewContainer);
    this.historyView = new HistoryView(this.projectManager, this.historyViewContainer);
  }

  addEventListeners() {
    // Mode switching
    this.modeBtnFiles.addEventListener('click', () => this.showProjectView());
    this.modeBtnHistory.addEventListener('click', () => this.showHistoryView());
    this.modeBtnSettings.addEventListener('click', () => this.emit('settingsClicked')); // Emit event
    
    // Project selection
    this.projectSelector.addEventListener('change', (e) => this.handleProjectSelection(e.target.value));
    
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
    this.projectSelector.innerHTML = '<option value="">Select a Project...</option>';
    this.projects.forEach(p => {
        const option = new Option(p.name, p.path);
        this.projectSelector.add(option);
    });
    // Add "Add Project" option at the end
    this.projectSelector.add(new Option('+ Add New Project...', 'add_new_project'));
    this.projectView.load(null); // Clear project view
  }

  async handleProjectSelection(projectPath) {
    if (projectPath === 'add_new_project') {
        await this.projectManager.addProject();
        await this.loadProjects();
        return;
    }
    
    if (projectPath === "") {
      this.currentProject = null;
      this.setCurrentFile(null, null);
      this.emit('projectSelected', null);
    } else {
      this.currentProject = this.projects.find(p => p.path === projectPath);
      this.emit('projectSelected', this.currentProject);
      this.setCurrentFile(this.currentProject, null);
    }
    this.projectView.load(this.currentProject);
  }

  showProjectView() {
    this.modeBtnFiles.classList.add('active');
    this.modeBtnHistory.classList.remove('active');
    this.projectViewContainer.classList.remove('hidden');
    this.historyViewContainer.classList.add('hidden');
    // When returning to file view, tell editor to exit read-only mode if it was in it
    this.emit('backToNotes');
  }

  showHistoryView() {
    if (!this.currentFile) return;
    this.modeBtnFiles.classList.remove('active');
    this.modeBtnHistory.classList.add('active');
    this.projectViewContainer.classList.add('hidden');
    this.historyViewContainer.classList.remove('hidden');
    this.historyView.load(this.currentProject, this.currentFile);
  }

  setCurrentFile(project, file) {
    this.currentProject = project;
    this.currentFile = file;
    this.projectView.setCurrentFile(file);
    // Enable/disable history button
    this.modeBtnHistory.disabled = !file;
    // If we deselect a file, clear history view and switch back to files
    if (!file) {
      this.historyView.clear();
      if(this.modeBtnHistory.classList.contains('active')) {
          this.showProjectView();
      }
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