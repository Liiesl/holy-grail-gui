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
    if (!node.children || node.children.length === 0) {
      return '';
    }
    
    const parts = [];
    
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const content = this.visit(child);
      
      // Only skip null/undefined, allow empty strings and whitespace
      if (content === null || content === undefined) continue;
      
      // Check if this node is a block
      const isCurrentBlock = this.isBlockNode(child);
      const prevChild = i > 0 ? node.children[i - 1] : null;
      const isPrevBlock = prevChild && this.isBlockNode(prevChild);
      const isPrevEmpty = prevChild && prevChild.type === 'EmptyParagraph';
      const isCurrentEmpty = child.type === 'EmptyParagraph';
      
      // Add separator between consecutive non-empty blocks
      // Don't add separator if previous was EmptyParagraph (it contributes its own \n\n)
      // Don't add separator if current is EmptyParagraph (it contributes its own \n\n)
      if (isCurrentBlock && isPrevBlock && !isPrevEmpty && !isCurrentEmpty) {
        parts.push('\n\n');
      }
      
      if (isCurrentEmpty) {
        // EmptyParagraph represents a blank line, which is \n\n in markdown
        parts.push('\n\n');
      } else {
        parts.push(content);
      }
    }
    
    const result = parts.join('');
    
    // Trim leading/trailing whitespace, but preserve content if it's only whitespace
    // (to allow standalone empty paragraphs to survive)
    const trimmed = result.replace(/^\s+|\s+$/g, '');
    return trimmed === '' && result.length > 0 ? result : trimmed;
  }
  
  /**
   * Check if a node is a block-level node that provides spacing
   */
  isBlockNode(node) {
    if (!node) return false;
    const blockTypes = ['Paragraph', 'EmptyParagraph', 'Heading', 'Blockquote', 'CodeBlock', 'UnorderedList', 'OrderedList', 'Table', 'Alert', 'Kanban'];
    return blockTypes.includes(node.type);
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
    return content;
  }
  
  /**
   * Empty paragraph node (intentional blank line)
   * The spacing is handled in visitDocument based on context
   */
  visitEmptyParagraph(node) {
    return ''; // Handled in visitDocument
  }
  
  /**
   * Heading node
   */
  visitHeading(node) {
    const content = this.visitChildren(node);
    const hashes = '#'.repeat(node.level);
    return `${hashes} ${content}`;
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
    return quotedLines.join('\n');
  }
  
  /**
   * Code block node
   */
  visitCodeBlock(node) {
    const lang = node.language || '';
    return `\`\`\`${lang}\n${node.value}\n\`\`\``;
  }
  
  /**
   * Horizontal rule node
   */
  visitHorizontalRule(node) {
    return '---';
  }
  
  /**
   * Unordered list node
   */
  visitUnorderedList(node) {
    const items = node.children.map(item => {
      return this.visit(item);
    }).join('');
    return items;
  }

  /**
   * Ordered list node
   */
  visitOrderedList(node) {
    const items = node.children.map((item, index) => {
      return this.visitListItem(item, index + 1);
    }).join('');
    return items;
  }

  /**
   * List item node
   */
  visitListItem(node, index = null) {
    const indent = ' '.repeat(this.indentLevel);
    
    // Handle task item
    let prefix = '- ';
    if (node.checked !== null) {
      const check = node.checked ? 'x' : ' ';
      prefix = `- [${check}] `;
    } else if (index !== null) {
      prefix = `${index}. `;
    }

    // Separate inline content from nested lists
    let inlineContent = '';
    let nestedLists = '';
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (child.type === 'UnorderedList' || child.type === 'OrderedList') {
          // Nested lists need indentation - increment before visiting
          this.indentLevel += 2;
          const nestedContent = this.visit(child);
          this.indentLevel -= 2;
          // Remove trailing newlines to prevent double newlines
          nestedLists += nestedContent.replace(/\n+$/, '');
        } else if (child.type === 'Paragraph') {
          // Check if paragraph is just whitespace/empty
          const paraContent = this.visit(child).trim();
          if (paraContent) {
            inlineContent += paraContent;
          }
        } else {
          // Inline content
          inlineContent += this.visit(child);
        }
      });
    }

    // Trim leading/trailing whitespace from inline content
    inlineContent = inlineContent.trim();

    // Preserve at least one space for empty list items without nested lists
    if (inlineContent === '' && node.checked === null && !nestedLists) {
      inlineContent = ' ';
    }

    // Combine inline content and nested lists
    let content = inlineContent;
    if (nestedLists) {
      if (content) {
        content += '\n' + nestedLists;
      } else {
        content = nestedLists;
      }
    }

    // Return with single newline - list items need to be on separate lines
    return `${indent}${prefix}${content}\n`;
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
    return `::${node.alertType}[${node.value}]`;
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
