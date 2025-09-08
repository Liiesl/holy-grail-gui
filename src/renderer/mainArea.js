// src/renderer/main.js

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
    // NEW STRUCTURE: Panes now hold multiple file IDs
    this.paneLayout = { id: 'root', type: 'leaf', fileIds: [], activeFileId: null };
    this.activePaneId = 'root';
    this.dropInfo = null; // For D&D visual feedback
    this.isInternalLayoutChange = false; // Flag to prevent re-entrant rendering

    this.listeners = {};

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
        // Set the local pane's active tab first
        const pane = this.findNode(n => n.id === paneId);
        if (pane) {
            pane.activeFileId = fileId;
        }
        // Then notify the app globally
        this.emit('setActiveTabRequested', { fileId });
    });

    tabsInstance.on('tabCloseRequested', ({ fileId }) => {
        const instance = this.editors.get(fileId);
        if (instance && !instance.editor.confirmDiscardChanges()) {
            return;
        }
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
        if (canClose) {
            this.emit('closeOtherTabsRequested', { fileId });
        }
    });

    tabsInstance.on('tabDropped', ({ fileId }) => {
        this.handleTabMove(fileId, paneId);
    });

    tabsInstance.on('chatToggled', () => this.emit('chatToggled'));
    tabsInstance.on('historyClicked', () => this.emit('historyClicked'));
    tabsInstance.on('deleteClicked', () => this.emit('deleteClicked'));
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
    // Ensure backward compatibility or reset state with new structure
    const fixLayout = (node) => {
        if (node.type === 'leaf') {
            if (node.fileId) { // Old format
                node.fileIds = node.fileId ? [node.fileId] : [];
                node.activeFileId = node.fileId;
                delete node.fileId;
            }
            if (!node.fileIds) node.fileIds = [];
        }
        if (node.type === 'group') {
            node.children.forEach(fixLayout);
        }
        return node;
    }
    this.paneLayout = layout ? fixLayout(layout) : { id: 'root', type: 'leaf', fileIds: [], activeFileId: null };
  }

  updateOnTabsChanged({ openTabs, activeTabId }) {
    // 1. Check the flag to prevent re-rendering from the feedback loop
    if (this.isInternalLayoutChange) {
        return;
    }

    const activePane = this.findNodeByFileId(activeTabId, this.paneLayout);
    if (activePane) {
        this.activePaneId = activePane.id;
        activePane.activeFileId = activeTabId; // Sync pane's active tab
    }

    const openFileIds = new Set(openTabs.map(t => t.fileId));
    const pruneLayout = (node) => {
        if (!node) return null;
        if (node.type === 'leaf') {
            // Remove closed file IDs from the pane
            node.fileIds = node.fileIds.filter(id => openFileIds.has(id));
            // If the active file was closed, pick a new one
            if (node.activeFileId && !node.fileIds.includes(node.activeFileId)) {
                node.activeFileId = node.fileIds[node.fileIds.length - 1] || null;
            }
            // If the pane becomes empty and it's not the root, it could be pruned
            // For now, we keep empty panes. Groups will collapse if they have only one child.
            return node;
        }
        if (node.type === 'group') {
            node.children = node.children.map(pruneLayout).filter(Boolean);
            if (node.children.length === 0) return null;
            if (node.children.length === 1) return node.children[0];
            return node;
        }
        return node;
    };
    const newLayout = pruneLayout(JSON.parse(JSON.stringify(this.paneLayout)));
    this.paneLayout = newLayout || { id: 'root', type: 'leaf', fileIds: [], activeFileId: null };

    const allFilesInLayout = new Set(this.getAllFileIdsInLayout());
    for (const fileId of this.editors.keys()) {
        if (!allFilesInLayout.has(fileId)) {
            const instance = this.editors.get(fileId);
            instance.container.remove();
            this.editors.delete(fileId);
        }
    }

    this.renderPanes({ openTabs });
  }

  async openOrFocusFile(project, fileId) {
    const existingPane = this.findNodeByFileId(fileId, this.paneLayout);
    if (existingPane) {
      this.emit('setActiveTabRequested', { fileId });
    } else {
      const success = await this.ensureEditorExists(project, fileId);
      if (success) {
        // Add the new file to the currently active pane
        const activePane = this.findNode(n => n.id === this.activePaneId) || this.paneLayout;
        if (activePane.type === 'leaf') {
            if (!activePane.fileIds.includes(fileId)) {
                activePane.fileIds.push(fileId);
            }
            activePane.activeFileId = fileId; // Make it active in its pane
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

    newEditor.on('dirtyStateChanged', ({ isDirty }) => {
        this.emit('editorDirtyStateChanged', { fileId, isDirty });
    });
    
    newEditor.on('noteSaved', () => {
        const pane = this.findNodeByFileId(fileId, this.paneLayout);
        if (pane && pane.id === this.activePaneId) {
            this.emit('noteSavedInActivePane', { project, fileId });
        }
    });

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
  
  renderPanes({ openTabs } = { openTabs: [] }) {
    const activeContent = document.activeElement;

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

            // Get all tabs belonging to this pane
            const paneTabs = openTabs.filter(t => node.fileIds.includes(t.fileId));
            
            if (paneTabs.length > 0) {
                const tabsInstance = new Tabs(tabsContainer, this.contextMenuService);
                this.tabInstances.set(node.id, tabsInstance);
                this._wireUpTabInstanceEventListeners(tabsInstance, node.id);
                
                // Pass all of the pane's tabs to the Tabs component
                tabsInstance.update({ openTabs: paneTabs, activeTabId: node.activeFileId });
                
                // Show the editor for the active file in this pane
                const editorInstance = this.editors.get(node.activeFileId);
                if (editorInstance) {
                    editorArea.appendChild(editorInstance.container);
                }
            }
            if (node.id === this.activePaneId) {
                paneEl.classList.add('active');
            }
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
    if (rootEl) {
        this.editorsWrapper.insertBefore(rootEl, this.welcomeMessageEl);
    }
    
    const hasOpenFile = this.getAllFileIdsInLayout().length > 0;
    this.welcomeMessageEl.style.display = hasOpenFile ? 'none' : 'flex';

    if (document.body.contains(activeContent)) {
        activeContent.focus();
    }
  }

  findNode(predicate, node = this.paneLayout) {
    if (!node) return null;
    if (predicate(node)) {
        return node;
    }
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
    if (node.type === 'leaf') {
        return node.fileIds || [];
    }
    if (node.type === 'group') {
        return node.children.flatMap(child => this.getAllFileIdsInLayout(child));
    }
    return [];
  }

  handleTabMove(draggedFileId, targetPaneId) {
    const sourceNode = this.findNodeByFileId(draggedFileId);
    const targetNode = this.findNode(n => n.id === targetPaneId);

    if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) {
        return;
    }

    // 2. Update the data model first
    sourceNode.fileIds = sourceNode.fileIds.filter(id => id !== draggedFileId);
    if (sourceNode.activeFileId === draggedFileId) {
        sourceNode.activeFileId = sourceNode.fileIds[sourceNode.fileIds.length - 1] || null;
    }

    if (!targetNode.fileIds.includes(draggedFileId)) {
        targetNode.fileIds.push(draggedFileId);
    }
    targetNode.activeFileId = draggedFileId;

    this.isInternalLayoutChange = true;
    
    // 3. Directly re-render the UI with the updated model
    this.renderPanes({ openTabs: this.projectState.openTabs });

    // 4. Notify the rest of the app about the state change
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
        if (!targetPane) {
            this.dropOverlay.classList.add('hidden');
            return;
        };

        const rect = targetPane.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const dropZoneWidth = rect.width * 0.25;

        let side = null;
        if (x < dropZoneWidth) side = 'left';
        else if (x > rect.width - dropZoneWidth) side = 'right';

        if (side) {
            this.dropInfo = { targetPaneId: targetPane.dataset.paneId, side };
            this.dropOverlay.classList.remove('hidden');
            const overlay = this.dropOverlay;
            overlay.style.top = `${targetPane.offsetTop}px`;
            overlay.style.left = side === 'left' ? `${targetPane.offsetLeft}px` : `${targetPane.offsetLeft + targetPane.offsetWidth / 2}px`;
            overlay.style.width = `${targetPane.offsetWidth / 2}px`;
            overlay.style.height = `${targetPane.offsetHeight}px`;
        } else {
            this.dropInfo = null;
            this.dropOverlay.classList.add('hidden');
        }
    });

    this.editorsWrapper.addEventListener('dragleave', (e) => {
        if (!this.editorsWrapper.contains(e.relatedTarget)) {
            this.dropOverlay.classList.add('hidden');
            this.dropInfo = null;
        }
    });

    this.editorsWrapper.addEventListener('drop', async (e) => {
        e.preventDefault();
        this.dropOverlay.classList.add('hidden');
        if (!this.dropInfo) return;

        const draggedFileId = e.dataTransfer.getData('text/plain');
        if (!draggedFileId) return;
        
        const { targetPaneId, side } = this.dropInfo;
        this.dropInfo = null;
        
        const project = this.projectState.openTabs.find(t => t.fileId === draggedFileId)?.project;
        if (!project) return;
        
        await this.ensureEditorExists(project, draggedFileId);

        // Remove the tab from its original pane before splitting
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
            if (node.type === 'group') {
                node.children = node.children.map(splitNode);
            }
            return node;
        };

        this.paneLayout = splitNode(this.paneLayout);
        
        this.emit('openTabRequested', { projectPath: project.path, fileId: draggedFileId });
        this.emit('setActiveTabRequested', { fileId: draggedFileId });
    });
  }
}