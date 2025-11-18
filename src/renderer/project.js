// src/renderer/project.js

/**
 * Manages the entire state of projects and notes, acting as the single
 * source of truth for the application. It communicates with the main process
 * and notifies the UI of any changes.
 */
export class ProjectStateService {
  constructor() {
    // Internal state - the single source of truth
    this._projects = [];
    this._notesByProjectPath = new Map(); // project.path -> [note, note, ...]
    this._activeProjectPath = null;

    // State for open tabs
    this._openTabs = new Map(); // fileId -> { fileId, projectPath, isDirty }
    this._tabOrder = []; // Array of fileIds to maintain visual order
    this._activeTabId = null;

    // Simple event emitter
    this.listeners = {};
  }

  // --- Event Emitter ---
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  // --- Public Getters (Read-only access to state) ---
  get projects() {
    return this._projects;
  }

  get activeProject() {
    return this._projects.find(p => p.path === this._activeProjectPath) || null;
  }

  getNotesForProject(projectPath) {
    return this._notesByProjectPath.get(projectPath) || [];
  }

  get activeTabId() {
    return this._activeTabId;
  }

  /**
   * A "selector" that computes the list of open tabs with their full data
   * needed for rendering (like the title and project info).
   */
  get openTabs() {
    return this._tabOrder.map(fileId => {
      const tabData = this._openTabs.get(fileId);
      if (!tabData) return null;

      const notes = this._notesByProjectPath.get(tabData.projectPath) || [];
      const note = notes.find(n => n.id === fileId);
      const project = this._projects.find(p => p.path === tabData.projectPath);

      return {
        fileId: fileId,
        title: note ? note.name : 'Loading...',
        isDirty: tabData.isDirty || false,
        project: {
            name: project ? project.name : 'Unknown',
            path: tabData.projectPath,
        }
      };
    }).filter(Boolean); // Filter out any nulls if data becomes inconsistent
  }


  // --- State Modifiers (Actions) ---

  async loadInitialData() {
    this._projects = await window.api.getProjects();
    this.emit('projects-changed', { projects: this._projects });
  }

  async setActiveProject(projectPath) {
    if (this._activeProjectPath === projectPath) return;

    this._activeProjectPath = projectPath;
    this.emit('active-project-changed', { project: this.activeProject });

    // Pre-fetch notes for the new active project if not already cached
    if (projectPath && !this._notesByProjectPath.has(projectPath)) {
      await this.loadNotesForProject(projectPath);
    }
  }

  async loadNotesForProject(projectPath) {
    const notes = await window.api.getNotes(projectPath);
    this._notesByProjectPath.set(projectPath, notes);
    this.emit('notes-changed', { projectPath, notes });
  }

  async addProject() {
    const updatedProjects = await window.api.addProject();
    if (updatedProjects && updatedProjects.length > this._projects.length) {
      this._projects = updatedProjects;
      this.emit('projects-changed', { projects: this._projects });
    }
  }

  async untrackProject(projectPath) {
    await window.api.untrackProject(projectPath);
    const oldProject = this._projects.find(p => p.path === projectPath);
    this._projects = this._projects.filter(p => p.path !== projectPath);
    
    // Clean up cache
    this._notesByProjectPath.delete(projectPath);
    
    this.emit('projects-changed', { projects: this._projects });
    this.emit('project-removed', { removedProject: oldProject });
    
    // Close all tabs belonging to this project
    const tabsToClose = this._tabOrder.filter(fileId => this._openTabs.get(fileId)?.projectPath === projectPath);
    if (tabsToClose.length > 0) {
        tabsToClose.forEach(fileId => this.closeTab(fileId, true)); // Batch close
        this.emit('tabs-changed', { openTabs: this.openTabs, activeTabId: this._activeTabId });
    }
    
    // If the active project was untracked, unset it
    if (this._activeProjectPath === projectPath) {
        await this.setActiveProject(null);
    }
  }

  async deleteProject(projectPath) {
    const result = await window.api.deleteProject(projectPath);
    if (result.success) {
      // Re-use untrack logic for UI updates
      await this.untrackProject(projectPath);
    }
    return result;
  }

  async createNote({ projectPath, name, parentId }) {
    const result = await window.api.createNote({ projectPath, name, parentId });
    if (result.success) {
      // Re-fetch the notes for this project to get the new note
      await this.loadNotesForProject(projectPath);
      // We can also emit the new note directly for faster UI response
      this.emit('note-created', { projectPath, newNote: result.note });
    }
    return result;
  }

  async renameNote(projectPath, id, newName) {
    const result = await window.api.renameNote(projectPath, id, newName);
    if (result.success) {
      const notes = this._notesByProjectPath.get(projectPath);
      if (notes) {
        const noteToUpdate = notes.find(n => n.id === id);
        if (noteToUpdate) {
          noteToUpdate.name = newName;
          this.emit('notes-changed', { projectPath, notes });
          // If the renamed note is an open tab, its title needs updating.
          // The openTabs selector will now return the new name, so we just need
          // to trigger a re-render for the tabs component.
          if (this._openTabs.has(id)) {
            this.emit('tabs-changed', { openTabs: this.openTabs, activeTabId: this._activeTabId });
          }
        }
      }
    }
    return result;
  }
  
