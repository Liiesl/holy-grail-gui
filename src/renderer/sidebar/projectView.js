// src/renderer/projectView.js

/**
 * Manages the Project/File Explorer view in the sidebar.
 * This view is "state-driven". It listens for changes from the ProjectStateService
 * and re-renders the file tree whenever the underlying data is modified.
 */
export class ProjectView {
  constructor(projectState, container, contextMenuService) {
    this.projectState = projectState;
    this.container = container;
    this.contextMenuService = contextMenuService; // <-- Store the service
    this.currentProject = null;
    this.currentFile = null; // Stores the note's unique ID
    this.isEditorDirty = false;
    this.listeners = {};
    this.creatingWithParentId = null; // To store parentId during creation
    this.notes = []; // A local cache of the raw note data for easy lookup
    this.draggedNoteId = null; // ID of the note being dragged
    
    // -- Drag & Drop State --
    this.dropPlaceholder = null; 
    this.dropAction = null; // 'before', 'after', 'child'
    this.dropTargetId = null;
    this.dragOverTimeout = null; // Timeout for debouncing dragOver
    this.lastDragOverTime = 0; // Timestamp of last dragOver processing

    this.render();
    this.initElements();
    this.addEventListeners();
    this.bindStateListeners(); // Listen for changes from the source of truth
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

    // --- Drag and Drop Listeners ---
    this.fileTree.addEventListener('dragstart', this.handleDragStart.bind(this));
    this.fileTree.addEventListener('dragover', this.handleDragOver.bind(this));
    this.fileTree.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.fileTree.addEventListener('drop', this.handleDrop.bind(this));
    this.fileTree.addEventListener('dragend', this.handleDragEnd.bind(this));
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
    const expandedNoteIds = new Set();
    this.fileTree.querySelectorAll('li.expanded[data-note-id]').forEach(li => {
        expandedNoteIds.add(li.dataset.noteId);
    });

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

    // Sort children arrays by order to maintain correct order
    notesMap.forEach(note => {
        if (note.children.length > 0) {
            note.children.sort((a, b) => (a.order || 0) - (b.order || 0));
        }
    });
    // Sort root notes by order
    rootNotes.sort((a, b) => (a.order || 0) - (b.order || 0));

    this.renderNoteTree(rootNotes, this.fileTree);
    
    if (expandedNoteIds.size > 0) {
        expandedNoteIds.forEach(noteId => {
            const li = this.fileTree.querySelector(`li[data-note-id="${noteId}"]`);
            const ul = li ? li.querySelector('.nested-notes') : null;
            // Check if the element still exists and has children to expand
            if (li && ul) {
                this.toggleNode(li, true); // Force expand without toggling
            }
        });
    }

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
    // Notes are already sorted by order from the backend
    notes.forEach(note => {
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
    li.setAttribute('draggable', true);
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

    // Attach context menu listener for right-click
    const container = li.querySelector('.file-item-container');
    container.addEventListener('contextmenu', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.showContextMenu(e.clientX, e.clientY, note.id);
    });

    return li;
  }

  toggleNode(liElement, forceExpand = false) {
    const ul = liElement.querySelector('.nested-notes');
    if (!ul) return;

    // --- START: MODIFICATION ---
    // Adjust logic to handle forcing the node open
    const isCollapsed = ul.classList.contains('collapsed');
    if (forceExpand) {
        liElement.classList.add('expanded');
        ul.classList.remove('collapsed');
    } else {
        liElement.classList.toggle('expanded', isCollapsed); // Add if collapsed, remove if not
        ul.classList.toggle('collapsed');
    }

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
  
  // --- Drag & Drop Handlers ---
  
  handleDragStart(e) {
    const li = e.target.closest('li[data-note-id]');
    if (!li) return;
    
    // Prevent dragging if editing
    if (li.classList.contains('is-editing')) {
        e.preventDefault();
        return;
    }

    this.draggedNoteId = li.dataset.noteId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.draggedNoteId); // Helper for some browsers
    
    // Defer class addition for drag image generation
    setTimeout(() => li.classList.add('is-dragging'), 0);
  }

  removeDropPlaceholder() {
    if (this.dropPlaceholder) {
      this.dropPlaceholder.remove();
      this.dropPlaceholder = null;
    }
    // Clean up all hover classes
    this.fileTree.querySelectorAll('.drop-target-child, .drop-target-before, .drop-target-after')
        .forEach(el => el.classList.remove('drop-target-child', 'drop-target-before', 'drop-target-after'));
    
    this.dropAction = null;
    this.dropTargetId = null;
  }

  /**
   * Visually indicates where the item will land.
   * Inspiration from Zen: visual indentation levels.
   */
  insertDropPlaceholder(targetLi, action) {
    const targetId = targetLi.dataset.noteId;

    // Optimization: Don't re-render if nothing changed
    if (this.dropPlaceholder && this.dropTargetId === targetId && this.dropAction === action) {
        return;
    }

    // Clean up old
    this.removeDropPlaceholder();

    this.dropTargetId = targetId;
    this.dropAction = action;

    const placeholder = document.createElement('li');
    placeholder.className = 'drop-placeholder';
    // Style matches typical item height
    placeholder.style.height = '34px'; 
    placeholder.style.borderRadius = '4px';
    placeholder.style.backgroundColor = 'var(--color-hover)';
    placeholder.style.border = '1px dashed var(--color-accent)';
    placeholder.style.boxSizing = 'border-box';
    placeholder.style.marginBottom = '2px';
    placeholder.style.transition = 'margin 0.2s ease'; // Smooth shift for indentation

    const parentUl = targetLi.parentNode;
    const container = targetLi.querySelector('.file-item-container');

    if (action === 'before') {
        container.classList.add('drop-target-before');
        parentUl.insertBefore(placeholder, targetLi);
    } 
    else if (action === 'after') {
        container.classList.add('drop-target-after');
        // Insert after target
        if (targetLi.nextSibling) {
            parentUl.insertBefore(placeholder, targetLi.nextSibling);
        } else {
            parentUl.appendChild(placeholder);
        }
    } 
    else if (action === 'child') {
        container.classList.add('drop-target-child');
        
        // VISUAL LEVEL: Insert AFTER the target, but add margin to simulate nesting.
        // This simulates the "Zen" feel where you see exactly where it lands hierarchy-wise.
        if (targetLi.nextSibling) {
            parentUl.insertBefore(placeholder, targetLi.nextSibling);
        } else {
            parentUl.appendChild(placeholder);
        }
        
        // Calculate indent: 
        // 1. If we are inserting as child, visually it looks like it belongs to the target's UL (which has 20px padding).
        // 2. Since we are physically in the parent UL, we fake the indent.
        placeholder.style.marginLeft = '20px';
    }

    this.dropPlaceholder = placeholder;
  }

  handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping

    // Debounce high-frequency events
    const now = performance.now();
    if (now - this.lastDragOverTime < 16) return;
    this.lastDragOverTime = now;

    let targetLi = e.target.closest('li[data-note-id]');
    
    // If hovering the placeholder itself, find the nearest note to keep context
    if (!targetLi && e.target.closest('.drop-placeholder')) {
        const placeholder = e.target.closest('.drop-placeholder');
        targetLi = placeholder.previousElementSibling || placeholder.nextElementSibling;
    }

    if (!targetLi || !this.draggedNoteId) {
        // Allow dropping into empty space (root) if needed, otherwise ignore
        return;
    }

    const targetId = targetLi.dataset.noteId;
    const draggedNote = this.notes.find(n => n.id === this.draggedNoteId);
    
    // Prevent dropping on self or children
    if (targetId === this.draggedNoteId || this.isDescendant(this.draggedNoteId, targetId)) {
        this.removeDropPlaceholder();
        return;
    }

    const rect = targetLi.getBoundingClientRect();
    // Use the content container for cleaner height calculation (ignoring nested lists)
    const container = targetLi.querySelector('.file-item-container');
    const containerRect = container.getBoundingClientRect();
    
    const relativeY = e.clientY - containerRect.top;
    const height = containerRect.height;
    
    // Define zones: Top 25%, Bottom 25%, Middle 50%
    // Middle = Make Child
    const topZone = height * 0.25;
    const bottomZone = height * 0.75;

    let action = '';

    if (relativeY < topZone) {
        action = 'before';
    } else if (relativeY > bottomZone) {
        action = 'after';
    } else {
        action = 'child';
    }

    this.insertDropPlaceholder(targetLi, action);
  }

