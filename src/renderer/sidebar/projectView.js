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
    this.dropPlaceholder = null; // Placeholder element showing drop position
    this.dropPlaceholderInsertBefore = false; // Whether placeholder is before or after target
    this.dropPlaceholderTargetId = null; // ID of target note (more stable than element reference)
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
    // --- START: MODIFICATION ---
    // Preserve the set of expanded notes before re-rendering
    const expandedNoteIds = new Set();
    this.fileTree.querySelectorAll('li.expanded[data-note-id]').forEach(li => {
        expandedNoteIds.add(li.dataset.noteId);
    });
    // --- END: MODIFICATION ---

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
    // --- START: MODIFICATION ---
    // Restore the expanded state
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
    // --- END: MODIFICATION ---

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
    this.draggedNoteId = li.dataset.noteId;
    e.dataTransfer.effectAllowed = 'move';
    // Use a timeout to allow the browser to create the drag image before applying the class
    setTimeout(() => li.classList.add('is-dragging'), 0);
  }

  removeDropPlaceholder() {
    if (this.dropPlaceholder && this.dropPlaceholder.parentNode) {
      console.log('[Placeholder] Removing placeholder', {
        targetId: this.dropPlaceholderTargetId,
        insertBefore: this.dropPlaceholderInsertBefore
      });
      this.dropPlaceholder.parentNode.removeChild(this.dropPlaceholder);
      this.dropPlaceholder = null;
      this.dropPlaceholderTarget = null;
      this.dropPlaceholderTargetId = null;
    }
  }

  insertDropPlaceholder(targetLi, insertBefore) {
    const targetId = targetLi.dataset.noteId;
    
    // Check if placeholder is already in the correct position (using ID for stability)
    // Also verify the placeholder is actually in the DOM and in the right position
    if (this.dropPlaceholder && 
        this.dropPlaceholderTargetId === targetId && 
        this.dropPlaceholderInsertBefore === insertBefore &&
        this.dropPlaceholder.parentNode) {
      // Verify it's actually in the right position in the DOM
      const parentUl = targetLi.parentNode;
      if (this.dropPlaceholder.parentNode === parentUl) {
        // Check if placeholder is in the correct position relative to targetLi
        const placeholderIsBefore = this.dropPlaceholder.nextSibling === targetLi;
        const placeholderIsAfter = targetLi.nextSibling === this.dropPlaceholder;
        
        if ((insertBefore && placeholderIsBefore) || (!insertBefore && placeholderIsAfter)) {
          // Placeholder is already in the right place, no need to update
          console.log('[Placeholder] Skipping update - already in correct position', {
            targetId,
            insertBefore,
            currentTargetId: this.dropPlaceholderTargetId,
            currentInsertBefore: this.dropPlaceholderInsertBefore,
            placeholderIsBefore,
            placeholderIsAfter
          });
          return;
        }
      }
    }
    
    console.log('[Placeholder] Inserting placeholder', {
      targetId,
      insertBefore,
      hadPlaceholder: !!this.dropPlaceholder,
      oldTargetId: this.dropPlaceholderTargetId,
      oldInsertBefore: this.dropPlaceholderInsertBefore
    });
    
    // Remove existing placeholder if it exists
    if (this.dropPlaceholder && this.dropPlaceholder.parentNode) {
      console.log('[Placeholder] Removing old placeholder');
      this.dropPlaceholder.parentNode.removeChild(this.dropPlaceholder);
    }
    
    // Create placeholder element
    const placeholder = document.createElement('li');
    placeholder.className = 'drop-placeholder';
    placeholder.setAttribute('data-placeholder', 'true');
    
    // Find the parent ul (could be file-tree or nested-notes)
    const parentUl = targetLi.parentNode;
    
    if (insertBefore) {
      parentUl.insertBefore(placeholder, targetLi);
    } else {
      // Insert after targetLi
      const nextSibling = targetLi.nextSibling;
      if (nextSibling) {
        parentUl.insertBefore(placeholder, nextSibling);
      } else {
        parentUl.appendChild(placeholder);
      }
    }
    
    this.dropPlaceholder = placeholder;
    this.dropPlaceholderInsertBefore = insertBefore;
    this.dropPlaceholderTarget = targetLi; // Store reference to target note
    this.dropPlaceholderTargetId = targetId; // Store ID for stable comparison
    
    console.log('[Placeholder] Placeholder inserted successfully', {
      targetId,
      insertBefore,
      parentNode: parentUl.className
    });
  }

  handleDragOver(e) {
    e.preventDefault();
    
    // Debounce: only process dragOver every 16ms (~60fps) to reduce sensitivity
    const now = performance.now();
    const timeSinceLastUpdate = now - this.lastDragOverTime;
    const debounceDelay = 16; // ~60fps
    
    // Capture event data before debouncing (events are reused by browser)
    let targetLi = e.target.closest('li[data-note-id]');

    // If hovering over the placeholder, use the stored target to prevent flickering
    // This is crucial because the placeholder covers the gap, and hovering it would otherwise
    // result in targetLi being null, causing the placeholder to be removed, then re-added, loop.
    if (!targetLi && e.target.closest('.drop-placeholder')) {
      targetLi = this.dropPlaceholderTarget;
    }

    const clientY = e.clientY;
    
    if (timeSinceLastUpdate < debounceDelay) {
      // Clear existing timeout and set a new one
      if (this.dragOverTimeout) {
        clearTimeout(this.dragOverTimeout);
      }
      
      // Store the event data for later processing
      this.dragOverTimeout = setTimeout(() => {
        this.processDragOver(targetLi, clientY);
        this.lastDragOverTime = performance.now();
        this.dragOverTimeout = null;
      }, debounceDelay - timeSinceLastUpdate);
      
      return;
    }
    
    // Process immediately if enough time has passed
    this.processDragOver(targetLi, clientY);
    this.lastDragOverTime = now;
  }

  processDragOver(targetLi, clientY) {
    
    // Clear all drop indicators
    this.fileTree.querySelectorAll('.drop-target-child').forEach(el => el.classList.remove('drop-target-child'));
    this.fileTree.querySelectorAll('.drop-target-before').forEach(el => el.classList.remove('drop-target-before'));
    this.fileTree.querySelectorAll('.drop-target-after').forEach(el => el.classList.remove('drop-target-after'));
    
    if (targetLi && this.draggedNoteId) {
        const targetId = targetLi.dataset.noteId;
        const draggedNote = this.notes.find(n => n.id === this.draggedNoteId);
        const targetNote = this.notes.find(n => n.id === targetId);
        
        if (!draggedNote || !targetNote) return;
        
        const isDescendant = this.isDescendant(this.draggedNoteId, targetId);
        
        if (targetId === this.draggedNoteId || isDescendant) {
            // Remove placeholder if invalid drop
            this.removeDropPlaceholder();
            return; // Can't drop on self or descendant
        }
        
        // Get element position BEFORE any DOM manipulation (placeholder can shift elements)
        const rect = targetLi.getBoundingClientRect();
        const container = targetLi.querySelector('.file-item-container');
        const relativeY = clientY - rect.top;
        const height = rect.height;
        
        // If placeholder exists and is for this target, account for its height in calculations
        // This prevents zone switching when placeholder is inserted/removed
        let adjustedHeight = height;
        let adjustedRelativeY = relativeY;
        if (this.dropPlaceholder && 
            this.dropPlaceholderTargetId === targetId && 
            this.dropPlaceholder.parentNode === targetLi.parentNode) {
          // Placeholder exists for this target - account for it in position calculations
          const placeholderHeight = this.dropPlaceholder.offsetHeight || height;
          if (this.dropPlaceholderInsertBefore) {
            // Placeholder is before target, so target is shifted down
            adjustedRelativeY = relativeY + placeholderHeight;
            adjustedHeight = height + placeholderHeight;
          } else {
            // Placeholder is after target, doesn't affect relativeY calculation
            // But we should account for it in threshold calculations
          }
        }
        
        // Add small buffer zones to prevent flickering at boundaries
        const topThreshold = adjustedHeight * 0.3; // Top 30% for reorder before
        const bottomThreshold = adjustedHeight * 0.7; // Bottom 30% for reorder after
        const topBuffer = adjustedHeight * 0.05; // 5% buffer zone
        const bottomBuffer = adjustedHeight * 0.05; // 5% buffer zone
        
        // Check if they're siblings (same parent)
        const areSiblings = draggedNote.parentId === targetNote.parentId;
        
        // Determine zone with hysteresis to prevent flickering
        // Use adjusted values that account for placeholder position
        let currentZone = null;
        const wasSameTarget = this.dropPlaceholderTargetId === targetId;
        const hadPlaceholder = !!this.dropPlaceholder && this.dropPlaceholder.parentNode;
        
        // Use original relativeY for zone detection (not adjusted) since we want mouse position relative to target
        // But use adjusted thresholds when placeholder exists
        const zoneRelativeY = relativeY; // Always use original relativeY for zone detection
        
        if (wasSameTarget && hadPlaceholder) {
          // If we're already showing placeholder for this target, use stronger hysteresis
          if (this.dropPlaceholderInsertBefore) {
            // Currently showing "before" - only switch if clearly in another zone
            // Use larger buffer to prevent flickering
            // Since placeholder is before, we need to check against original height thresholds
            if (zoneRelativeY > (height * 0.7) + (bottomBuffer * 2)) {
              currentZone = 'after';
            } else if (zoneRelativeY > (height * 0.3) + (topBuffer * 3)) {
              // Stay in before zone with larger buffer
              currentZone = 'before';
            } else {
              currentZone = 'before';
            }
          } else if (this.dropPlaceholderTargetId) {
            // Currently showing "after" - only switch if clearly in another zone
            if (zoneRelativeY < (height * 0.3) - (topBuffer * 2)) {
              currentZone = 'before';
            } else if (zoneRelativeY < (height * 0.7) - (bottomBuffer * 3)) {
              // Stay in after zone with larger buffer
              currentZone = 'after';
            } else {
              currentZone = 'after';
            }
          } else {
            // Fallback to normal thresholds
            if (zoneRelativeY < height * 0.3) {
              currentZone = 'before';
            } else if (zoneRelativeY > height * 0.7) {
              currentZone = 'after';
            } else {
              currentZone = 'middle';
            }
          }
        } else {
          // New target or no placeholder, use normal thresholds with original height
          if (zoneRelativeY < height * 0.3) {
            currentZone = 'before';
          } else if (zoneRelativeY > height * 0.7) {
            currentZone = 'after';
          } else {
            currentZone = 'middle';
          }
        }
        
        console.log('[DragOver] Zone calculation', {
          targetId,
          relativeY: relativeY.toFixed(1),
          height: height.toFixed(1),
          topThreshold: topThreshold.toFixed(1),
          bottomThreshold: bottomThreshold.toFixed(1),
          wasSameTarget,
          previousZone: this.dropPlaceholderInsertBefore ? 'before' : (this.dropPlaceholderTargetId ? 'after' : 'none'),
          currentZone,
          areSiblings,
          placeholderExists: !!this.dropPlaceholder,
          placeholderTargetId: this.dropPlaceholderTargetId
        });
        
        if (currentZone === 'before') {
            // Top area: reorder before
            container.classList.add('drop-target-before');
            // Only show placeholder for reordering (not for indenting)
            if (areSiblings) {
                this.insertDropPlaceholder(targetLi, true);
            } else {
                // Only remove if we had a placeholder for this target
                if (this.dropPlaceholderTargetId === targetId) {
                    this.removeDropPlaceholder();
                }
            }
        } else if (currentZone === 'after') {
            // Bottom area: reorder after
            container.classList.add('drop-target-after');
            // Only show placeholder for reordering (not for indenting)
            if (areSiblings) {
                this.insertDropPlaceholder(targetLi, false);
            } else {
                // Only remove if we had a placeholder for this target
                if (this.dropPlaceholderTargetId === targetId) {
                    this.removeDropPlaceholder();
                }
            }
        } else {
            // Middle area: indent (move as child)
            container.classList.add('drop-target-child');
            // Only remove placeholder if we're on the same target (entering middle zone)
            // But add a small delay/hysteresis to prevent flickering
            if (this.dropPlaceholderTargetId === targetId) {
                // Only remove if we're clearly in the middle zone (not near boundaries)
                const middleZoneStart = height * 0.3;
                const middleZoneEnd = height * 0.7;
                const middleBuffer = height * 0.1; // 10% buffer
                
                if (relativeY > middleZoneStart + middleBuffer && relativeY < middleZoneEnd - middleBuffer) {
                    console.log('[DragOver] Removing placeholder - clearly in middle zone', { 
                        targetId, 
                        relativeY: relativeY.toFixed(1),
                        middleZoneStart: (middleZoneStart + middleBuffer).toFixed(1),
                        middleZoneEnd: (middleZoneEnd - middleBuffer).toFixed(1)
                    });
                    this.removeDropPlaceholder();
                } else {
                    // Near boundary, keep placeholder to prevent flickering
                    console.log('[DragOver] Keeping placeholder - near boundary', {
                        targetId,
                        relativeY: relativeY.toFixed(1)
                    });
                }
            }
        }
    } else {
        // No valid target, remove placeholder
        this.removeDropPlaceholder();
    }
  }
  
  handleDragLeave(e) {
      const relatedTarget = e.relatedTarget;
      // Only remove the class if leaving the file tree area entirely
      if (!this.fileTree.contains(relatedTarget)) {
          this.fileTree.querySelectorAll('.drop-target-child').forEach(el => el.classList.remove('drop-target-child'));
          this.fileTree.querySelectorAll('.drop-target-before').forEach(el => el.classList.remove('drop-target-before'));
          this.fileTree.querySelectorAll('.drop-target-after').forEach(el => el.classList.remove('drop-target-after'));
          this.removeDropPlaceholder();
      }
  }

  handleDrop(e) {
    e.preventDefault();
    
    // If dropping on placeholder, use the stored target
    const placeholder = e.target.closest('li.drop-placeholder');
    let dropTarget = e.target.closest('li[data-note-id]');
    
    // Store placeholder info before removing it
    const wasDroppingOnPlaceholder = placeholder && this.dropPlaceholder;
    const wasInsertBefore = this.dropPlaceholderInsertBefore;
    const placeholderTarget = this.dropPlaceholderTarget;
    
    // If we dropped on the placeholder, use the stored target note
    if (wasDroppingOnPlaceholder && placeholderTarget && !dropTarget) {
      dropTarget = placeholderTarget;
    }
    
    // Remove placeholder before processing drop
    this.removeDropPlaceholder();
    
    if (!dropTarget || !this.draggedNoteId) return;
    
    const targetId = dropTarget.dataset.noteId;
    const draggedNote = this.notes.find(n => n.id === this.draggedNoteId);
    const targetNote = this.notes.find(n => n.id === targetId);
    
    if (!draggedNote || !targetNote) return;
    
    const isDescendant = this.isDescendant(this.draggedNoteId, targetId);
    if (targetId === this.draggedNoteId || isDescendant) {
        return; // Invalid drop
    }
    
    // Check if they're siblings (same parent)
    const areSiblings = draggedNote.parentId === targetNote.parentId;
    
    // Determine drop action: 'before', 'after', or 'indent'
    let dropAction = 'indent'; // Default to indent
    
    if (wasDroppingOnPlaceholder) {
      // Use stored position from placeholder
      dropAction = wasInsertBefore ? 'before' : 'after';
    } else {
      // Calculate from mouse position
      const rect = dropTarget.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const height = rect.height;
      const topThreshold = height * 0.3; // Top 30% for reorder before
      const bottomThreshold = height * 0.7; // Bottom 30% for reorder after
      
      if (relativeY < topThreshold) {
        dropAction = 'before';
      } else if (relativeY > bottomThreshold) {
        dropAction = 'after';
      } else {
        dropAction = 'indent';
      }
    }
    
    if (dropAction === 'before') {
        // Top area: reorder before
        if (areSiblings) {
            // Get all siblings in current order
            const siblings = this.notes
                .filter(n => n.parentId === draggedNote.parentId)
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            
            // Remove dragged note from siblings
            const siblingsWithoutDragged = siblings.filter(n => n.id !== this.draggedNoteId);
            
            // Find target index
            const targetIndex = siblingsWithoutDragged.findIndex(n => n.id === targetId);
            
            // Insert dragged note before target
            const newOrder = [...siblingsWithoutDragged];
            newOrder.splice(targetIndex, 0, draggedNote);
            
            const noteIds = newOrder.map(n => n.id);
            this.emit('notesReordered', {
                project: this.currentProject,
                noteIds: noteIds,
                parentId: draggedNote.parentId
            });
        } else {
            // Not siblings, but top area - treat as reorder before (move to same parent as target, then reorder)
            // First move to target's parent, then reorder
            const targetSiblings = this.notes
                .filter(n => n.parentId === targetNote.parentId)
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            
            const targetIndex = targetSiblings.findIndex(n => n.id === targetId);
            const newOrder = [...targetSiblings];
            newOrder.splice(targetIndex, 0, draggedNote);
            
            // First move, then the moveNote handler will handle reordering
            this.emit('noteMoved', { 
                project: this.currentProject, 
                noteId: this.draggedNoteId, 
                newParentId: targetNote.parentId 
            });
            
            // Note: We can't easily reorder immediately after moving because moveNote
            // will reload notes. The order will be set correctly in moveNote.
        }
    } else if (dropAction === 'after') {
        // Bottom area: reorder after
        if (areSiblings) {
            // Get all siblings in current order
            const siblings = this.notes
                .filter(n => n.parentId === draggedNote.parentId)
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            
            // Remove dragged note from siblings
            const siblingsWithoutDragged = siblings.filter(n => n.id !== this.draggedNoteId);
            
            // Find target index
            const targetIndex = siblingsWithoutDragged.findIndex(n => n.id === targetId);
            
            // Insert dragged note after target
            const newOrder = [...siblingsWithoutDragged];
            newOrder.splice(targetIndex + 1, 0, draggedNote);
            
            const noteIds = newOrder.map(n => n.id);
            this.emit('notesReordered', {
                project: this.currentProject,
                noteIds: noteIds,
                parentId: draggedNote.parentId
            });
        } else {
            // Not siblings, but bottom area - treat as reorder after (move to same parent as target, then reorder)
            this.emit('noteMoved', { 
                project: this.currentProject, 
                noteId: this.draggedNoteId, 
                newParentId: targetNote.parentId 
            });
        }
    } else {
        // Middle area: indent (move as child)
        this.emit('noteMoved', { 
            project: this.currentProject, 
            noteId: this.draggedNoteId, 
            newParentId: targetId 
        });
    }
  }

  handleDragEnd(e) {
    // Clear any pending dragOver timeout
    if (this.dragOverTimeout) {
      clearTimeout(this.dragOverTimeout);
      this.dragOverTimeout = null;
    }
    
    this.draggedNoteId = null;
    this.fileTree.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    this.fileTree.querySelectorAll('.drop-target-child').forEach(el => el.classList.remove('drop-target-child'));
    this.fileTree.querySelectorAll('.drop-target-before').forEach(el => el.classList.remove('drop-target-before'));
    this.fileTree.querySelectorAll('.drop-target-after').forEach(el => el.classList.remove('drop-target-after'));
    this.removeDropPlaceholder();
    this.lastDragOverTime = 0;
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
  
  // --- Context Menu and In-Place Editing methods from here down ---
  
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