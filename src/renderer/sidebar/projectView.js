
/**
 * Manages the Project/File Explorer view in the sidebar.
 */
export class ProjectView {
  constructor(projectManager, container) {
    this.projectManager = projectManager;
    this.container = container;
    this.currentProject = null;
    this.currentFile = null;
    this.isEditorDirty = false;
    this.listeners = {};

    this.render();
    this.initElements();
    this.addEventListeners();
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

  render() {
    this.container.innerHTML = `
      <div class="view-header">
        <span class="view-header-title">Explorer</span>
        <button id="new-note-btn" title="New Note">+</button>
      </div>
      <ul id="file-tree"></ul>
    `;
  }

  initElements() {
    this.fileTree = this.container.querySelector('#file-tree');
    this.newNoteBtn = this.container.querySelector('#new-note-btn');
  }

  addEventListeners() {
    this.newNoteBtn.addEventListener('click', () => {
      if (!this.currentProject) return;
      this.currentFile = null; // Deselect current file
      this.emit('newNoteClicked', this.currentProject);
    });
  }

  async load(project) {
    this.currentProject = project;
    this.currentFile = null; // Reset file selection
    if (!this.currentProject) {
      this.fileTree.innerHTML = '<li>Select a project to see notes.</li>';
      return;
    }

    this.fileTree.innerHTML = '<li>Loading...</li>';
    const notes = await this.projectManager.getNotes(this.currentProject.path);
    this.fileTree.innerHTML = ''; // Clear
    notes.sort((a, b) => a.name.localeCompare(b.name));

    if (notes.length === 0) {
        this.fileTree.innerHTML = '<li>No notes in this project. Click + to create one.</li>';
        return;
    }

    notes.forEach(note => {
      const li = document.createElement('li');
      li.textContent = note.name.replace('.md', '');
      li.setAttribute('data-filename', note.name);
      li.addEventListener('click', () => this.selectNote(note.name));
      this.fileTree.appendChild(li);
    });

    this.updateActiveNoteUI();
  }

  selectNote(filename) {
    if (this.currentFile === filename) return;
    this.currentFile = filename;
    this.emit('fileSelected', { project: this.currentProject, file: filename });
  }
  
  setCurrentFile(filename) {
    this.currentFile = filename;
    this.updateActiveNoteUI();
  }

  setEditorDirty(isDirty) {
    this.isEditorDirty = isDirty;
    this.updateActiveNoteUI();
  }

  updateActiveNoteUI() {
    this.fileTree.querySelectorAll('li').forEach(li => {
      const filename = li.getAttribute('data-filename');
      if (!filename) return; 

      const originalName = filename.replace('.md', '');
      const isActive = filename === this.currentFile;

      li.classList.toggle('active', isActive);

      if (isActive && this.isEditorDirty) {
        li.textContent = `${originalName} *`;
      } else {
        li.textContent = originalName;
      }
    });
  }
}