  handleDragLeave(e) {
      // Logic to remove placeholder if leaving the tree entirely
      if (!this.fileTree.contains(e.relatedTarget)) {
          this.removeDropPlaceholder();
      }
  }

  handleDrop(e) {
    e.preventDefault();
    
    // If we have a valid calculated action from DragOver, use it.
    // This is more reliable than recalculating on drop because of layout shifts.
    if (!this.dropAction || !this.dropTargetId || !this.draggedNoteId) {
        this.removeDropPlaceholder();
        return;
    }

    const action = this.dropAction;
    const targetId = this.dropTargetId;
    const draggedNote = this.notes.find(n => n.id === this.draggedNoteId);
    const targetNote = this.notes.find(n => n.id === targetId);

    // Clean up UI immediately
    this.removeDropPlaceholder();
    this.fileTree.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));

    if (!draggedNote || !targetNote) return;

    if (action === 'child') {
        // Move as child
        this.emit('noteMoved', { 
            project: this.currentProject, 
            noteId: this.draggedNoteId, 
            newParentId: targetId 
        });
    } 
    else if (action === 'before' || action === 'after') {
        // Move as sibling
        const newParentId = targetNote.parentId;
        const areSiblings = draggedNote.parentId === newParentId;

        if (areSiblings) {
            // Optimistic reordering
            const siblings = this.notes
                .filter(n => n.parentId === newParentId)
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            
            const siblingsWithoutDragged = siblings.filter(n => n.id !== this.draggedNoteId);
            const targetIndex = siblingsWithoutDragged.findIndex(n => n.id === targetId);
            
            const insertionIndex = action === 'before' ? targetIndex : targetIndex + 1;
            const newOrder = [...siblingsWithoutDragged];
            newOrder.splice(insertionIndex, 0, draggedNote);
            
            this.emit('notesReordered', {
                project: this.currentProject,
                noteIds: newOrder.map(n => n.id),
                parentId: newParentId
            });
        } else {
            // Moving to a new parent (specifically, the target's parent)
            // Note: True reordering across parents usually requires a two-step backend process 
            // or a specific API. For now, we move it to the parent.
            this.emit('noteMoved', { 
                project: this.currentProject, 
                noteId: this.draggedNoteId, 
                newParentId: newParentId 
            });
            // ToDo: Implement moveWithIndex in backend for perfect cross-parent placement
        }
    }
  }

  handleDragEnd(e) {
    this.draggedNoteId = null;
    this.removeDropPlaceholder();
    this.fileTree.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
  }

  isDescendant(draggedId, targetId) {
      const notesMap = new Map(this.notes.map(note => [note.id, note]));
      let currentId = targetId;
      while (currentId) {
          if (currentId === draggedId) return true;
          const currentNote = notesMap.get(currentId);
          currentId = currentNote ? currentNote.parentId : null;
      }
      return false;
  }
  
  // --- Context Menu and In-Place Editing methods ---
  
  showContextMenu(x, y, noteId) {
    const items = [
        { label: 'Rename', callback: () => this.beginRenameNote(noteId) },
        { 
          label: 'Delete', 
          callback: () => {
              const li = this.fileTree.querySelector(`li[data-note-id="${noteId}"]`);
              if (!li) return;
              const name = li.querySelector('.file-item-name').textContent.replace(/\s*\*$/, '');
              this.emit('deleteNoteRequested', { project: this.currentProject, file: noteId, name: name });
          }
        },
        { type: 'separator' },
        { label: 'Duplicate', disabled: true },
        { label: 'Open to the Right', disabled: true },
        { label: 'Change Icon', disabled: true },
        { label: 'Open in New Tab', disabled: true },
        { label: 'Show in System Explorer', disabled: true },
    ];
    this.contextMenuService.show(x, y, items);
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
            if (toggleIcon) toggleIcon.textContent = '▼'; 
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