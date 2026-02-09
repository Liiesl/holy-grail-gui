// src/renderer/mainArea.js

import { Tabs } from './tabs.js';
import { Editor } from './editor/editor.js';

/**
 * Manages the main content area of the application, including the tab bar,
 * editor panes, and the welcome message. It orchestrates the creation and
 * layout of editors.
 */
export class Main {
  constructor(projectState, hgmd, container, contextMenuService) {
    this.projectState = projectState;
    this.hgmd = hgmd;
    this.container = container;
    this.contextMenuService = contextMenuService;

    // State managed by this component
    this.editors = new Map();
    this.tabInstances = new Map();
    this.paneLayout = { id: 'root', type: 'leaf', fileIds: [], activeFileId: null };
    this.activePaneId = 'root';
    this.dropInfo = null; // For D&D visual feedback
    this.isInternalLayoutChange = false; // Flag to prevent re-entrant rendering
    this.currentDragTargetPane = null; // Cache the current pane for D&D performance

    this.listeners = {};

    // Track last known state to detect actual changes
    this.lastOpenTabs = [];
    this.lastActiveTabId = null;

    this.render();
    this.initElements();
    this.addEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div id="app-editors-wrapper">
         <div id="welcome-message" class="editor-instance">
            <p>Select a page to begin, or create a new one.</p>
         </div>
         <div id="drop-overlay" class="hidden"></div>
      </div>
    `;
  }

  initElements() {
    this.editorsWrapper = this.container.querySelector('#app-editors-wrapper');
    this.welcomeMessageEl = this.container.querySelector('#welcome-message');
    this.dropOverlay = this.container.querySelector('#drop-overlay');
  }

  addEventListeners() {
    this.addPaneDragAndDropListeners();
    this.addPaneFocusListener();
  }

  _wireUpTabInstanceEventListeners(tabsInstance, paneId) {
    tabsInstance.on('setActiveTabRequested', ({ fileId }) => {
        const pane = this.findNode(n => n.id === paneId);
        if (pane) pane.activeFileId = fileId;
        this.emit('setActiveTabRequested', { fileId });
    });

    tabsInstance.on('tabCloseRequested', ({ fileId }) => {
        const instance = this.editors.get(fileId);
        if (instance && !instance.editor.confirmDiscardChanges()) return;
        this.emit('closeTabRequested', { fileId });
    });
    
    tabsInstance.on('closeOtherTabsRequested', ({ fileId }) => {
        let canClose = true;
        for (const [id, instance] of this.editors.entries()) {
            if (id !== fileId && instance.editor.isDirty) {
                if (!instance.editor.confirmDiscardChanges()) {
                    canClose = false;
                    break;
                }
            }
        }
        if (canClose) this.emit('closeOtherTabsRequested', { fileId });
    });

    tabsInstance.on('tabDropped', ({ fileId }) => {
        this.handleTabMove(fileId, paneId);
    });
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

  // --- Public API for App.js ---
  
  getActiveEditor() {
    const activeFileId = this.projectState.activeTabId;
    return activeFileId ? this.editors.get(activeFileId)?.editor : null;
  }
  
  getPaneLayout() {
    return this.paneLayout;
  }
  
  setPaneLayout(layout) {
    const fixLayout = (node) => {
        if (node.type === 'leaf') {
            if (node.fileId) {
                node.fileIds = node.fileId ? [node.fileId] : [];
                node.activeFileId = node.fileId;
                delete node.fileId;
            }
            if (!node.fileIds) node.fileIds = [];
        }
        if (node.type === 'group') node.children.forEach(fixLayout);
        return node;
    }
    this.paneLayout = layout ? fixLayout(layout) : { id: 'root', type: 'leaf', fileIds: [], activeFileId: null };
  }

  updateOnTabsChanged({ openTabs, activeTabId }) {
    if (this.isInternalLayoutChange) return;

    // Check if only dirty state changed (no structural changes)
    const currentFileIds = openTabs.map(t => t.fileId).sort().join(',');
    const lastFileIds = this.lastOpenTabs.map(t => t.fileId).sort().join(',');
    const filesChanged = currentFileIds !== lastFileIds;
    const activeTabChanged = activeTabId !== this.lastActiveTabId;

    // Find active pane
    const activePane = this.findNodeByFileId(activeTabId, this.paneLayout);
    if (activePane) {
        this.activePaneId = activePane.id;
        activePane.activeFileId = activeTabId;
    }

    // If only dirty states changed, just update tab indicators without full re-render
    if (!filesChanged && !activeTabChanged) {
        this.updateTabDirtyStates(openTabs);
        this.lastOpenTabs = openTabs;
        return;
    }

    const openFileIds = new Set(openTabs.map(t => t.fileId));
    this._pruneAndCompactLayout(openFileIds); // Use the new helper method

    const allFilesInLayout = new Set(this.getAllFileIdsInLayout());
    for (const fileId of this.editors.keys()) {
        if (!allFilesInLayout.has(fileId)) {
            const instance = this.editors.get(fileId);
            instance.container.remove();
            this.editors.delete(fileId);
        }
    }

    this.renderPanes({ openTabs });
    
    // Update last known state
    this.lastOpenTabs = openTabs;
    this.lastActiveTabId = activeTabId;
  }

  /**
   * Update only the dirty state indicators on tabs without re-rendering the entire layout
   */
  updateTabDirtyStates(openTabs) {
    // Update dirty state on tab elements
    openTabs.forEach(tab => {
        const tabEl = this.editorsWrapper.querySelector(`[data-tab-id="${tab.fileId}"]`);
        if (tabEl) {
            tabEl.classList.toggle('dirty', tab.isDirty);
        }
    });

    // Also update the tabs instances if they exist
    this.tabInstances.forEach((tabsInstance) => {
        // Get the pane ID for this tabs instance
        const paneEl = tabsInstance.container.closest('.pane');
        if (paneEl) {
            const paneId = paneEl.dataset.paneId;
            const pane = this.findNode(n => n.id === paneId);
            if (pane) {
                const paneTabs = openTabs.filter(t => pane.fileIds.includes(t.fileId));
                tabsInstance.update({ openTabs: paneTabs, activeTabId: pane.activeFileId });
            }
        }
    });
  }

  async openOrFocusFile(project, fileId) {
    const existingPane = this.findNodeByFileId(fileId, this.paneLayout);
    if (existingPane) {
      this.emit('setActiveTabRequested', { fileId });
    } else {
      const success = await this.ensureEditorExists(project, fileId);
      if (success) {
        const activePane = this.findNode(n => n.id === this.activePaneId) || this.paneLayout;
        if (activePane.type === 'leaf') {
            if (!activePane.fileIds.includes(fileId)) activePane.fileIds.push(fileId);
            activePane.activeFileId = fileId;
        }
        this.emit('openTabRequested', { projectPath: project.path, fileId });
      }
    }
  }

  async ensureEditorExists(project, fileId) {
    if (this.editors.has(fileId)) return true;

    const editorContainer = document.createElement('div');
    editorContainer.className = 'editor-instance';
    
    const newEditor = new Editor(this.projectState, this.hgmd, editorContainer);
    this.editors.set(fileId, { editor: newEditor, container: editorContainer, project: project });

    newEditor.on('dirtyStateChanged', ({ isDirty }) => this.emit('editorDirtyStateChanged', { fileId, isDirty }));
    newEditor.on('noteSaved', () => {
        const pane = this.findNodeByFileId(fileId, this.paneLayout);
        if (pane && pane.id === this.activePaneId) this.emit('noteSavedInActivePane', { project, fileId });
    });
    // --- NEW: Listen for the split pane command from the editor ---
    newEditor.on('splitPaneRight', ({ fileId }) => this.handleSplitPaneRight(fileId));


    const loadSuccess = await newEditor.loadNoteContent(project.path, fileId);
    if (loadSuccess) {
        newEditor.setCurrentFile(project, fileId);
        return true;
    } else {
        console.error(`Failed to load note content for ${fileId}`);
        this.editors.delete(fileId);
        editorContainer.remove();
        return false;
    }
  }

  // --- Pane Management Methods (Internal) ---

  /**
   * NEW: Handles the logic for splitting the current file into a new pane on the right.
   * @param {string} fileId The ID of the file/tab to move.
   */
  handleSplitPaneRight(fileId) {
    const layoutCopy = JSON.parse(JSON.stringify(this.paneLayout));
    const sourceNode = this.findNode(n => n.type === 'leaf' && n.fileIds.includes(fileId), layoutCopy);

    if (!sourceNode) return;

    if (sourceNode.fileIds.length <= 1) {
        alert('This command only works when the current pane has more than one tab.');
        return;
    }

    // 1. Remove file from the source node in our layout copy
    sourceNode.fileIds = sourceNode.fileIds.filter(id => id !== fileId);
    if (sourceNode.activeFileId === fileId) {
        sourceNode.activeFileId = sourceNode.fileIds[sourceNode.fileIds.length - 1] || null;
    }
    
    // 2. Define a recursive function to find the source node and replace it with a new group
    const replaceAndSplitNode = (nodeToTransform) => {
        if (nodeToTransform.id === sourceNode.id) {
            // The node to transform is the one we modified earlier.
            // Wrap it in a new horizontal group with the new pane.
            return {
                id: `group_${Date.now()}`,
                type: 'group',
                direction: 'row', // Horizontal split
                children: [
                    nodeToTransform, // The original pane (now with one less tab)
                    {                // The new pane for the moved tab
                        id: `pane_${Date.now()}`,
                        type: 'leaf',
                        fileIds: [fileId],
                        activeFileId: fileId
                    }
                ],
            };
        }
        // If it's a group, recurse on its children to find the node.
        if (nodeToTransform.type === 'group') {
            nodeToTransform.children = nodeToTransform.children.map(replaceAndSplitNode);
        }
        return nodeToTransform;
    };

    // 3. Flag that we're making an internal change to prevent conflicting re-renders
    this.isInternalLayoutChange = true;

    // 4. Apply the transformation to the entire layout structure
    this.paneLayout = replaceAndSplitNode(layoutCopy);
    
    this._pruneAndCompactLayout();
    
    this.renderPanes({ openTabs: this.projectState.openTabs });

    // 7. Update the global state to make the newly moved tab active
    this.emit('setActiveTabRequested', { fileId: fileId });
    
    this.isInternalLayoutChange = false;
  }


  _pruneAndCompactLayout(openFileIds) {
    const prune = (node, isTheRootNode) => {
        if (!node) return null;
        if (node.type === 'leaf') {
            if (openFileIds) {
              node.fileIds = node.fileIds.filter(id => openFileIds.has(id));
            }
            // Prune empty leaf nodes, unless it's the very last top-level pane.
            if (node.fileIds.length === 0 && !isTheRootNode) {
                return null;
            }
            if (node.activeFileId && !node.fileIds.includes(node.activeFileId)) {
                node.activeFileId = node.fileIds[node.fileIds.length - 1] || null;
            }
            return node;
        }
        if (node.type === 'group') {
            // Children of a group are never "the root node"
            node.children = node.children.map(child => prune(child, false)).filter(Boolean);
            if (node.children.length === 0) return null; // Group is empty
            if (node.children.length === 1) return node.children[0]; // Group is redundant, collapse it.
            return node;
        }
        return node;
    };
    // The top-level node passed to prune is considered "the root node".
    const newLayout = prune(JSON.parse(JSON.stringify(this.paneLayout)), true);
    this.paneLayout = newLayout || { id: 'root', type: 'leaf', fileIds: [], activeFileId: null };

    // --- START OF THE FIX ---
    // After pruning, the active pane might have been removed. We must ensure
    // this.activePaneId still points to a valid pane in the new layout.
    const activePaneExists = this.findNode(n => n.id === this.activePaneId);
    if (!activePaneExists) {
      // If the old active pane is gone, find the new one.
      // Priority 1: The pane that contains the globally active tab.
      const paneWithActiveTab = this.findNodeByFileId(this.projectState.activeTabId);
      if (paneWithActiveTab) {
        this.activePaneId = paneWithActiveTab.id;
      } else {
        // Priority 2 (fallback): The first available leaf pane.
        const firstLeaf = this.findNode(n => n.type === 'leaf');
        // Ensure we fall back to a valid ID even if no leaves exist (e.g., last tab closed)
        this.activePaneId = firstLeaf ? firstLeaf.id : (this.paneLayout.id || 'root');
      }
    }
    // --- END OF THE FIX ---
  }
  
  renderPanes({ openTabs } = { openTabs: [] }) {
    const activeContent = document.activeElement;
    const activeEditor = this.getActiveEditor();
    
    // Save cursor position and scroll position before re-rendering
    let savedCursorOffset = null;
    let savedScrollTop = null;
    if (activeEditor && activeEditor.editorEl && document.activeElement === activeEditor.editorEl) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            savedCursorOffset = this.getCursorOffset(activeEditor.editorEl);
            savedScrollTop = activeEditor.editorEl.scrollTop;
        }
    }

    this.editorsWrapper.innerHTML = '';
    this.editorsWrapper.appendChild(this.welcomeMessageEl);
    this.editorsWrapper.appendChild(this.dropOverlay);
    this.tabInstances.clear();

    const buildNode = (node) => {
        if (!node) return null;
        if (node.type === 'leaf') {
            const paneEl = document.createElement('div');
            paneEl.className = 'pane';
            paneEl.dataset.paneId = node.id;
            
            const tabsContainer = document.createElement('div');
            const editorArea = document.createElement('div');
            editorArea.className = 'pane-editor-area';

            paneEl.appendChild(tabsContainer);
            paneEl.appendChild(editorArea);

            const paneTabs = openTabs.filter(t => node.fileIds.includes(t.fileId));
            
            if (paneTabs.length > 0) {
                const tabsInstance = new Tabs(tabsContainer, this.contextMenuService);
                this.tabInstances.set(node.id, tabsInstance);
                this._wireUpTabInstanceEventListeners(tabsInstance, node.id);
                tabsInstance.update({ openTabs: paneTabs, activeTabId: node.activeFileId });
                
                const editorInstance = this.editors.get(node.activeFileId);
                if (editorInstance) editorArea.appendChild(editorInstance.container);
            }
            if (node.id === this.activePaneId) paneEl.classList.add('active');
            return paneEl;
        } else if (node.type === 'group') {
            const groupEl = document.createElement('div');
            groupEl.className = `pane-group ${node.direction === 'row' ? 'horizontal' : 'vertical'}`;
            
            node.children.forEach((child, index) => {
                groupEl.appendChild(buildNode(child));
                if (index < node.children.length - 1) {
                    const splitter = document.createElement('div');
                    splitter.className = 'pane-splitter';
                    groupEl.appendChild(splitter);
                }
            });
            return groupEl;
        }
    };

    const rootEl = buildNode(this.paneLayout);
    if (rootEl) this.editorsWrapper.insertBefore(rootEl, this.welcomeMessageEl);
    
    const hasOpenFile = this.getAllFileIdsInLayout().length > 0;
    this.welcomeMessageEl.style.display = hasOpenFile ? 'none' : 'flex';

    // Update last known state after re-render
    this.lastOpenTabs = openTabs;
    this.lastActiveTabId = this.projectState.activeTabId;

    // Restore focus to the active editor and attempt to restore cursor position
    const newActiveEditor = this.getActiveEditor();
    if (newActiveEditor && newActiveEditor.editorEl) {
        newActiveEditor.editorEl.focus();
        
        // Restore cursor position by character offset
        if (savedCursorOffset !== null) {
            this.setCursorOffset(newActiveEditor.editorEl, savedCursorOffset);
        }
        
        // Restore scroll position
        if (savedScrollTop !== null) {
            newActiveEditor.editorEl.scrollTop = savedScrollTop;
        }
    } else if (document.body.contains(activeContent)) {
        activeContent.focus();
    }
  }

  /**
   * Get the cursor position as a character offset from the start of the editor
   * @param {HTMLElement} editorEl - The editor element
   * @returns {number} - Character offset
   */
  getCursorOffset(editorEl) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;
    
    const range = selection.getRangeAt(0);
    let offset = 0;
    let found = false;
    
    // Walk through all text nodes in the editor
    const walker = document.createTreeWalker(
      editorEl,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
      if (textNode === range.startContainer) {
        // Found the text node containing the cursor
        offset += range.startOffset;
        found = true;
        break;
      } else {
        // Add length of this text node
        offset += textNode.textContent.length;
      }
    }
    
    return offset;
  }

  /**
   * Set the cursor position by character offset
   * @param {HTMLElement} editorEl - The editor element
   * @param {number} targetOffset - Target character offset
   */
  setCursorOffset(editorEl, targetOffset) {
    let currentOffset = 0;
    
    // Walk through all text nodes
    const walker = document.createTreeWalker(
      editorEl,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let textNode;
    while (textNode = walker.nextNode()) {
      const nodeLength = textNode.textContent.length;
      
      if (currentOffset + nodeLength >= targetOffset) {
        // The cursor should be in this text node
        const range = document.createRange();
        const selection = window.getSelection();
        const offsetInNode = targetOffset - currentOffset;
        
        // Clamp offset to valid range
        const safeOffset = Math.max(0, Math.min(offsetInNode, nodeLength));
        
        range.setStart(textNode, safeOffset);
        range.collapse(true);
        
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      
      currentOffset += nodeLength;
    }
    
    // If we didn't find the exact position, place cursor at the end
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  findNode(predicate, node = this.paneLayout) {
    if (!node) return null;
    if (predicate(node)) return node;
    if (node.type === 'group') {
        for (const child of node.children) {
            const found = this.findNode(predicate, child);
            if (found) return found;
        }
    }
    return null;
  }

  findNodeByFileId(fileId, node = this.paneLayout) {
    if (!fileId) return null;
    return this.findNode(n => n.type === 'leaf' && n.fileIds.includes(fileId), node);
  }
  
  getAllFileIdsInLayout(node = this.paneLayout) {
    if (!node) return [];
    if (node.type === 'leaf') return node.fileIds || [];
    if (node.type === 'group') return node.children.flatMap(child => this.getAllFileIdsInLayout(child));
    return [];
  }

  handleTabMove(draggedFileId, targetPaneId) {
    const sourceNode = this.findNodeByFileId(draggedFileId);
    const targetNode = this.findNode(n => n.id === targetPaneId);

    if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return;

    // Update the data model first
    sourceNode.fileIds = sourceNode.fileIds.filter(id => id !== draggedFileId);
    if (sourceNode.activeFileId === draggedFileId) {
        sourceNode.activeFileId = sourceNode.fileIds[sourceNode.fileIds.length - 1] || null;
    }

    if (!targetNode.fileIds.includes(draggedFileId)) {
        targetNode.fileIds.push(draggedFileId);
    }
    targetNode.activeFileId = draggedFileId;

    // Run the pruning logic after the move
    this._pruneAndCompactLayout();

    this.isInternalLayoutChange = true;
    
    // Re-render the UI with the updated model
    this.renderPanes({ openTabs: this.projectState.openTabs });

    this.emit('setActiveTabRequested', { fileId: draggedFileId });
    
    this.isInternalLayoutChange = false;
  }

  addPaneFocusListener() {
    this.editorsWrapper.addEventListener('mousedown', (e) => {
        const targetPaneEl = e.target.closest('.pane');
        if (targetPaneEl && targetPaneEl.dataset.paneId) {
            const paneId = targetPaneEl.dataset.paneId;
            const paneNode = this.findNode(n => n.id === paneId);
            
            if (paneNode && paneNode.activeFileId && paneNode.activeFileId !== this.projectState.activeTabId) {
                this.emit('setActiveTabRequested', { fileId: paneNode.activeFileId });
            } else if (paneNode && !paneNode.activeFileId && this.activePaneId !== paneId) {
                this.activePaneId = paneId;
                this.renderPanes({ openTabs: this.projectState.openTabs });
            }
        }
    });
  }

  addPaneDragAndDropListeners() {
    this.editorsWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetPane = e.target.closest('.pane');

        // If there's no target pane, or we're not dragging a tab, hide overlay and return.
        if (!targetPane || !e.dataTransfer.types.includes('text/plain')) {
            if (this.currentDragTargetPane) {
                this.currentDragTargetPane = null;
                this.dropOverlay.classList.add('hidden');
                this.dropInfo = null;
            }
            return;
        }

        // Optimization: only reposition the overlay when the target pane changes.
        // This avoids expensive style recalculations on every mouse move.
        if (targetPane !== this.currentDragTargetPane) {
            this.currentDragTargetPane = targetPane;
            this.dropOverlay.classList.remove('hidden');
            const overlay = this.dropOverlay;
            overlay.style.top = `${targetPane.offsetTop}px`;
            overlay.style.left = `${targetPane.offsetLeft}px`;
            overlay.style.width = `${targetPane.offsetWidth}px`;
            overlay.style.height = `${targetPane.offsetHeight}px`;
            // Clear any previous side classes for a clean state
            overlay.classList.remove('show-left', 'show-right');
        }

        const rect = targetPane.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const dropZoneWidth = rect.width * 0.25;

        let side = null;
        if (x < dropZoneWidth) side = 'left';
        else if (x > rect.width - dropZoneWidth) side = 'right';

        // Optimization: use classes to show drop zones. Toggling classes is much faster
        // than changing styles directly, allowing the browser to use hardware acceleration.
        if (side) {
            this.dropInfo = { targetPaneId: targetPane.dataset.paneId, side };
            if (side === 'left' && !this.dropOverlay.classList.contains('show-left')) {
                this.dropOverlay.classList.add('show-left');
                this.dropOverlay.classList.remove('show-right');
            } else if (side === 'right' && !this.dropOverlay.classList.contains('show-right')) {
                this.dropOverlay.classList.add('show-right');
                this.dropOverlay.classList.remove('show-left');
            }
        } else {
            this.dropInfo = null;
            if (this.dropOverlay.classList.contains('show-left') || this.dropOverlay.classList.contains('show-right')) {
                this.dropOverlay.classList.remove('show-left', 'show-right');
            }
        }
    });

    this.editorsWrapper.addEventListener('dragleave', (e) => {
        // If the mouse leaves the wrapper entirely, hide the overlay.
        if (!this.editorsWrapper.contains(e.relatedTarget)) {
            this.dropOverlay.classList.add('hidden');
            this.dropOverlay.classList.remove('show-left', 'show-right');
            this.dropInfo = null;
            this.currentDragTargetPane = null; // Reset the cached target pane
        }
    });

    this.editorsWrapper.addEventListener('drop', async (e) => {
        e.preventDefault();
        
        // Clean up D&D state
        this.dropOverlay.classList.add('hidden');
        this.dropOverlay.classList.remove('show-left', 'show-right');
        this.currentDragTargetPane = null;

        if (!this.dropInfo) return;

        const draggedFileId = e.dataTransfer.getData('text/plain');
        if (!draggedFileId) return;
        
        const { targetPaneId, side } = this.dropInfo;
        this.dropInfo = null;
        
        const project = this.projectState.openTabs.find(t => t.fileId === draggedFileId)?.project;
        if (!project) return;
        
        await this.ensureEditorExists(project, draggedFileId);

        const sourceNode = this.findNodeByFileId(draggedFileId);
        if (sourceNode) {
            sourceNode.fileIds = sourceNode.fileIds.filter(id => id !== draggedFileId);
            if (sourceNode.activeFileId === draggedFileId) {
                sourceNode.activeFileId = sourceNode.fileIds[sourceNode.fileIds.length - 1] || null;
            }
        }

        const splitNode = (node) => {
            if (node.id === targetPaneId && node.type === 'leaf') {
                const newPane = { 
                    id: `pane_${Date.now()}`, 
                    type: 'leaf', 
                    fileIds: [draggedFileId], 
                    activeFileId: draggedFileId 
                };
                const children = side === 'left' ? [newPane, node] : [node, newPane];
                return {
                    id: `group_${Date.now()}`,
                    type: 'group',
                    direction: 'row',
                    children: children,
                };
            }
            if (node.type === 'group') node.children = node.children.map(splitNode);
            return node;
        };
        
        // --- START OF FIX ---
        // Flag that we are handling the layout change internally to prevent
        // the tabs-changed event listener from causing a conflicting re-render.
        this.isInternalLayoutChange = true;
        
        // Apply the split to the layout structure
        this.paneLayout = splitNode(JSON.parse(JSON.stringify(this.paneLayout)));

        // Clean up any empty panes that might have been created
        this._pruneAndCompactLayout();
        
        // Immediately render the panes with the new layout
        this.renderPanes({ openTabs: this.projectState.openTabs });

        // Update the global state to make the new pane/tab active.
        // The isInternalLayoutChange flag will prevent the event handler from running.
        this.emit('setActiveTabRequested', { fileId: draggedFileId });
        
        // Allow event-driven rendering again
        this.isInternalLayoutChange = false;
        // --- END OF FIX ---
    });
  }
}