// src/renderer/editor/ast/nodes/base.js

import { NodeType } from '../types.js';

/**
 * Base class for all AST nodes
 */
export class ASTNode {
  constructor(type, props = {}) {
    this.type = type;
    this.children = props.children || [];
    this.value = props.value || null;
    this.props = props;
    
    // Set other properties from props
    Object.keys(props).forEach(key => {
      if (key !== 'children' && key !== 'value') {
        this[key] = props[key];
      }
    });
  }
  
  /**
   * Accept a visitor
   */
  accept(visitor) {
    const visitMethod = `visit${this.type}`;
    if (typeof visitor[visitMethod] === 'function') {
      return visitor[visitMethod](this);
    }
    
    // Fallback to generic visit method
    if (typeof visitor.visit === 'function') {
      return visitor.visit(this);
    }
    
    console.warn(`Visitor does not implement method for node type: ${this.type}`);
    return null;
  }
  
  /**
   * Add a child node
   */
  appendChild(child) {
    this.children.push(child);
    return this;
  }
  
  /**
   * Get text content of node and all children
   */
  getTextContent() {
    if (this.value && typeof this.value === 'string') {
      return this.value;
    }
    return this.children.map(child => child.getTextContent()).join('');
  }
}

/**
 * Document node - root of the AST
 */
export class DocumentNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.DOCUMENT, { children });
  }
}

/**
 * Text node - leaf node containing raw text
 */
export class TextNode extends ASTNode {
  constructor(value) {
    super(NodeType.TEXT, { value: value || '' });
  }
  
  getTextContent() {
    return this.value;
  }
}

/**
 * Line break node
 */
export class LineBreakNode extends ASTNode {
  constructor() {
    super(NodeType.LINE_BREAK);
  }
}
