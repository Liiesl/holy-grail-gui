// src/renderer/scmd/commands/advancedCommands.js

export function getAdvancedCommands() {
  return [
    {
      name: 'Table',
      command: 'table',
      description: 'Insert a table',
      disabled: false,
      action: (editor) => {
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
        
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const currentBlock = editor.slashCommand.findParentBlock(range.startContainer);
        
        if (currentBlock && currentBlock.previousElementSibling && currentBlock.previousElementSibling.tagName === 'TABLE') {
          const table = currentBlock.previousElementSibling;
          const firstCell = table.querySelector('th');
          
          if (firstCell) {
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
    {
      name: 'Open to the Right',
      command: 'open-right',
      description: 'Move current tab to a new pane on the right',
      disabled: false,
      action: (editor) => {
        editor.slashCommand.hide();
        // Emit an event that the Main component will listen for to handle the layout change.
        editor.emit('splitPaneRight', { fileId: editor.currentFile });
      }
    },
  ];
}