  async deleteNote(projectPath, filename) {
    const wasOpen = this._openTabs.has(filename);
    const result = await window.api.deleteNote(projectPath, filename);
    if (result.success) {
      const notes = this._notesByProjectPath.get(projectPath) || [];
      const updatedNotes = notes.filter(n => n.id !== filename);
      this._notesByProjectPath.set(projectPath, updatedNotes);
      this.emit('notes-changed', { projectPath, notes: updatedNotes });
      
      // Close tab if it was open. This now becomes the source of truth for tab closing.
      if (wasOpen) {
          this.closeTab(filename);
      }
    }
    return result;
  }

  async moveNote({ projectPath, noteId, newParentId }) {
    const result = await window.api.moveNote({ projectPath, noteId, newParentId });
    if (result.success) {
      const notes = this._notesByProjectPath.get(projectPath);
      if (notes) {
        const noteToUpdate = notes.find(n => n.id === noteId);
        if (noteToUpdate) {
          noteToUpdate.parentId = newParentId;
          this.emit('notes-changed', { projectPath, notes });
        }
      }
    }
    return result;
  }

  async reorderNotes({ projectPath, noteIds, parentId }) {
    const result = await window.api.reorderNotes({ projectPath, noteIds, parentId });
    if (result.success) {
      // Reload notes to get the updated order
      await this.loadNotesForProject(projectPath);
    }
    return result;
  }

  // --- Tab management actions ---
  openTab({ projectPath, fileId }) {
    if (!this._openTabs.has(fileId)) {
        this._openTabs.set(fileId, { fileId, projectPath, isDirty: false });
        this._tabOrder.push(fileId);
    }
    this.setActiveTab(fileId);
  }

  closeTab(fileId, isBatch = false) {
    if (!this._openTabs.has(fileId)) return;

    const index = this._tabOrder.indexOf(fileId);
    let newActiveId = this._activeTabId;

    // If the tab being closed is the active one, determine the next active tab
    if (this._activeTabId === fileId) {
        if (this._tabOrder.length > 1) {
            // Activate the tab before it, or the one after if it was the first
            newActiveId = this._tabOrder[index - 1] || this._tabOrder[index + 1];
        } else {
            newActiveId = null;
        }
    }

    this._openTabs.delete(fileId);
    this._tabOrder.splice(index, 1);
    
    this._activeTabId = newActiveId;
    
    if (!isBatch) {
        this.emit('tabs-changed', { openTabs: this.openTabs, activeTabId: this._activeTabId });
    }
  }

  closeOtherTabs(fileIdToKeep) {
    const tabsToClose = this._tabOrder.filter(id => id !== fileIdToKeep);
    tabsToClose.forEach(fileId => this.closeTab(fileId, true)); // Batch close
    
    this.setActiveTab(fileIdToKeep); // This will emit the final 'tabs-changed'
  }

  setActiveTab(fileId) {
    if (this._activeTabId === fileId) return;
    this._activeTabId = fileId;
    this.emit('tabs-changed', { openTabs: this.openTabs, activeTabId: this._activeTabId });
  }

  setTabDirty({ fileId, isDirty }) {
    const tabData = this._openTabs.get(fileId);
    if (tabData && tabData.isDirty !== isDirty) {
      tabData.isDirty = isDirty;
      this.emit('tabs-changed', { openTabs: this.openTabs, activeTabId: this._activeTabId });
    }
  }

  restoreTabs(tabsToRestore, activeTabId) {
    this._openTabs.clear();
    this._tabOrder = [];

    tabsToRestore.forEach(tab => {
        this._openTabs.set(tab.fileId, { fileId: tab.fileId, projectPath: tab.projectPath, isDirty: false });
        this._tabOrder.push(tab.fileId);
    });

    this._activeTabId = this._openTabs.has(activeTabId) ? activeTabId : (this._tabOrder[0] || null);
    
    this.emit('tabs-changed', { openTabs: this.openTabs, activeTabId: this._activeTabId });
  }

  // --- Passthrough methods (no state change) ---

  async getNoteContent(projectPath, filename) {
    return window.api.getNoteContent(projectPath, filename);
  }

  async saveNote({ projectPath, filename, content }) {
    return window.api.saveNote({ projectPath, filename, content });
  }
  
  async getNoteHistory(projectPath, filename) {
    return window.api.getNoteHistory(projectPath, filename);
  }

  async getNoteVersionContent(projectPath, hash) {
    return window.api.getNoteVersionContent(projectPath, hash);
  }

  async performSearch(query, context) {
    return window.api.performSearch(query, context);
  }
}