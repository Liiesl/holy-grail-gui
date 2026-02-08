// src/renderer/editor/visitors/htmlVisitor.js

import { NodeType } from '../ast/types.js';

/**
 * HTML Visitor - Converts AST to HTML string
 * Uses visitor pattern for clean code generation
 */
export class HTMLVisitor {
  constructor() {
    this.htmlParts = [];
  }
  
  /**
   * Visit a node and return HTML
   */
  visit(node) {
    if (!node) return '';
    
    const methodName = `visit${node.type}`;
    if (typeof this[methodName] === 'function') {
      return this[methodName](node);
    }
    
    console.warn(`HTMLVisitor: No visit method for node type ${node.type}`);
    return '';
  }
  
  /**
   * Visit all children and return concatenated HTML
   */
  visitChildren(node) {
    if (!node.children || node.children.length === 0) {
      return '';
    }
    
    return node.children.map(child => this.visit(child)).join('');
  }
  
  /**
   * Document node
   */
  visitDocument(node) {
    const content = this.visitChildren(node);
    // Return empty paragraph if document is empty
    return content || '<p><br></p>';
  }
  
  /**
   * Text node
   */
  visitText(node) {
    return this.escapeHtml(node.value);
  }
  
  /**
   * Line break node
   */
  visitLineBreak(node) {
    return '<br>';
  }
  
  /**
   * Paragraph node
   */
  visitParagraph(node) {
    const content = this.visitChildren(node);
    return `<p>${content}</p>`;
  }
  
  /**
   * Heading node
   */
  visitHeading(node) {
    const content = this.visitChildren(node);
    return `<h${node.level}>${content}</h${node.level}>`;
  }
  
  /**
   * Blockquote node
   */
  visitBlockquote(node) {
    const content = this.visitChildren(node);
    return `<blockquote>${content}</blockquote>`;
  }
  
  /**
   * Code block node
   */
  visitCodeBlock(node) {
    const escapedContent = this.escapeHtml(node.value);
    const langClass = node.language ? ` class="language-${node.language}"` : '';
    return `<pre><code${langClass}>${escapedContent}</code></pre>`;
  }
  
  /**
   * Horizontal rule node
   */
  visitHorizontalRule(node) {
    return '<hr>';
  }
  
  /**
   * Unordered list node
   */
  visitUnorderedList(node) {
    const items = this.visitChildren(node);
    return `<ul>${items}</ul>`;
  }
  
  /**
   * Ordered list node
   */
  visitOrderedList(node) {
    const items = this.visitChildren(node);
    return `<ol>${items}</ol>`;
  }
  
  /**
   * List item node
   */
  visitListItem(node) {
    let content = this.visitChildren(node);
    
    // Add checkbox for task items
    if (node.checked !== null) {
      const checkbox = `<input type="checkbox" disabled${node.checked ? ' checked' : ''}> `;
      content = checkbox + content;
    }
    
    return `<li>${content}</li>`;
  }
  
  /**
   * Bold node
   */
  visitBold(node) {
    const content = this.visitChildren(node);
    return `<strong>${content}</strong>`;
  }
  
  /**
   * Italic node
   */
  visitItalic(node) {
    const content = this.visitChildren(node);
    return `<em>${content}</em>`;
  }
  
  /**
   * Strikethrough node
   */
  visitStrikethrough(node) {
    const content = this.visitChildren(node);
    return `<s>${content}</s>`;
  }
  
  /**
   * Underline node
   */
  visitUnderline(node) {
    const content = this.visitChildren(node);
    return `<u>${content}</u>`;
  }
  
  /**
   * Highlight node
   */
  visitHighlight(node) {
    const content = this.visitChildren(node);
    return `<mark>${content}</mark>`;
  }
  
  /**
   * Inline code node
   */
  visitInlineCode(node) {
    return `<code>${this.escapeHtml(node.value)}</code>`;
  }
  
  /**
   * Link node
   */
  visitLink(node) {
    const content = this.visitChildren(node);
    const title = node.title ? ` title="${this.escapeHtml(node.title)}"` : '';
    return `<a href="${this.escapeHtml(node.href)}"${title}>${content}</a>`;
  }
  
  /**
   * Checkbox node (for task lists)
   */
  visitCheckbox(node) {
    return `<input type="checkbox" disabled${node.checked ? ' checked' : ''}>`;
  }
  
  /**
   * Table node
   */
  visitTable(node) {
    const parts = [];
    
    // Build table style
    let tableStyle = '';
    if (node.globalWidth) {
      tableStyle = ` style="width: ${node.globalWidth};"`;
    }
    
    parts.push(`<table${tableStyle}>`);
    
    // Header
    if (node.headerRows && node.headerRows.length > 0) {
      parts.push('<thead>');
      node.headerRows.forEach(row => {
        parts.push(this.visit(row));
      });
      parts.push('</thead>');
    }
    
    // Body
    if (node.bodyRows && node.bodyRows.length > 0) {
      parts.push('<tbody>');
      node.bodyRows.forEach(row => {
        parts.push(this.visit(row));
      });
      parts.push('</tbody>');
    }
    
    parts.push('</table>');
    
    return parts.join('');
  }
  
  /**
   * Table row node
   */
  visitTableRow(node) {
    const cells = node.cells.map(cell => this.visit(cell)).join('');
    return `<tr>${cells}</tr>`;
  }
  
  /**
   * Table cell node
   */
  visitTableCell(node) {
    const content = this.visitChildren(node);
    const tag = node.isHeader ? 'th' : 'td';
    
    // Build cell style
    const styles = [];
    if (node.align) {
      styles.push(`text-align: ${node.align};`);
    }
    if (node.width) {
      styles.push(`width: ${node.width};`);
    }
    
    const styleAttr = styles.length > 0 ? ` style="${styles.join('')}"` : '';
    
    return `<${tag}${styleAttr}>${content}</${tag}>`;
  }

  /**
   * Table header cell node  
   */
  visitTableHeaderCell(node) {
    // Reuse visitTableCell logic but ensure isHeader is true
    node.isHeader = true;
    return this.visitTableCell(node);
  }
  
  /**
   * Alert node
   */
  visitAlert(node) {
    return `<div class="alert alert-${node.alertType}">${this.escapeHtml(node.value)}</div>`;
  }
  
  /**
   * Kanban node
   */
  visitKanban(node) {
    const parts = [];
    parts.push('<div class="kanban-board" contenteditable="false">');
    
    node.columns.forEach(column => {
      parts.push(this.visit(column));
    });
    
    parts.push('<button class="kanban-add-column" title="Add another column" contenteditable="false">+</button>');
    parts.push('</div><!--KANBAN_END_MARKER-->');
    
    return parts.join('');
  }
  
  /**
   * Kanban column node
   */
  visitKanbanColumn(node) {
    const parts = [];
    parts.push('<div class="kanban-column">');
    parts.push(`<div class="kanban-column-title" contenteditable="true">${this.escapeHtml(node.title)}</div>`);
    parts.push('<div class="kanban-cards">');
    
    node.cards.forEach(card => {
      parts.push(this.visit(card));
    });
    
    parts.push('</div>');
    parts.push('<button class="kanban-add-card" contenteditable="false">+ Add Card</button>');
    parts.push('</div>');
    
    return parts.join('');
  }
  
  /**
   * Kanban card node
   */
  visitKanbanCard(node) {
    const content = this.visitChildren(node);
    const cardContent = content || '<br>';
    
    return `<div class="kanban-card-wrapper" draggable="true"><div class="kanban-card" contenteditable="true">${cardContent}</div></div>`;
  }
  
  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
