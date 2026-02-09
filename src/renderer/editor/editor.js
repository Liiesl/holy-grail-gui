// src/renderer/editor.js

import { SlashCommand } from './scmd/slashCommand.js';
import { EmojiPicker } from './scmd/emojiPicker.js';
import { TableManager } from './table.js';
import { FindManager } from './find.js';
import { KanbanManager } from './kanban.js';

export class Editor {
  constructor(projectManager, hgmd, container) {
    this.projectManager = projectManager;
    this.hgmd = hgmd;
    this.container = container;
    this.isDirty = false;
    this.currentProject = null;
    this.currentFile = null;
    this.currentVersion = null;
    this.listeners = {};

    this.container.style.position = 'relative';
    // NEW: Add a class and ensure it takes full height
    this.container.classList.add('editor-instance-container');

    this.render();
    this.initElements();
    this.findManager = new FindManager(this);
    this.slashCommand = new SlashCommand(this);
    this.emojiPicker = new EmojiPicker(this);
    this.tableManager = new TableManager(this);
    this.kanbanManager = new KanbanManager(this);
    this.addEventListeners();
    this.tableManager.init();
    this.kanbanManager.init();
    // No longer shows welcome message here, App.js manages that
  }

  render() {
    // The fixed toolbar is completely removed.
    this.container.innerHTML = `
      <div id="find-bar" class="hidden">
        <input type="text" id="find-input" placeholder="Find...">
        <span id="find-counter"></span>
        <button id="find-prev" title="Previous match">&uarr;</button>
        <button id="find-next" title="Next match">&darr;</button>
        <input type="text" id="replace-input" placeholder="Replace...">
        <button id="replace-one" title="Replace current">Replace</button>
        <button id="replace-all" title="Replace all">Replace All</button>
        <button id="find-close" title="Close">&times;</button>
      </div>
      <div id="editor" contenteditable="true" spellcheck="false"></div>
      <div id="floating-toolbar" class="hidden">
        <button data-command="bold" title="Bold"><b>B</b></button>
        <button data-command="italic" title="Italic"><i>I</i></button>
        <button data-command="underline" title="Underline"><u>U</u></button>
        <button data-command="strikeThrough" title="Strikethrough"><s>S</s></button>
        <button data-command="code" title="Code">&lt;/&gt;</button>
        <button data-command="highlight" title="Highlight" style="background-color: #fef07a;">H</button>
      </div>
    `;
  }

