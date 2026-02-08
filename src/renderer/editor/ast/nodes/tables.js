// src/renderer/editor/ast/nodes/tables.js

import { ASTNode } from './base.js';
import { NodeType } from '../types.js';

/**
 * Table node
 */
export class TableNode extends ASTNode {
  constructor(headerRows = [], bodyRows = [], props = {}) {
    super(NodeType.TABLE, { 
      headerRows,
      bodyRows,
      alignments: props.alignments || [],
      widths: props.widths || [],
      globalWidth: props.globalWidth || null
    });
  }
}

/**
 * Table row node
 */
export class TableRowNode extends ASTNode {
  constructor(cells = [], isHeader = false) {
    super(NodeType.TABLE_ROW, { children: cells, isHeader });
  }
  
  get cells() {
    return this.children;
  }
}

/**
 * Table cell node
 */
export class TableCellNode extends ASTNode {
  constructor(children = [], props = {}) {
    super(NodeType.TABLE_CELL, { 
      children,
      align: props.align || null,
      width: props.width || null
    });
  }
}
