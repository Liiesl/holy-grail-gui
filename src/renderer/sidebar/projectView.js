// src/renderer/projectView.js

/**
 * Manages the Project/File Explorer view in the sidebar.
 * This view is "state-driven". It listens for changes from the ProjectStateService
 * and re-renders the file tree whenever the underlying data is modified.
 */
export class ProjectView {
  constructor(projectState, container) {
    this.projectState = projectState;
    this.container = container;
    this.currentProject = null;
    this.currentFile = null; // Stores the note's unique ID
    this.isEditorDirty = false;
    this.listeners = {};
    this.creatingWithParentId = null; // To store parentId during creation
    this.notes = []; // A local cache of the raw note data for easy lookup

    this.render();
    this.initElements();
    this.addEventListeners();
    this.bindStateListeners(); // Listen for changes from the source of truth

    this.closeContextMenu = this.closeContextMenu.bind(this);
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
   * Subscribes to events from the central state service.
   */
  bindStateListeners() {
      this.projectState.on('notes-changed', ({ projectPath, notes }) => {
          // If the notes for the currently displayed project have changed, re-render the tree.
          if (this.currentProject && this.currentProject.path === projectPath) {
              this.renderNotes(notes);
          }
      });
  }

  render() {
    this.container.innerHTML = `
      <div class="search-container">
        <input type="text" class="search-input" placeholder="Search pages...">
        <div class="search-shortcut">Ctrl K</div>
      </div>
      <ul id="file-tree"></ul>
      <div class="project-view-actions">
          <button id="new-page-btn" class="new-page-btn">
              <span>+</span>
              <span>New Page</span>
          </button>
          <div class="divider"></div>
      </div>
    `;
  }

  initElements() {
    this.fileTree = this.container.querySelector('#file-tree');
    this.newPageBtn = this.container.querySelector('#new-page-btn');
    this.searchInput = this.container.querySelector('.search-input');
  }

  addEventListeners() {
    this.newPageBtn.addEventListener('click', () => {
      if (!this.currentProject) return;
      this.beginCreateNewNote(); // Creates a root-level page
    });

    this.searchInput.addEventListener('click', (e) => {
        e.preventDefault();
        this.emit('searchInitiated', { project: this.currentProject });
    });
  }

  /**
   * Called by the Sidebar to display a new project.
   * This method ensures the note data is loaded from the state service.
   * The actual rendering is handled by the `notes-changed` listener.
   * @param {object|null} project 
   */
  async load(project) {
    this.currentProject = project;
    this.currentFile = null; // Reset file selection
    
    if (!this.currentProject) {
      this.fileTree.innerHTML = '<li>Select a project to see pages.</li>';
      this.notes = []; // Clear the notes cache
      return;
    }

    this.fileTree.innerHTML = '<li>Loading...</li>';
    
    // Ask the state service to load the notes. If they are already cached,
    // it won't perform a network request. This will trigger the `notes-changed`
    // event, which will in turn call `renderNotes`.
    await this.projectState.loadNotesForProject(this.currentProject.path);
  }

  /**
   * Renders the visual file tree from a list of note objects.
   * This is called by the `notes-changed` event listener.
   * @param {Array} notes - The array of note objects for the current project.
   */
  renderNotes(notes) {
    this.notes = notes; // Update the local cache for getFileName()
    this.fileTree.innerHTML = ''; // Clear current tree

    if (notes.length === 0) {
        this.fileTree.innerHTML = '<li class="info-message">No pages in this project. Click "+ New Page" to create one.</li>';
        return;
    }

    // Build tree structure
    const notesMap = new Map();
    const rootNotes = [];
    notes.forEach(note => {
        note.children = [];
        notesMap.set(note.id, note);
    });
    notes.forEach(note => {
        if (note.parentId && notesMap.has(note.parentId)) {
            notesMap.get(note.parentId).children.push(note);
        } else {
            rootNotes.push(note);
        }
    });

    this.renderNoteTree(rootNotes, this.fileTree);
    this.updateActiveNoteUI();
  }

  /**
   * Finds the name of a note by its ID from the cached list.
   * @param {string} noteId The unique ID of the note.
   * @returns {string|null} The name of the note or null if not found.
   */
  getFileName(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    return note ? note.name : null;
  }

  renderNoteTree(notes, parentElement) {
    notes.sort((a, b) => a.name.localeCompare(b.name));
    notes.forEach(note => {
      if (note.children.length > 0) {
        note.children.sort((a, b) => a.name.localeCompare(b.name));
      }
      const li = this.createNoteElement(note);
      parentElement.appendChild(li);

      if (note.children && note.children.length > 0) {
        const ul = li.querySelector('.nested-notes');
        this.renderNoteTree(note.children, ul);
      }
    });
  }
  
  createNoteElement(note) {
    const li = document.createElement('li');
    li.setAttribute('data-note-id', note.id);
    const hasChildren = note.children && note.children.length > 0;

    li.innerHTML = `
      <div class="file-item-container">
        <span class="toggle-icon">${hasChildren ? '▶' : ''}</span>
        <div class="file-item-content">
            <span class="file-item-icon">📄</span>
            <span class="file-item-name">${note.name}</span>
        </div>
        <div class="file-item-actions">
            <button class="file-action-btn add-child-btn" title="New sub-page">+</button>
            <button class="file-action-btn meatball-btn" title="More options">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 3C8.82843 3 9.5 2.32843 9.5 1.5C9.5 0.671573 8.82843 0 8 0C7.17157 0 6.5 0.671573 6.5 1.5C6.5 2.32843 7.17157 3 8 3ZM8 8C8.82843 8 9.5 7.32843 9.5 6.5C9.5 5.67157 8.82843 5 8 5C7.17157 5 6.5 5.67157 6.5 6.5C6.5 7.32843 7.17157 8 8 8ZM8 13C8.82843 13 9.5 12.3284 9.5 11.5C9.5 10.6716 8.82843 10 8 10C7.17157 10 6.5 10.6716 6.5 11.5C6.5 12.3284 7.17157 13 8 13Z"/></svg>
            </button>
        </div>
      </div>
      ${hasChildren ? '<ul class="nested-notes collapsed"></ul>' : ''}
    `;

    li.querySelector('.file-item-content').addEventListener('click', () => this.selectNote(note.id));

    const toggleIcon = li.querySelector('.toggle-icon');
    if (toggleIcon.textContent) {
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNode(li);
        });
    }
    
