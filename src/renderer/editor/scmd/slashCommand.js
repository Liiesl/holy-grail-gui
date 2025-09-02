// src/renderer/slashCommand.js

export class SlashCommand {
  constructor(editor) {
    this.editor = editor; // The entire Editor instance
    this.editorEl = editor.editorEl; // Convenience reference
    this.container = null;
    this.activeIndex = 0;
    this.triggerInfo = null; // Will store { range, filter }

    // --- NEW: Commands are now self-contained with their own execution logic ---
    this.commands = [
      { name: 'Heading 1', command: 'h1', description: 'Large heading', action: (editor) => editor.applyFormat('h1') },
      { name: 'Heading 2', command: 'h2', description: 'Medium heading', action: (editor) => editor.applyFormat('h2') },
      { name: 'Heading 3', command: 'h3', description: 'Small heading', action: (editor) => editor.applyFormat('h3') },
      { name: 'Bulleted List', command: 'ul', description: 'Create a simple bulleted list', action: (editor) => editor.applyFormat('ul') },
      { name: 'Numbered List', command: 'ol', description: 'Create an ordered list', action: (editor) => editor.applyFormat('ol') },
      { name: 'Quote', command: 'blockquote', description: 'Create a blockquote', action: (editor) => editor.applyFormat('blockquote') },
      { name: 'Code Block', command: 'pre', description: 'Create a code block', action: (editor) => editor.applyFormat('pre') },
      { name: 'Divider', command: 'hr', description: 'Insert a horizontal rule', action: (editor) => editor.applyFormat('hr') },
      { name: 'Seek', command: 'seek', description: 'Find and link to another note', disabled: true },
      { name: 'Open in left pane', command: 'open-left', description: 'Open a note side-by-side', disabled: true },
      { name: 'Emoji', command: 'emoji', description: 'Insert an emoji', disabled: true },
      { name: 'Table', command: 'table', description: 'Insert a table', disabled: true },
      { name: 'Switch page', command: 'switch', description: 'Quickly jump to another page', disabled: true },
    ];
    
    // Add a default placeholder action to disabled commands that don't have one
    this.commands.forEach(cmd => {
        if (cmd.disabled && !cmd.action) {
            cmd.action = () => {
                console.log(`Placeholder for: ${cmd.name}`);
                const textNode = document.createTextNode(`[${cmd.name} not implemented]`);
                const sel = window.getSelection();
                if (sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            };
        }
    });

    this.filteredCommands = [];

    this.render();
    this.addEventListeners();
  }

  render() {
    this.container = document.createElement('div');
    this.container.id = 'slash-command-menu';
    this.container.classList.add('hidden');
    // Use the editor's main container as the positioning reference
    this.editor.container.appendChild(this.container);
  }

  addEventListeners() {
    // Using mousedown to prevent the editor from losing focus before the click is registered
    this.container.addEventListener('mousedown', e => {
      e.preventDefault();
      const target = e.target.closest('.command-item');
      if (target && !target.classList.contains('disabled')) {
        const commandName = target.dataset.commandName;
        const command = this.filteredCommands.find(c => c.name === commandName);
        if (command) {
          this.execute(command);
        }
      }
    });
  }

  show(position, triggerInfo) {
    this.triggerInfo = triggerInfo;
    this.container.classList.remove('hidden');
    this.container.style.top = `${position.top}px`;
    this.container.style.left = `${position.left}px`;
    this.update(triggerInfo.filter);
  }

  hide() {
    if (this.isVisible()) {
      this.container.classList.add('hidden');
      this.triggerInfo = null;
    }
  }

  isVisible() {
    return !this.container.classList.contains('hidden');
  }

  update(filterText) {
    this.filteredCommands = this.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(filterText.toLowerCase()) ||
      cmd.description.toLowerCase().includes(filterText.toLowerCase())
    );

    if (this.filteredCommands.length === 0) {
      this.hide();
      return;
    }
    
    this.activeIndex = 0;
    this.renderItems();
  }
  
  renderItems() {
    this.container.innerHTML = `
      <div class="command-list">
        ${this.filteredCommands.map((cmd, index) => `
          <div 
            class="command-item ${index === this.activeIndex ? 'active' : ''} ${cmd.disabled ? 'disabled' : ''}" 
            data-command-name="${cmd.name}"
          >
            <div class="command-item-name">${cmd.name}</div>
            <div class="command-item-desc">${cmd.description}</div>
          </div>
        `).join('')}
      </div>
    `;
    // Ensure the active item is visible if the list is scrollable
    this.container.querySelector('.command-item.active')?.scrollIntoView({ block: 'nearest' });
  }

  handleKeyDown(e) {
    if (!this.isVisible()) return false;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % this.filteredCommands.length;
      this.renderItems();
      return true;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex = (this.activeIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
      this.renderItems();
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const command = this.filteredCommands[this.activeIndex];
      if (command && !command.disabled) {
        this.execute(command);
      }
      return true;
    }
    
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      return true;
    }
    
    return false; // Let the editor handle other keys
  }

  /**
   * NEW HELPER: Finds the top-level block element within the editor that contains the given node.
   * A top-level block is a direct child of the main editor element (e.g., a <p> or <h1>).
   * @param {Node} node The starting node (e.g., a text node from a selection).
   * @returns {HTMLElement | null} The block element or null if not found.
   */
  findParentBlock(node) {
    let currentNode = node;
    // Walk up the DOM tree from the node
    while (currentNode && currentNode !== this.editor.editorEl) {
      // If the node's parent is the editor itself, we've found our top-level block
      if (currentNode.parentNode === this.editor.editorEl) {
        return currentNode;
      }
      currentNode = currentNode.parentNode;
    }
    return null; // Should not happen if the node is inside the editor
  }

  /**
   * REVISED: This method now correctly targets the current line for block formatting.
   */
  execute(command) {
    const { range } = this.triggerInfo;
    
    // 1. Find the block-level element (e.g., the <p>) that contains the trigger text.
    const targetBlock = this.findParentBlock(range.startContainer);

    // 2. Remove the trigger text (e.g., "/h1") from the editor.
    range.deleteContents();

    // 3. For block-formatting commands, we explicitly select the target block's content.
    // This gives `document.execCommand` a clear instruction on what to format,
    // which is crucial for empty lines where it might otherwise affect an adjacent block.
    const blockFormattingCommands = ['h1', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'pre'];
    if (targetBlock && blockFormattingCommands.includes(command.command)) {
      const selection = window.getSelection();
      const newRange = document.createRange();
      newRange.selectNodeContents(targetBlock);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
    
    // 4. Execute the command's specific action.
    if (command.action) {
      // The selection is now correctly set up for the action to apply.
      command.action(this.editor, this.triggerInfo);
    }
    
    // 5. Hide the command menu.
    this.hide();
    
    // 6. Ensure the editor is focused. The browser will place the cursor correctly after `execCommand`.
    this.editor.editorEl.focus();
  }
}