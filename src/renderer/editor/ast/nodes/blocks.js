// src/renderer/editor/ast/nodes/blocks.js

import { ASTNode, TextNode } from './base.js';
import { NodeType } from '../types.js';

/**
 * Paragraph node
 */
export class ParagraphNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.PARAGRAPH, { children });
  }
}

/**
 * Empty paragraph node (represents intentional blank line)
 */
export class EmptyParagraphNode extends ASTNode {
  constructor() {
    super(NodeType.EMPTY_PARAGRAPH);
  }
}

/**
 * Heading node (H1-H6)
 */
export class HeadingNode extends ASTNode {
  constructor(level, children = []) {
    if (level < 1 || level > 6) {
      console.warn(`Invalid heading level: ${level}, defaulting to 1`);
      level = 1;
    }
    super(NodeType.HEADING, { level, children });
  }
}

/**
 * Blockquote node
 */
export class BlockquoteNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.BLOCKQUOTE, { children });
  }
}

/**
 * Code block node
 */
export class CodeBlockNode extends ASTNode {
  constructor(language, content) {
    super(NodeType.CODE_BLOCK, { 
      language: language || '',
      value: content || ''
    });
  }
  
  getTextContent() {
    return this.value;
  }
}

/**
 * Horizontal rule node
 */
export class HorizontalRuleNode extends ASTNode {
  constructor() {
    super(NodeType.HORIZONTAL_RULE);
  }
}

/**
 * Base list node
 */
export class ListNode extends ASTNode {
  constructor(type, children = []) {
    super(type, { children });
  }
}

/**
 * Unordered list node
 */
export class UnorderedListNode extends ListNode {
  constructor(children = []) {
    super(NodeType.UNORDERED_LIST, children);
  }
}

/**
 * Ordered list node
 */
export class OrderedListNode extends ListNode {
  constructor(children = []) {
    super(NodeType.ORDERED_LIST, children);
  }
}

/**
 * List item node
 */
export class ListItemNode extends ASTNode {
  constructor(children = [], checked = null) {
    super(NodeType.LIST_ITEM, { children, checked });
  }
  
  isTaskItem() {
    return this.checked !== null;
  }
}
