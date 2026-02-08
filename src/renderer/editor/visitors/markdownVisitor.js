// src/renderer/editor/visitors/markdownVisitor.js

import { NodeType } from '../ast/types.js';

/**
 * Markdown Visitor - Converts AST to Markdown string
 * Uses visitor pattern for clean code generation
 */
export class MarkdownVisitor {
  constructor() {
    this.indentLevel = 0;
  }
  
  /**
   * Visit a node and return Markdown
   */
  visit(node) {
    if (!node) return '';
    
    const methodName = `visit${node.type}`;
    if (typeof this[methodName] === 'function') {
      return this[methodName](node);
    }
    
    console.warn(`MarkdownVisitor: No visit method for node type ${node.type}`);
    return '';
  }
  
  /**
   * Visit all children and return concatenated Markdown
   */
  visitChildren(node, separator = '') {
    if (!node.children || node.children.length === 0) {
      return '';
    }
    
    return node.children.map(child => this.visit(child)).join(separator);
  }
  
  /**
   * Document node
   */
  visitDocument(node) {
    const content = this.visitChildren(node, '\n');
    return content.trim();
  }
  
  /**
   * Text node
   */
  visitText(node) {
    return this.escapeMarkdown(node.value);
  }
  
  /**
   * Line break node
   */
  visitLineBreak(node) {
    return '\n';
  }
  
  /**
   * Paragraph node
   */
  visitParagraph(node) {
    const content = this.visitChildren(node);
    return content + '\n\n';
  }
  
  /**
   * Heading node
   */
  visitHeading(node) {
    const content = this.visitChildren(node);
    const hashes = '#'.repeat(node.level);
    return `${hashes} ${content}\n`;
  }
  
  /**
   * Blockquote node
   */
  visitBlockquote(node) {
    const content = this.visitChildren(node, '\n');
    const lines = content.split('\n');
    const quotedLines = lines.map(line => {
      if (line.trim() === '') return '';
      return `> ${line}`;
    });
    return quotedLines.join('\n') + '\n';
  }
  
  /**
   * Code block node
   */
  visitCodeBlock(node) {
    const lang = node.language || '';
    return `\`\`\`${lang}\n${node.value}\n\`\`\`\n`;
  }
  
  /**
   * Horizontal rule node
   */
  visitHorizontalRule(node) {
    return '---\n';
  }
  
  /**
   * Unordered list node
   */
  visitUnorderedList(node) {
    const items = node.children.map(item => this.visit(item)).join('');
    return items + '\n';
  }
  
  /**
   * Ordered list node
   */
  visitOrderedList(node) {
    const items = node.children.map((item, index) => {
      const content = this.visitListItem(item, index + 1);
      return content;
    }).join('');
    return items + '\n';
  }
  
  /**
   * List item node
   */
  visitListItem(node, index = null) {
    let content = this.visitChildren(node);
    
    // Handle task item
    let prefix = '- ';
    if (node.checked !== null) {
      const check = node.checked ? 'x' : ' ';
      prefix = `- [${check}] `;
    } else if (index !== null) {
      prefix = `${index}. `;
    }
    
    return `${prefix}${content}\n`;
  }
  
  /**
   * Bold node
   */
  visitBold(node) {
    const content = this.visitChildren(node);
    return `**${content}**`;
  }
  
  /**
   * Italic node
   */
  visitItalic(node) {
    const content = this.visitChildren(node);
    return `*${content}*`;
  }
  
  /**
   * Strikethrough node
   */
  visitStrikethrough(node) {
    const content = this.visitChildren(node);
    return `~~${content}~~`;
  }
  
  /**
   * Underline node
   */
  visitUnderline(node) {
    const content = this.visitChildren(node);
    return `++${content}++`;
  }
  
  /**
   * Highlight node
   */
  visitHighlight(node) {
    const content = this.visitChildren(node);
    return `==${content}==`;
  }
  
  /**
   * Inline code node
   */
  visitInlineCode(node) {
    return `\`${node.value}\``;
  }
  
  /**
   * Link node
   */
  visitLink(node) {
    const content = this.visitChildren(node);
    return `[${content}](${node.href})`;
  }
  
  /**
   * Checkbox node (part of task list item)
   */
  visitCheckbox(node) {
    // Checkboxes are handled in visitListItem
    return '';
  }
  
  /**
   * Table node
   */
  visitTable(node) {
    const parts = [];
    
    // Header row
    if (node.headerRows && node.headerRows.length > 0) {
      const headerRow = node.headerRows[0];
      const headerCells = headerRow.cells.map(cell => {
        const content = this.visitChildren(cell).trim();
        return ` ${content} `;
      });
      parts.push(`|${headerCells.join('|')}|\n`);
      
      // Separator row with alignments and widths
      const separatorCells = headerRow.cells.map((cell, i) => {
        const align = cell.align || node.alignments[i];
        const width = cell.width || node.widths[i];
        
        let separator = width ? `-${width}-` : '---';
        
        if (align === 'center') {
          separator = `:${separator}:`;
        } else if (align === 'left') {
          separator = `:${separator}`;
        } else if (align === 'right') {
          separator = `${separator}:`;
        }
        
        return ` ${separator} `;
      });
      
      let separator = `|${separatorCells.join('|')}|`;
      if (node.globalWidth) {
        separator += ` ${node.globalWidth}`;
      }
      parts.push(separator + '\n');
    }
    
    // Body rows
    if (node.bodyRows) {
      node.bodyRows.forEach(row => {
        const cells = row.cells.map(cell => {
          const content = this.visitChildren(cell).trim();
          return ` ${content} `;
        });
        parts.push(`|${cells.join('|')}|\n`);
      });
    }
    
    return parts.join('');
  }
  
  /**
   * Table row node
   */
  visitTableRow(node) {
    // Handled in visitTable
    return '';
  }
  
  /**
   * Table cell node
   */
  visitTableCell(node) {
    // Handled in visitTable
    return this.visitChildren(node);
  }
  
  /**
   * Alert node
   */
  visitAlert(node) {
    return `::${node.alertType}[${node.value}]\n`;
  }
  
  /**
   * Kanban node
   */
  visitKanban(node) {
    const parts = [];
    parts.push('- [>] Kanban Board\n');
    
    node.columns.forEach(column => {
      parts.push(this.visit(column));
    });
    
    parts.push('- [<] Kanban Board\n');
    
    return parts.join('');
  }
  
  /**
   * Kanban column node
   */
  visitKanbanColumn(node) {
    const parts = [];
    parts.push(`  - [>] ${node.title}\n`);
    
    node.cards.forEach(card => {
      parts.push(this.visit(card));
    });
    
    return parts.join('');
  }
  
  /**
   * Kanban card node
   */
  visitKanbanCard(node) {
    const content = this.visitChildren(node).trim();
    return `    - [~] ${content}\n`;
  }
  
  /**
   * Escape markdown special characters in text
   */
  escapeMarkdown(text) {
    if (!text) return '';
    // Escape characters that have special meaning in markdown
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
      .replace(/`/g, '\\`');
  }
}