    const addChildBtn = li.querySelector('.add-child-btn');
    addChildBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.beginCreateNewNote(note.id);
    });

    const meatballBtn = li.querySelector('.meatball-btn');
    meatballBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showContextMenu(e, note.id);
    });

    return li;
  }

  toggleNode(liElement) {
    const ul = liElement.querySelector('.nested-notes');
    if (!ul) return;
    
    liElement.classList.toggle('expanded');
    ul.classList.toggle('collapsed');
    
    const icon = liElement.querySelector('.toggle-icon');
    if (icon) {
        icon.textContent = ul.classList.contains('collapsed') ? '▶' : '▼';
    }
  }

  selectNote(noteId) {
    if (this.currentFile === noteId) return;
    this.emit('fileSelected', { project: this.currentProject, file: noteId });
  }
  
  setCurrentFile(noteId) {
    this.currentFile = noteId;
    this.updateActiveNoteUI();
  }

  setEditorDirty(isDirty) {
    this.isEditorDirty = isDirty;
    this.updateActiveNoteUI();
  }

  updateActiveNoteUI() {
    this.fileTree.querySelectorAll('li[data-note-id]').forEach(li => {
      const noteId = li.getAttribute('data-note-id');
      const nameSpan = li.querySelector('.file-item-name');
      if (!noteId || !nameSpan) return; 

      const isActive = noteId === this.currentFile;
      li.classList.toggle('active', isActive);
      
      const note = this.notes.find(n => n.id === noteId);
      const originalName = note ? note.name : nameSpan.textContent.replace(/\s*\*$/, '');

      if (isActive && this.isEditorDirty) {
        nameSpan.textContent = `${originalName} *`;
      } else {
        nameSpan.textContent = originalName;
      }
    });
  }
  
  // --- Context Menu and In-Place Editing methods from here down ---
  // These methods are largely unchanged as they manage local UI state
  // and emit events, which is consistent with the new architecture.

  closeContextMenu() {
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    document.removeEventListener('click', this.closeContextMenu);
    document.removeEventListener('contextmenu', this.closeContextMenu);
  }

  showContextMenu(event, noteId) {
      this.closeContextMenu(); // Close any existing menus

      const menu = document.createElement('div');
      menu.className = 'context-menu';
      menu.innerHTML = `
          <ul>
              <li class="context-menu-item" data-action="rename">Rename</li>
              <li class="context-menu-item" data-action="duplicate">Duplicate</li>
              <li class="context-menu-item" data-action="delete">Delete</li>
              <div class="context-menu-divider"></div>
              <li class="context-menu-item" data-action="open-right">Open to the Right</li>
              <li class="context-menu-item" data-action="change-icon">Change Icon</li>
              <li class="context-menu-item" data-action="open-new-tab">Open in New Tab</li>
              <li class="context-menu-item" data-action="show-in-explorer">Show in System Explorer</li>
          </ul>
      `;

      document.body.appendChild(menu);

      const rect = event.currentTarget.getBoundingClientRect();
      menu.style.top = `${rect.bottom}px`;
      menu.style.left = `${rect.left}px`;
      
      if (menu.offsetLeft + menu.offsetWidth > window.innerWidth) {
          menu.style.left = `${window.innerWidth - menu.offsetWidth - 5}px`;
      }
      if (menu.offsetTop + menu.offsetHeight > window.innerHeight) {
          menu.style.top = `${window.innerHeight - menu.offsetHeight - 5}px`;
      }

      menu.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = e.target.closest('.context-menu-item');
          if (target) {
              const action = target.getAttribute('data-action');
              this.handleContextMenuAction(action, noteId);
              this.closeContextMenu();
          }
      });
      
      setTimeout(() => {
          document.addEventListener('click', this.closeContextMenu);
          document.addEventListener('contextmenu', this.closeContextMenu);
      }, 0);
  }
  
  handleContextMenuAction(action, noteId) {
      switch (action) {
          case 'delete':
              {
                const li = this.fileTree.querySelector(`li[data-note-id="${noteId}"]`);
                if (!li) return;
                const name = li.querySelector('.file-item-name').textContent.replace(/\s*\*$/, '');
                this.emit('deleteNoteRequested', { project: this.currentProject, file: noteId, name: name });
              }
              break;
          case 'rename':
              this.beginRenameNote(noteId);
              break;
          case 'duplicate':
          case 'open-right':
          case 'change-icon':
          case 'open-new-tab':
          case 'show-in-explorer':
              // These are placeholders for now.
              alert(`Action '${action}' on page with ID '${noteId}' is not yet implemented.`);
              break;
          default:
              console.log(`Unknown action: ${action}`);
      }
  }

  // --- METHODS FOR IN-PLACE EDITING ---

  beginCreateNewNote(parentId = null) { // Accept an optional parentId
    if (this.fileTree.querySelector('li.is-editing')) return;

    this.currentFile = null;
    this.emit('newNoteClicked', this.currentProject);
    this.creatingWithParentId = parentId; // Store parentId for later

    const li = document.createElement('li');
    li.className = 'is-editing';
    li.innerHTML = `
        <div class="file-item-container">
            <span class="toggle-icon"></span>
            <div class="file-item-content">
                <span class="file-item-icon">📄</span>
                <input type="text" class="file-item-name-input" placeholder="New Page Name" />
            </div>
        </div>
    `;

    let parentUl = this.fileTree;
    let parentLi = null;

    if (parentId) {
      parentLi = this.fileTree.querySelector(`li[data-note-id="${parentId}"]`);
      if (parentLi) {
        // Ensure parent is expanded to show the new input
        if (!parentLi.classList.contains('expanded')) {
            this.toggleNode(parentLi);
        }
        parentUl = parentLi.querySelector('ul.nested-notes');
        // If the parent had no children before, the <ul> won't exist. Create it.
        if (!parentUl) {
            parentUl = document.createElement('ul');
            parentUl.className = 'nested-notes';
            parentLi.appendChild(parentUl);
            
            const toggleIcon = parentLi.querySelector('.toggle-icon');
            if (toggleIcon) toggleIcon.textContent = '▼'; // It's now a parent
            parentLi.classList.add('expanded');
        }
      }
    }

    parentUl.appendChild(li);
    const input = li.querySelector('input');
    input.focus();

    const finish = () => {
        input.removeEventListener('blur', finish);
        input.removeEventListener('keydown', handleKey);
        this.finishCreateNewNote(input, li);
    };
    const handleKey = (e) => {
        if (e.key === 'Enter') e.preventDefault(), finish();
        else if (e.key === 'Escape') finish(); // Also finish on escape to handle cleanup
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', handleKey);
  }
  
  async finishCreateNewNote(input, li) {
    const newName = input.value.trim();
    const parentUl = li.parentElement;
    li.remove();

    if (newName) {
      // Emit the createNote event with the stored parentId
      this.emit('createNote', { project: this.currentProject, name: newName, parentId: this.creatingWithParentId });
    } else {
      // Creation was cancelled. If the parent UL is now empty and was created temporarily, remove it.
      if (parentUl && parentUl.classList.contains('nested-notes') && parentUl.children.length === 0) {
        const parentLi = parentUl.closest('li[data-note-id]');
        parentUl.remove();
        if (parentLi) {
            // Revert parent state if it's no longer a parent
            parentLi.classList.remove('expanded');
            const toggleIcon = parentLi.querySelector('.toggle-icon');
            if (toggleIcon) toggleIcon.textContent = '';
        }
      }
    }
    this.creatingWithParentId = null; // Reset for the next creation
  }

  beginRenameNote(noteId) {
    const li = this.fileTree.querySelector(`li[data-note-id="${noteId}"]`);
    if (!li || li.classList.contains('is-editing')) return;

    li.classList.add('is-editing');
    const nameSpan = li.querySelector('.file-item-name');
    const originalName = nameSpan.textContent.replace(/\s*\*$/, '');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-item-name-input';
    input.value = originalName;

    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
        input.removeEventListener('blur', finish);
        input.removeEventListener('keydown', handleKey);
        this.finishRenameNote(input, li, noteId, originalName);
    };

    const handleKey = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finish();
        } else if (e.key === 'Escape') {
            input.value = originalName; // Revert value
            finish(); // Finish to restore UI and remove listeners
        }
    };
    
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', handleKey);
  }

  async finishRenameNote(input, li, noteId, originalName) {
    const newName = input.value.trim();
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-item-name';
    const isActiveAndDirty = noteId === this.currentFile && this.isEditorDirty;
    
    if (input.parentElement) {
      input.replaceWith(nameSpan);
    }
    li.classList.remove('is-editing');
    
    if (newName && newName !== originalName) {
        nameSpan.textContent = `${newName}${isActiveAndDirty ? ' *' : ''}`;
        this.emit('renameNote', { project: this.currentProject, id: noteId, newName: newName });
    } else {
        nameSpan.textContent = `${originalName}${isActiveAndDirty ? ' *' : ''}`;
    }
  }
}