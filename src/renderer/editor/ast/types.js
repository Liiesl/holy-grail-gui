// src/renderer/editor/ast/types.js

/**
 * AST Node Types for HGMD
 * Defines all possible node types in the abstract syntax tree
 */

export const NodeType = {
  // Document
  DOCUMENT: 'Document',
  
  // Block elements
  PARAGRAPH: 'Paragraph',
  HEADING: 'Heading',
  BLOCKQUOTE: 'Blockquote',
  CODE_BLOCK: 'CodeBlock',
  UNORDERED_LIST: 'UnorderedList',
  ORDERED_LIST: 'OrderedList',
  LIST_ITEM: 'ListItem',
  HORIZONTAL_RULE: 'HorizontalRule',
  
  // Tables
  TABLE: 'Table',
  TABLE_ROW: 'TableRow',
  TABLE_CELL: 'TableCell',
  
  // Widgets
  ALERT: 'Alert',
  KANBAN: 'Kanban',
  KANBAN_COLUMN: 'KanbanColumn',
  KANBAN_CARD: 'KanbanCard',
  
  // Inline elements
  TEXT: 'Text',
  BOLD: 'Bold',
  ITALIC: 'Italic',
  STRIKETHROUGH: 'Strikethrough',
  UNDERLINE: 'Underline',
  HIGHLIGHT: 'Highlight',
  INLINE_CODE: 'InlineCode',
  LINK: 'Link',
  LINE_BREAK: 'LineBreak',
  CHECKBOX: 'Checkbox',
};

export const InlineStyle = {
  BOLD: 'bold',
  ITALIC: 'italic',
  STRIKETHROUGH: 'strikethrough',
  UNDERLINE: 'underline',
  HIGHLIGHT: 'highlight',
  CODE: 'code',
};

export const AlertType = {
  INFO: 'info',
  WARNING: 'warning',
  DANGER: 'danger',
};
