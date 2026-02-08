// src/renderer/editor/ast/nodes/inline.js

import { ASTNode } from './base.js';
import { NodeType } from '../types.js';

/**
 * Bold text node
 */
export class BoldNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.BOLD, { children });
  }
}

/**
 * Italic text node
 */
export class ItalicNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.ITALIC, { children });
  }
}

/**
 * Strikethrough text node
 */
export class StrikethroughNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.STRIKETHROUGH, { children });
  }
}

/**
 * Underline text node
 */
export class UnderlineNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.UNDERLINE, { children });
  }
}

/**
 * Highlight text node
 */
export class HighlightNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.HIGHLIGHT, { children });
  }
}

/**
 * Inline code node
 */
export class InlineCodeNode extends ASTNode {
  constructor(value) {
    super(NodeType.INLINE_CODE, { value });
  }
  
  getTextContent() {
    return this.value;
  }
}

/**
 * Link node
 */
export class LinkNode extends ASTNode {
  constructor(href, children = [], title = '') {
    super(NodeType.LINK, { href, children, title });
  }
}

/**
 * Checkbox node (for task lists)
 */
export class CheckboxNode extends ASTNode {
  constructor(checked = false) {
    super(NodeType.CHECKBOX, { checked });
  }
}
