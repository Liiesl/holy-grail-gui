// src/renderer/sidebar.js
import { ProjectView } from './projectView.js';
import { HistoryView } from './versionControl.js'; 

/**
 * Manages the sidebar container, switching between the Project and History views.
 * It does not hold project state itself, but orchestrates its child views based on
 * instructions from App.js and events from the ProjectStateService.
 */
export class Sidebar {
  constructor(projectState, container, contextMenuService) {
    this.projectState = projectState;
    this.container = container;
    this.contextMenuService = contextMenuService; // Used by child views if needed
    
    // The sidebar still needs to know the current file for switching to history view
    this.currentFile = null;
    
    this.listeners = {};

    this.render();
    this.initElements();
    this.initViews();
    this.addEventListeners();
    this.initResizer(); // Add resizer logic
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
      <div id="sidebar-resizer" class="sidebar-resizer"></div>
    `;
  }

  initElements() {
    this.settingsBtn = this.container.querySelector('#settings-btn');
    this.projectViewContainer = this.container.querySelector('#project-view-container');
    this.historyViewContainer = this.container.querySelector('#history-view-container');
    this.resizer = this.container.querySelector('#sidebar-resizer');
  }

  initViews() {
    // Pass the state service AND context menu service down to the project view
    this.projectView = new ProjectView(this.projectState, this.projectViewContainer, this.contextMenuService);
    this.historyView = new HistoryView(this.projectState, this.historyViewContainer);
  }

  addEventListeners() {
    this.settingsBtn.addEventListener('click', () => this.emit('settingsClicked'));
    
    // Bubble up events from child views for App.js to handle.
    // The sidebar's role is simply to pass them along.
    this.projectView.on('fileSelected', (data) => {
        this.setCurrentFile(data.project, data.file);
        this.emit('fileSelected', data);
    });
    
    this.projectView.on('createNote', (data) => this.emit('createNote', data));
    this.projectView.on('renameNote', (data) => this.emit('renameNote', data));
    this.projectView.on('deleteNoteRequested', (data) => this.emit('deleteNoteRequested', data));
    this.projectView.on('searchInitiated', (data) => this.emit('searchInitiated', data));
    this.projectView.on('noteMoved', (data) => this.emit('noteMoved', data)); // Bubble up the move event
    this.projectView.on('notesReordered', (data) => this.emit('notesReordered', data)); // Bubble up the reorder event
    this.historyView.on('versionSelected', (data) => this.emit('versionSelected', data));
  }

  initResizer() {
    const minWidth = 200;
    const maxWidth = 500;

    const startResize = (e) => {
      e.preventDefault();
      this.resizer.classList.add('is-resizing');

      const startX = e.clientX;
      const startWidth = this.container.offsetWidth;

      const doResize = (moveEvent) => {
        let newWidth = startWidth + moveEvent.clientX - startX;
        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        this.container.style.width = `${newWidth}px`;
        // Emit the new width so other components (like titlebar) can react
        this.emit('resized', { width: newWidth });
      };

      const stopResize = () => {
        this.resizer.classList.remove('is-resizing');
        document.removeEventListener('mousemove', doResize, false);
        document.removeEventListener('mouseup', stopResize, false);
        // Emit an event when resizing is finished to save the state
        this.emit('resizeEnd', { width: this.container.offsetWidth });
      };

      document.addEventListener('mousemove', doResize, false);
      document.addEventListener('mouseup', stopResize, false);
    };

    this.resizer.addEventListener('mousedown', startResize, false);
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
   * Passthrough method to get a file name from the ProjectView's cached notes list.
   * @param {string} noteId The unique ID of the note.
   * @returns {string|null}
   */
  getFileName(noteId) {
    return this.projectView.getFileName(noteId);
  }

  /**
   * Called by App.js when the active project changes. 
   * This method simply instructs the projectView to render the new project.
   * @param {object|null} project The project object from the state service, or null.
   */
  async displayProject(project) {
    this.setCurrentFile(project, null); // Deselect any open file from old project
    // Tell the project view to load and render the notes for this project.
    // The projectView itself will get the note data from the projectState service.
    await this.projectView.load(project);
  }

  showProjectView() {
    this.projectViewContainer.classList.remove('hidden');
    this.historyViewContainer.classList.add('hidden');
    // Tell the editor to exit read-only mode if it was in it
    this.emit('backToNotes');
  }

  showHistoryView() {
    const activeProject = this.projectState.activeProject;
    if (!activeProject || !this.currentFile) return;
    
    this.projectViewContainer.classList.add('hidden');
    this.historyViewContainer.classList.remove('hidden');
    this.historyView.load(activeProject, this.currentFile);
  }

  /**
   * Updates the sidebar's internal tracking of the currently selected file.
   * This is necessary for knowing which file's history to show.
   * @param {object|null} project The currently active project.
   * @param {string|null} fileId The ID of the selected file.
   */
  setCurrentFile(project, fileId) {
    this.currentFile = fileId;
    this.projectView.setCurrentFile(fileId); // Tell the view to update its UI (e.g., highlight)
    
    // Notify App.js so it can enable/disable the history button in the titlebar.
    this.emit('currentFileChanged', { hasFile: !!fileId });

    if (!fileId) {
      this.historyView.clear();
    }
  }
  
  /**
   * Passthrough method to notify the project view that the active editor's
   * content has changed, so it can update the UI (e.g., show a dirty indicator '*').
   * @param {boolean} isDirty 
   */
  setEditorDirty(isDirty) {
    this.projectView.setEditorDirty(isDirty);
  }

  /**
   * Instructs the project view to re-render its file tree. This is useful
   * after operations like creating or deleting notes.
   */
  refreshFileTree() {
    const activeProject = this.projectState.activeProject;
    if (activeProject) {
        // The `load` method will fetch the latest notes from the service and re-render.
        this.projectView.load(activeProject);
    }
  }
}