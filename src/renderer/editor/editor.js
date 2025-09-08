// src/renderer/editor.js

import { SlashCommand } from './scmd/slashCommand.js';
import { EmojiPicker } from './scmd/emojiPicker.js';
import { TableManager } from './table.js';

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
    this.findMatches = [];
    this.currentFindIndex = -1;

    this.container.style.position = 'relative';
    // NEW: Add a class and ensure it takes full height
    this.container.classList.add('editor-instance-container');

    this.render();
    this.initElements();
    this.slashCommand = new SlashCommand(this);
    this.emojiPicker = new EmojiPicker(this);
    this.tableManager = new TableManager(this);
    this.addEventListeners();
    this.tableManager.init();
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
    this.findBar = this.container.querySelector('#find-bar');
    this.findInput = this.container.querySelector('#find-input');
    this.findCounter = this.container.querySelector('#find-counter');
    this.findPrev = this.container.querySelector('#find-prev');
    this.findNext = this.container.querySelector('#find-next');
    this.findClose = this.container.querySelector('#find-close');
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

      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            this.applyFormat('bold');
            break;
          case 'i':
            e.preventDefault();
            this.applyFormat('italic');
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
            this.showFindBar();
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

    this.findInput.addEventListener('input', () => this.executeFind());
    this.findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                this.findPrevMatch();
            } else {
                this.findNextMatch();
            }
        }
        if (e.key === 'Escape') {
            this.hideFindBar();
        }
    });
    this.findNext.addEventListener('click', () => this.findNextMatch());
    this.findPrev.addEventListener('click', () => this.findPrevMatch());
    this.findClose.addEventListener('click', () => this.hideFindBar());
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

  handleInput() {
    if (!this.isDirty) {
      this.isDirty = true;
      this.emit('dirtyStateChanged', { isDirty: true });
    }
  }

  async saveCurrentNote(options = {}) {
    const { isRestore = false } = options;
    if (!this.currentProject || !this.currentFile || (!this.isDirty && !isRestore)) return;
    
    this.clearFindHighlights(); // Clear highlights before saving
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
  
  // --- Find Functionality ---

  showFindBar() {
    this.findBar.classList.remove('hidden');
    const selection = window.getSelection().toString();
    if (selection) {
        this.findInput.value = selection;
    }
    this.findInput.focus();
    this.findInput.select();
    this.executeFind();
  }

  hideFindBar() {
    this.findBar.classList.add('hidden');
    this.clearFindHighlights();
    this.editorEl.focus();
  }

  clearFindHighlights() {
    const marks = Array.from(this.editorEl.querySelectorAll('mark.find-match'));
    marks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize(); // Merges adjacent text nodes
        }
    });
    this.findMatches = [];
    this.currentFindIndex = -1;
    this.findCounter.textContent = '';
  }
  
  escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  executeFind() {
    this.clearFindHighlights();
    const searchTerm = this.findInput.value;
    if (searchTerm.length < 1) return;

    const regex = new RegExp(this.escapeRegex(searchTerm), 'gi');
    const walker = document.createTreeWalker(this.editorEl, NodeFilter.SHOW_TEXT);
    
    const nodesToSearch = [];
    let currentNode;
    while(currentNode = walker.nextNode()) {
        nodesToSearch.push(currentNode);
    }
    
    for (const node of nodesToSearch) {
        if (!node.parentNode || node.parentNode.nodeName === 'MARK' || !this.editorEl.contains(node)) continue;

        const matches = [...node.nodeValue.matchAll(regex)];
        if (matches.length === 0) continue;

        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const matchIndex = match.index;
            const matchText = match[0];
            
            node.splitText(matchIndex + matchText.length);
            let matchNode = node.splitText(matchIndex);
            
            const mark = document.createElement('mark');
            mark.className = 'find-match';
            mark.textContent = matchText;

            matchNode.parentNode.replaceChild(mark, matchNode);
            this.findMatches.push(mark);
        }
    }

    this.findMatches.sort((a, b) => {
        // compareDocumentPosition returns a bitmask.
        // We check if 'a' comes before 'b' in the document tree.
        const pos = a.compareDocumentPosition(b);
        
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
            // 'a' precedes 'b', so 'a' should come first.
            return 1;
        } else if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
            // 'a' follows 'b', so 'a' should come second.
            return -1;
        } else {
            // They are the same node.
            return 0;
        }
    });

    if (this.findMatches.length > 0) {
        this.currentFindIndex = 0;
        this.navigateToMatch(this.currentFindIndex);
    } else {
        this.findCounter.textContent = '0/0';
    }
  }

  navigateToMatch(index) {
    if (this.findMatches.length === 0 || index < 0 || index >= this.findMatches.length) return;

    if (this.currentFindIndex !== -1 && this.findMatches[this.currentFindIndex]) {
        this.findMatches[this.currentFindIndex].classList.remove('current');
    }

    this.currentFindIndex = index;
    const currentMatch = this.findMatches[this.currentFindIndex];
    currentMatch.classList.add('current');
    this.findCounter.textContent = `${this.currentFindIndex + 1}/${this.findMatches.length}`;
    
    currentMatch.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
    });
  }

  findNextMatch() {
    if (this.findMatches.length === 0) return;
    const nextIndex = (this.currentFindIndex + 1) % this.findMatches.length;
    this.navigateToMatch(nextIndex);
  }

  findPrevMatch() {
    if (this.findMatches.length === 0) return;
    const prevIndex = (this.currentFindIndex - 1 + this.findMatches.length) % this.findMatches.length;
    this.navigateToMatch(prevIndex);
  }
}