// src/renderer/scmd/commands/coreCommands.js

export function getCoreCommands() {
  return [
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
        const sel = window.getSelection();
        if (!sel.rangeCount || !sel.isCollapsed) return;
        
        const range = sel.getRangeAt(0);
        
        const colonNode = document.createTextNode(':');
        range.insertNode(colonNode);
        
        range.setStartAfter(colonNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        setTimeout(() => {
          const colonRange = document.createRange();
          colonRange.selectNode(colonNode);
          const rect = colonRange.getBoundingClientRect();

          const editorRect = editor.container.getBoundingClientRect();
          const position = {
              top: rect.bottom - editorRect.top,
              left: rect.left - editorRect.left,
          };
          
          const emojiTriggerInfo = { range: colonRange, filter: '' };
          editor.emojiPicker.show(position, emojiTriggerInfo);
        }, 0);
      }
    },
    { name: 'Seek', command: 'seek', description: 'Find and link to another note', disabled: true },
    { name: 'Switch page', command: 'switch', description: 'Quickly jump to another page', disabled: true },
  ];
}