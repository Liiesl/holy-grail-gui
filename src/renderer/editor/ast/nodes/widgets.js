// src/renderer/editor/ast/nodes/widgets.js

import { ASTNode, TextNode } from './base.js';
import { NodeType, AlertType } from '../types.js';

/**
 * Alert widget node
 */
export class AlertNode extends ASTNode {
  constructor(type, content) {
    if (!Object.values(AlertType).includes(type)) {
      console.warn(`Invalid alert type: ${type}, defaulting to info`);
      type = AlertType.INFO;
    }
    super(NodeType.ALERT, { 
      alertType: type,
      value: content
    });
  }
  
  getTextContent() {
    return this.value;
  }
}

/**
 * Kanban board node
 */
export class KanbanNode extends ASTNode {
  constructor(columns = []) {
    super(NodeType.KANBAN, { children: columns });
  }
  
  get columns() {
    return this.children;
  }
}

/**
 * Kanban column node
 */
export class KanbanColumnNode extends ASTNode {
  constructor(title, cards = []) {
    super(NodeType.KANBAN_COLUMN, { 
      title: title || 'Untitled',
      children: cards
    });
  }
  
  get cards() {
    return this.children;
  }
}

/**
 * Kanban card node
 */
export class KanbanCardNode extends ASTNode {
  constructor(children = []) {
    super(NodeType.KANBAN_CARD, { children });
  }
}