  initElements() {
    // References to old toolbar buttons are gone.
    this.editorEl = this.container.querySelector('#editor');
    this.floatingToolbar = this.container.querySelector('#floating-toolbar');
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

  addEventListeners() {
    document.execCommand('defaultParagraphSeparator', false, 'p');

    this.editorEl.addEventListener('input', () => {
      this.handleInput();
      // Only one command menu can be open at a time.
      if (this.slashCommand.isVisible()) {
          this.handleSlashCommandTrigger();
      } else if (this.emojiPicker.isVisible()) {
          this.handleEmojiTrigger();
      } else {
          this.handleSlashCommandTrigger();
          this.handleEmojiTrigger();
      }
    });
    
    this.editorEl.addEventListener('keydown', (e) => {
      if (this.slashCommand.isVisible() && this.slashCommand.handleKeyDown(e)) {
        return;
      }
      if (this.emojiPicker.isVisible() && this.emojiPicker.handleKeyDown(e)) {
        return;
      }
      // NEW: Add Kanban keyboard handling
      if (this.kanbanManager.handleKeyDown(e)) {
        return; // Stop further processing if the Kanban handler took care of it
      }

      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            this.applyFormat('strong');
            break;
          case 'i':
            e.preventDefault();
            this.applyFormat('em');
            break;
          case 'u':
            e.preventDefault();
            this.applyFormat('underline');
            break;
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              this.applyFormat('strikeThrough');
            } else {
              this.saveCurrentNote();
            }
            break;
          case 'f':
            e.preventDefault();
            this.findManager.showFindBar();
            break;
        }
      }
    });

    this.floatingToolbar.querySelectorAll('button[data-command]').forEach(button => {
      button.addEventListener('click', () => {
        const command = button.getAttribute('data-command');
        this.applyFormat(command);
      });
    });
    
    document.addEventListener('selectionchange', () => this.handleSelectionChange());
    
    this.editorEl.addEventListener('blur', () => {
      this.floatingToolbar.classList.add('hidden');
      setTimeout(() => {
        this.slashCommand.hide();
        this.emojiPicker.hide();
      }, 150); // Delay to allow clicks on menus
    });

    this.floatingToolbar.addEventListener('mousedown', (e) => e.preventDefault());
  }

  handleSlashCommandTrigger() {
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) {
      this.slashCommand.hide();
      return;
    }
    
    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE && this.editorEl.contains(node)) {
      const textContent = node.textContent.substring(0, range.startOffset);
      const match = textContent.match(/\/([a-zA-Z0-9]*)$/);

      if (match) {
        const filter = match[1];
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
    this.slashCommand.hide();
  }

  handleEmojiTrigger() {
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed || this.slashCommand.isVisible()) {
      this.emojiPicker.hide();
      return;
    }

    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE && this.editorEl.contains(node)) {
      const textContent = node.textContent.substring(0, range.startOffset);
      // Match : followed by letters, numbers, or _+-
      const match = textContent.match(/:([a-zA-Z0-9_+-]*)$/);

      if (match) {
        const filter = match[1];
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
        this.emojiPicker.show(position, triggerInfo);
        return;
      }
    }
    this.emojiPicker.hide();
  }

  handleSelectionChange() {
    const toolbarEl = this.floatingToolbar;
    if (this.editorEl.contentEditable === 'false') {
        toolbarEl.classList.add('hidden');
        return;
    }
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) {
        toolbarEl.classList.add('hidden');
        return;
    }
    const range = selection.getRangeAt(0);
    if (!this.editorEl.contains(range.commonAncestorContainer)) {
        toolbarEl.classList.add('hidden');
        return;
    }
    const selectionRect = range.getBoundingClientRect();
    if (selectionRect.width === 0 && selectionRect.height === 0) {
        toolbarEl.classList.add('hidden');
        return;
    }
    
    toolbarEl.classList.remove('hidden');
    this.updateToolbarState();

    const editorRect = this.container.getBoundingClientRect();
    let top = selectionRect.top - editorRect.top - toolbarEl.offsetHeight - 5;
    let left = selectionRect.left - editorRect.left + (selectionRect.width / 2) - (toolbarEl.offsetWidth / 2);

    if (top < 0) top = selectionRect.bottom - editorRect.top + 5;
    if (left < 0) left = 0;
    if (left + toolbarEl.offsetWidth > editorRect.width) left = editorRect.width - toolbarEl.offsetWidth;
    
    toolbarEl.style.top = `${top}px`;
    toolbarEl.style.left = `${left}px`;
  }

  updateToolbarState() {
    this.floatingToolbar.querySelectorAll('button[data-command]').forEach(button => {
        const command = button.getAttribute('data-command');
        let isActive = false;
        switch (command) {
            case 'bold':
            case 'italic':
            case 'underline':
            case 'strikeThrough':
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
  
  setCurrentFile(project, file) {
      this.currentProject = project;
      this.currentFile = file;
  }

  async loadNoteContent(projectPath, filename) {
    if (!this.confirmDiscardChanges()) return false;

    this.currentVersion = null;
    const markdown = await this.projectManager.getNoteContent(projectPath, filename);
    this.renderHtml(markdown);
    
    // Focus the editor and set cursor to the beginning after loading
    // Use a small delay to ensure DOM is fully settled
    this.editorEl.focus();
    setTimeout(() => {
      this.setCursorAtStart();
    }, 0);
    
    this.isDirty = false;
    this.emit('dirtyStateChanged', { isDirty: false });
    this.setReadOnly(false);
    return true;
  }
  
  displayHistoricalContent(markdown, version) {
    this.currentVersion = version;
    this.renderHtml(markdown);
    this.isDirty = false;
    this.emit('dirtyStateChanged', { isDirty: false });
  }
  
  renderHtml(markdown) {
    this.editorEl.innerHTML = this.hgmd.toHtml(markdown);
  }

  setReadOnly(isReadOnly) {
    this.editorEl.contentEditable = !isReadOnly;
    this.editorEl.classList.toggle('readonly', isReadOnly);
    if (isReadOnly) {
        this.floatingToolbar.classList.add('hidden');
    }
  }

  setCursorAtStart() {
    // Defer execution to ensure DOM has settled
    requestAnimationFrame(() => {
      // Check if editor element is still in the document
      if (!document.contains(this.editorEl)) {
        return;
      }

      const selection = window.getSelection();
      
      // Find the first text node or create one if needed
      let firstNode = this.editorEl;
      while (firstNode.firstChild && firstNode.firstChild.nodeType === Node.ELEMENT_NODE) {
        firstNode = firstNode.firstChild;
      }
      
      // Ensure the node is actually attached to the DOM
      if (!document.contains(firstNode)) {
        return;
      }

      const range = document.createRange();
      
      if (firstNode.firstChild && firstNode.firstChild.nodeType === Node.TEXT_NODE) {
        firstNode = firstNode.firstChild;
        range.setStart(firstNode, 0);
      } else {
        range.setStart(firstNode, 0);
      }
      range.collapse(true);
      
      try {
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (e) {
        // Silently ignore if range can't be added
        console.warn('Could not set cursor:', e.message);
      }
    });
  }

  handleInput() {
    if (!this.isDirty) {
      this.isDirty = true;
      this.emit('dirtyStateChanged', { isDirty: true });
    }
  }

  async saveCurrentNote(options = {}) {
    const { isRestore = false } = options;
    if (!this.currentProject || !this.currentFile || (!this.isDirty && !isRestore)) return;
    
    this.findManager.clearFindHighlights(); // Clear highlights before saving
    const htmlContent = this.editorEl.innerHTML;
    // The engine now handles escaping internally.
    const markdownContent = this.hgmd.toMarkdown(htmlContent);
    
    await this.projectManager.saveNote({
      projectPath: this.currentProject.path,
      filename: this.currentFile,
      content: markdownContent
    });

    this.isDirty = false;
    this.currentVersion = null;
    this.emit('dirtyStateChanged', { isDirty: false });
    this.setReadOnly(false);

    console.log(`Saved: ${this.currentFile} in ${this.currentProject.name}`);
    this.emit('noteSaved', { isRestore });
  }
  
  async restoreVersion() {
      if (!this.currentVersion) return;
      if (confirm('This will save the current view as a new version. Continue?')) {
          await this.saveCurrentNote({ isRestore: true });
      }
  }

  applyFormat(command) {
    if (this.editorEl.contentEditable === 'false') return;

    if (command === 'code' || command === 'highlight') {
        const selection = window.getSelection().toString();
        if (selection) {
            const tag = command === 'code' ? 'code' : 'mark';
            document.execCommand('insertHTML', false, `<${tag}>${selection}</${tag}>`);
        }
    } else {
        const blockFormats = ['h1', 'h2', 'h3', 'p', 'blockquote', 'pre'];
        const listCommands = { ul: 'insertUnorderedList', ol: 'insertOrderedList' };
        const simpleCommands = { hr: 'insertHorizontalRule' };

        if (blockFormats.includes(command)) {
            document.execCommand('formatBlock', false, command);
        } else if (listCommands[command]) {
            document.execCommand(listCommands[command], false, null);
        } else if (simpleCommands[command]) {
            document.execCommand(simpleCommands[command], false, null);
        } else {
             document.execCommand(command, false, null);
        }
    }
    this.editorEl.focus();
    this.handleInput();
    this.updateToolbarState();
  }
}