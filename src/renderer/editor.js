// src/renderer/editor.js

import { SlashCommand } from './slashCommand.js';

export class Editor {
  constructor(projectManager, hgmd, container) {
    this.projectManager = projectManager;
    this.hgmd = hgmd;
    this.container = container; // The parent DOM element for this component
    this.isDirty = false;
    this.currentProject = null;
    this.currentFile = null;
    this.currentVersion = null; // Track viewed historical version
    this.listeners = {}; // Simple event emitter

    // The container needs to be a positioning parent for the floating toolbar
    this.container.style.position = 'relative';

    this.render();
    this.initElements();

    // --- REFACTORED: Initialize Slash Command ---
    // Pass the entire editor instance to SlashCommand for a self-contained component.
    this.slashCommand = new SlashCommand(this);
    
    this.addEventListeners();
    this.showWelcomeMessage();
  }

  /** Renders the component's HTML structure into its container. */
  render() {
    this.container.innerHTML = `
      <div class="toolbar">
        <!-- Static buttons remain here -->
        <button id="history-btn" class="secondary" title="View note history">History</button>
        <button id="restore-btn" class="secondary hidden" title="Restore this version">Restore</button>
        <button id="delete-note-btn" class="danger">Delete</button>
      </div>
      <div id="editor" contenteditable="true" spellcheck="false"></div>

      <!-- New floating toolbar, initially hidden -->
      <div id="floating-toolbar" class="hidden">
          <button data-command="bold"><b>B</b></button>
          <button data-command="italic"><i>I</i></button>
      </div>
    `;
  }

