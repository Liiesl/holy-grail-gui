// src/renderer/scmd/slashCommand.js

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
      { 
        name: 'Emoji', 
        command: 'emoji', 
        description: 'Insert an emoji', 
        action: (editor, triggerInfo) => {
          // --- FIX: ---
          // The `triggerInfo.range` passed from `execute` can be stale after the DOM
          // mutation (`deleteContents`). We must get the fresh, current cursor position
          // from the global selection object to ensure we're working with the latest state.
          const sel = window.getSelection();
          if (!sel.rangeCount || !sel.isCollapsed) return; // Safety check
          
          const range = sel.getRangeAt(0); // Get the LIVE, current range
          
          const colonNode = document.createTextNode(':');
          range.insertNode(colonNode);
          
          // Move cursor after the colon
          range.setStartAfter(colonNode);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);

          // Use setTimeout to allow the browser to render the ":" before we measure it.
          setTimeout(() => {
            // To get the most reliable position, create a temporary range that
            // explicitly selects the node we want to measure (`colonNode`).
            const colonRange = document.createRange();
            colonRange.selectNode(colonNode);
            const rect = colonRange.getBoundingClientRect();

            const editorRect = editor.container.getBoundingClientRect();
            const position = {
                top: rect.bottom - editorRect.top,
                left: rect.left - editorRect.left,
            };
            
            // Pass the range that covers the ':' so the picker knows what to replace.
            const emojiTriggerInfo = { range: colonRange, filter: '' };
            editor.emojiPicker.show(position, emojiTriggerInfo);
          }, 0);
        }
      },
      { name: 'Seek', command: 'seek', description: 'Find and link to another note', disabled: true },
      { name: 'Open in right pane', command: 'open-right', description: 'Open a note side-by-side', disabled: true },
      {
        name: 'Table',
        command: 'table',
        description: 'Insert a table',
        disabled: false, // <-- Command is now enabled
        action: (editor) => {
          // A default table is inserted that demonstrates width and alignment features.
          // Appending a <p><br></p> is a UX improvement to allow the user
          // to easily type below the table after it's inserted.
          const tableHtml = `
            <table style="width: 80%;">
              <thead>
                <tr>
                  <th style="width: 40%;">Header</th>
                  <th style="text-align: center;">Header</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cell</td>
                  <td style="text-align: center;">Cell</td>
                </tr>
                <tr>
                  <td>Cell</td>
                  <td style="text-align: center;">Cell</td>
                </tr>
              </tbody>
            </table>
            <p><br></p>
          `;
          
          document.execCommand('insertHTML', false, tableHtml.trim().replace(/\s{2,}/g, ' '));
          
          // Now, try to place the cursor in the first header cell for immediate editing.
          const sel = window.getSelection();
          if (!sel.rangeCount) return;

          const range = sel.getRangeAt(0);

          // After insertion, the cursor is in the new <p>. findParentBlock gets it.
          const currentBlock = editor.slashCommand.findParentBlock(range.startContainer);
          
          // The table should be the previous sibling element.
          if (currentBlock && currentBlock.previousElementSibling && currentBlock.previousElementSibling.tagName === 'TABLE') {
            const table = currentBlock.previousElementSibling;
            const firstCell = table.querySelector('th');
            
            if (firstCell) {
              // Create a new range, place it inside the first cell, and collapse
              // it to the start so the user sees a blinking cursor.
              const newRange = document.createRange();
              newRange.selectNodeContents(firstCell);
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
            }
          }
        }
      },
      {
          name: 'Kanban Board',
          command: 'kanban',
          description: 'Create a Kanban board',
          disabled: false,
          action: (editor) => {
              const kanbanHtml = `
              <div class="kanban-board" contenteditable="false">
                  <div class="kanban-column">
                  <div class="kanban-column-title" contenteditable="true">To Do</div>
                  <div class="kanban-cards">
                      <div class="kanban-card-wrapper" draggable="true">
                        <div class="kanban-card" contenteditable="true">Sample Card</div>
                      </div>
                  </div>
                  <button class="kanban-add-card" contenteditable="false">+ Add Card</button>
                  </div>
                  <div class="kanban-column">
                  <div class="kanban-column-title" contenteditable="true">In Progress</div>
                  <div class="kanban-cards"></div>
                  <button class="kanban-add-card" contenteditable="false">+ Add Card</button>
                  </div>
                  <div class="kanban-column">
                  <div class="kanban-column-title" contenteditable="true">Done</div>
                  <div class="kanban-cards"></div>
                  <button class="kanban-add-card" contenteditable="false">+ Add Card</button>
                  </div>
                  <button class="kanban-add-column" title="Add another column" contenteditable="false">+</button>
                  
              </div><!--KANBAN_END_MARKER-->
              <p><br></p>
              `;
              document.execCommand('insertHTML', false, kanbanHtml.trim().replace(/\s{2,}/g, ' '));
          }
      },
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
      if (command) { // Allow executing disabled commands to show placeholder
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
    if (command.disabled && command.action) {
      this.hide();
      command.action();
      return;
    }
    if (command.disabled) return;

    // Make a local copy of triggerInfo. The subsequent `deleteContents` will
    // trigger an input event that calls `hide()`, which in turn nullifies `this.triggerInfo`.
    // We must preserve the trigger info to pass it to the command's action.
    const triggerInfo = this.triggerInfo;
    const { range } = triggerInfo;
    
    // 1. Find the block-level element (e.g., the <p>) that contains the trigger text.
    const targetBlock = this.findParentBlock(range.startContainer);

    // 2. Remove the trigger text (e.g., "/h1") from the editor.
    // This triggers the input event handler, which will hide the menu and nullify this.triggerInfo.
    range.deleteContents();

    const blockFormattingCommands = ['h1', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'pre'];
    if (targetBlock && blockFormattingCommands.includes(command.command)) {
      const isEffectivelyEmpty = targetBlock.textContent.trim() === '' && (targetBlock.innerHTML === '' || targetBlock.innerHTML === '<br>');

      if (isEffectivelyEmpty) {
        // --- START: NEW UNDO-FRIENDLY FIX ---
        // Instead of a zero-width space, we now use a <br> tag, which is the
        // browser's standard way of representing an empty line. This makes
        // the undo operation much more stable.
        targetBlock.innerHTML = '<br>';
        
        // Then, we place the cursor at the very beginning of the block.
        // `execCommand` will see the cursor in this block and format it correctly.
        const selection = window.getSelection();
        const newRange = document.createRange();
        newRange.setStart(targetBlock, 0); // Position before the first child (the <br>)
        newRange.collapse(true); // Make it a blinking caret
        selection.removeAllRanges();
        selection.addRange(newRange);
        // --- END: NEW UNDO-FRIENDLY FIX ---
      }
    }
    
    // 3. Hide the command menu BEFORE executing the action.
    // The input event handler probably already did this, but it's safe to call again.
    this.hide();

    // 4. Execute the command's specific action, using our preserved copy.
    if (command.action) {
      command.action(this.editor, triggerInfo);
    }
    
    // 5. Ensure the editor is focused. The browser will place the cursor correctly
    // after execCommand, and we don't need to manually collapse the selection anymore.
    this.editor.editorEl.focus();
  }
}