  /** Gets references to the component's own DOM elements. */
  initElements() {
    this.editorEl = this.container.querySelector('#editor');
    this.toolbar = this.container.querySelector('.toolbar');
    this.deleteNoteBtn = this.container.querySelector('#delete-note-btn');
    this.historyBtn = this.container.querySelector('#history-btn');
    this.restoreBtn = this.container.querySelector('#restore-btn');
    this.floatingToolbar = this.container.querySelector('#floating-toolbar');
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

  // --- Event Listeners ---
  addEventListeners() {
    document.execCommand('defaultParagraphSeparator', false, 'p');

    this.editorEl.addEventListener('input', () => {
      this.handleInput();
      this.handleSlashCommandTrigger();
    });
    this.deleteNoteBtn.addEventListener('click', () => this.deleteCurrentNote());
    
    this.editorEl.addEventListener('keydown', (e) => {
      // Give slash command priority for navigation keys
      if (this.slashCommand.isVisible()) {
        if (this.slashCommand.handleKeyDown(e)) {
            return; // Event was handled by slash command
        }
      }

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.saveCurrentNote();
      }
    });

    // Attach listeners to the floating toolbar buttons
    this.floatingToolbar.querySelectorAll('button[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            this.applyFormat(command);
        });
    });
    
    // Listeners for static buttons
    this.historyBtn.addEventListener('click', () => this.emit('historyClicked'));
    this.restoreBtn.addEventListener('click', () => this.restoreVersion());
    
    // Show/hide floating toolbar based on text selection
    document.addEventListener('selectionchange', () => this.handleSelectionChange());
    
    // When the editor loses focus (e.g., tabbing away), hide the toolbar
    this.editorEl.addEventListener('blur', () => {
        this.floatingToolbar.classList.add('hidden');
        // Hide slash command on blur as well. Use a timeout because a click 
        // on the menu would blur the editor first, and we need the click to register.
        setTimeout(() => this.slashCommand.hide(), 150);
    });

    // Prevent the editor from losing focus when a toolbar button is clicked.
    // This ensures the text selection remains active.
    this.floatingToolbar.addEventListener('mousedown', (e) => e.preventDefault());
  }

  // --- Slash Command Logic ---

  handleSlashCommandTrigger() {
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) {
      this.slashCommand.hide();
      return;
    }
    
    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    // Check if the cursor is inside a text node within our editor
    if (node.nodeType === Node.TEXT_NODE && this.editorEl.contains(node)) {
      const textContent = node.textContent.substring(0, range.startOffset);
      const match = textContent.match(/\/([a-zA-Z0-9]*)$/);

      if (match) {
        const filter = match[1];
        
        // Create a range for the trigger text ('/' + filter) to position the menu
        const triggerRange = document.createRange();
        triggerRange.setStart(node, range.startOffset - match[0].length);
        triggerRange.setEnd(node, range.startOffset);
        
        const rect = triggerRange.getBoundingClientRect();
        const editorRect = this.container.getBoundingClientRect();
        
        const position = {
            top: rect.bottom - editorRect.top,
            left: rect.left - editorRect.left,
        };
        
        const triggerInfo = { range: triggerRange, filter: filter };
        this.slashCommand.show(position, triggerInfo);
        return;
      }
    }
    // If no trigger is found, hide the menu
    this.slashCommand.hide();
  }

  // --- REMOVED ---
  // The executeSlashCommand method has been moved into the SlashCommand class.

  handleSelectionChange() {
    const toolbarEl = this.floatingToolbar;
    
    // Hide toolbar if editor is not editable
    if (this.editorEl.contentEditable === 'false') {
        toolbarEl.classList.add('hidden');
        return;
    }

    const selection = window.getSelection();
    
    // Hide toolbar if no selection or selection is collapsed (a cursor)
    if (!selection.rangeCount || selection.isCollapsed) {
        toolbarEl.classList.add('hidden');
        return;
    }

    const range = selection.getRangeAt(0);
    // Hide toolbar if selection is outside our editor
    if (!this.editorEl.contains(range.commonAncestorContainer)) {
        toolbarEl.classList.add('hidden');
        return;
    }

    const selectionRect = range.getBoundingClientRect();
    // Hide if the selection has no dimensions (can happen with empty elements)
    if (selectionRect.width === 0 && selectionRect.height === 0) {
        toolbarEl.classList.add('hidden');
        return;
    }
    
    // If we reach here, show, update state, and position the toolbar
    toolbarEl.classList.remove('hidden');
    this.updateToolbarState(); // <-- CHECK AND UPDATE BUTTON STATES

    const editorRect = this.container.getBoundingClientRect();
    
    let top = selectionRect.top - editorRect.top - toolbarEl.offsetHeight - 5; // 5px gap above
    let left = selectionRect.left - editorRect.left + (selectionRect.width / 2) - (toolbarEl.offsetWidth / 2);

    // Boundary checks to keep the toolbar within the container
    if (top < 0) {
        top = selectionRect.bottom - editorRect.top + 5; // Show below if no space above
    }
    if (left < 0) {
        left = 0;
    }
    if (left + toolbarEl.offsetWidth > editorRect.width) {
        left = editorRect.width - toolbarEl.offsetWidth;
    }
    
    toolbarEl.style.top = `${top}px`;
    toolbarEl.style.left = `${left}px`;
  }

  /** NEW: Checks selection and updates toolbar buttons to show active formats. */
  updateToolbarState() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    // This logic is now simplified as it no longer needs to check for H1/H2/UL
    this.floatingToolbar.querySelectorAll('button[data-command]').forEach(button => {
        const command = button.getAttribute('data-command');
        let isActive = false;

        switch (command) {
            case 'bold':
            case 'italic':
                isActive = document.queryCommandState(command);
                break;
        }
        button.classList.toggle('active', isActive);
    });
  }

  confirmDiscardChanges() {
    if (this.isDirty) {
      return confirm('You have unsaved changes. Do you want to discard them?');
    }
    return true;
  }
  
  // --- State & Content ---
  setCurrentFile(project, file) {
      this.currentProject = project;
      this.currentFile = file;
      this.updateToolbarVisibility();
  }

  async loadNoteContent(projectPath, filename) {
    if (!this.confirmDiscardChanges()) return false;

    this.currentVersion = null; // Not viewing history anymore
    const markdown = await this.projectManager.getNoteContent(projectPath, filename);
    this.renderHtml(markdown);
    
    this.isDirty = false;
    this.emit('dirtyStateChanged', { isDirty: false });
    this.setReadOnly(false); // Make sure editor is editable
    return true;
  }
  
  // Displays content from a historical version
  displayHistoricalContent(markdown, version) {
    this.currentVersion = version;
    this.renderHtml(markdown);
    this.isDirty = false;
    this.emit('dirtyStateChanged', { isDirty: false });
  }
  
  // Helper to render markdown to the editor and normalize structure
  renderHtml(markdown) {
    const rawHtml = this.hgmd.toHtml(markdown);
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = rawHtml;
    const finalNodes = [];
    let currentParagraph = document.createElement('p');
    const BLOCK_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE'];
    const isBlockElement = (node) => node.nodeType === 1 && BLOCK_TAGS.includes(node.tagName);
    tempContainer.childNodes.forEach(node => {
      if (isBlockElement(node)) {
        if (currentParagraph.childNodes.length > 0) finalNodes.push(currentParagraph);
        finalNodes.push(node.cloneNode(true));
        currentParagraph = document.createElement('p');
      } else if (node.nodeType === 1 && node.tagName === 'BR') {
        finalNodes.push(currentParagraph);
        currentParagraph = document.createElement('p');
      } else {
        currentParagraph.appendChild(node.cloneNode(true));
      }
    });
    if (currentParagraph.childNodes.length > 0 || finalNodes.length === 0) {
      finalNodes.push(currentParagraph);
    }
    this.editorEl.innerHTML = '';
    finalNodes.forEach(node => this.editorEl.appendChild(node));
  }

  clearAndFocus() {
    if (!this.confirmDiscardChanges()) return false;
    this.editorEl.innerHTML = '<p><br></p>';
    this.editorEl.focus();
    this.isDirty = false;
    this.emit('dirtyStateChanged', { isDirty: false });
    this.setReadOnly(false);
    return true;
  }

  showWelcomeMessage() {
    if (!this.confirmDiscardChanges()) return false;
    this.editorEl.innerHTML = '<p>Select a project to begin.</p>';
    this.isDirty = false;
    this.emit('dirtyStateChanged', { isDirty: false });
    this.setReadOnly(true); // Welcome message should not be editable
    return true;
  }

  updateToolbarVisibility() {
      const hasFile = this.currentProject && this.currentFile;
      this.deleteNoteBtn.style.display = hasFile ? 'inline-block' : 'none';
      this.historyBtn.style.display = hasFile ? 'inline-block' : 'none';
      this.restoreBtn.classList.toggle('hidden', !this.currentVersion);
  }

  // Toggles the contenteditable attribute and styles
  setReadOnly(isReadOnly) {
    this.editorEl.contentEditable = !isReadOnly;
    this.editorEl.classList.toggle('readonly', isReadOnly);
    this.updateToolbarVisibility();
    if (isReadOnly) {
        this.floatingToolbar.classList.add('hidden');
    }
  }

  // --- Actions ---
  handleInput() {
    if (!this.isDirty) {
      this.isDirty = true;
      this.emit('dirtyStateChanged', { isDirty: true });
    }
  }

  async saveCurrentNote(options = {}) {
    const { isRestore = false } = options;
    if (!this.currentProject || (!this.isDirty && !isRestore)) return;

    let isNew = false;
    if (!this.currentFile) {
      isNew = true;
      const firstLine = this.editorEl.innerText.split('\n')[0].trim() || 'Untitled';
      const newFilename = `${firstLine.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')}-${Date.now()}.md`;
      this.currentFile = newFilename;
    }

    const htmlContent = this.editorEl.innerHTML;
    const markdownContent = this.hgmd.toMarkdown(htmlContent);
    
    await this.projectManager.saveNote({
      projectPath: this.currentProject.path,
      filename: this.currentFile,
      content: markdownContent
    });

    this.isDirty = false;
    this.currentVersion = null; // A save/restore makes this the latest version
    this.emit('dirtyStateChanged', { isDirty: false });
    this.setReadOnly(false);

    console.log(`Saved: ${this.currentFile} in ${this.currentProject.name}`);
    this.updateToolbarVisibility();
    this.emit('noteSaved', { isNew, isRestore });
  }
  
  // Restores the content of a historical version as a new version
  async restoreVersion() {
      if (!this.currentVersion) return;
      if (confirm('This will save the current view as a new version. Continue?')) {
          await this.saveCurrentNote({ isRestore: true });
      }
  }
  
  async deleteCurrentNote() {
    if (!this.currentProject || !this.currentFile) return;

    if (confirm(`Are you sure you want to delete ${this.currentFile}?`)) {
      await this.projectManager.deleteNote(this.currentProject.path, this.currentFile);
      this.currentFile = null;
      this.isDirty = false;
      this.editorEl.innerHTML = '<p>Select a note or create a new one.</p>';
      this.updateToolbarVisibility();
      this.emit('noteDeleted');
      this.emit('dirtyStateChanged', { isDirty: false });
    }
  }

  applyFormat(command) {
    if (this.editorEl.contentEditable === 'false') return;
    const formatMap = { h1: 'formatBlock', h2: 'formatBlock', ul: 'insertUnorderedList' };
    document.execCommand(formatMap[command] || command, false, formatMap[command] ? command : null);
    this.editorEl.focus();
    this.handleInput();
    // After applying a format, immediately update the toolbar state
    this.updateToolbarState();
  }
}