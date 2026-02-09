// src/renderer/editor/parser/markdownParser.js

import {
  DocumentNode, TextNode, LineBreakNode,
  ParagraphNode, HeadingNode, BlockquoteNode, CodeBlockNode, HorizontalRuleNode,
  UnorderedListNode, OrderedListNode, ListItemNode,
  BoldNode, ItalicNode, StrikethroughNode, UnderlineNode, HighlightNode, InlineCodeNode, LinkNode,
  TableNode, TableRowNode, TableCellNode,
  AlertNode, KanbanNode, KanbanColumnNode, KanbanCardNode
} from '../ast/index.js';

/**
 * Markdown Parser - Converts Markdown to AST
 * Uses a line-based parsing approach with recursive descent for inline content
 */
export class MarkdownParser {
  constructor() {
    this.lines = [];
    this.pos = 0;
  }
  
  /**
   * Parse markdown string to AST
   */
  parse(markdown) {
    if (!markdown || markdown.trim() === '') {
      return new DocumentNode([]);
    }
    
    // Split into lines
    this.lines = markdown.split('\n');
    this.pos = 0;
    
    const children = [];
    let lastWasBlock = false;
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      const trimmed = line.trim();
      
      // Handle empty lines at block level
      if (trimmed === '') {
        // If we just parsed a block and there's a blank line, insert empty paragraph
        if (lastWasBlock) {
          children.push(new ParagraphNode([new LineBreakNode()]));
          lastWasBlock = false;
        }
        this.pos++;
        continue;
      }
      
      // Try to parse as a block element
      const node = this.parseBlock();
      if (node) {
        children.push(node);
        lastWasBlock = true;
      } else {
        this.pos++;
      }
    }
    
    return new DocumentNode(children);
  }
  
  /**
   * Parse a block-level element
   */
  parseBlock() {
    const line = this.lines[this.pos];
    const trimmed = line.trim();
    
    // Kanban board (multi-line)
    if (this.isKanbanStart(trimmed)) {
      return this.parseKanban();
    }
    
    // Fenced code block (multi-line)
    if (this.isCodeBlockStart(trimmed)) {
      return this.parseCodeBlock();
    }
    
    // Table (multi-line)
    if (this.isTableStart(trimmed)) {
      const table = this.parseTable();
      if (table) return table;
      // If parseTable returns null, this line looks like a table but isn't
      // Treat it as a paragraph instead
      return this.parseParagraph();
    }
    
    // Blockquote (multi-line)
    if (trimmed.startsWith('>')) {
      return this.parseBlockquote();
    }
    
    // Unordered list (multi-line)
    if (this.isUnorderedListItem(trimmed)) {
      return this.parseUnorderedList();
    }
    
    // Ordered list (multi-line)
    if (this.isOrderedListItem(trimmed)) {
      return this.parseOrderedList();
    }
    
    // Horizontal rule
    if (this.isHorizontalRule(trimmed)) {
      this.pos++;
      return new HorizontalRuleNode();
    }
    
    // Heading
    if (this.isHeading(trimmed)) {
      return this.parseHeading();
    }
    
    // Alert widget
    if (this.isAlert(trimmed)) {
      return this.parseAlert();
    }
    
    // Default: paragraph
    return this.parseParagraph();
  }
  
  /**
   * Check if line is a kanban start
   */
  isKanbanStart(line) {
    return /^\s*-\s*\[>\]/.test(line);
  }
  
  /**
   * Check if line is a code block start
   */
  isCodeBlockStart(line) {
    return /^\s*```/.test(line);
  }
  
  /**
   * Check if line is a table start
   */
  isTableStart(line) {
    return /^\s*\|/.test(line);
  }
  
  /**
   * Check if line is a horizontal rule
   */
  isHorizontalRule(line) {
    return /^(?:---|\*\*\*|___)\s*$/.test(line);
  }
  
  /**
   * Check if line is a heading
   */
  isHeading(line) {
    return /^#{1,6}(\s|$)/.test(line);
  }
  
  /**
   * Check if line is an unordered list item
   */
  isUnorderedListItem(line) {
    return /^\s*[-*+]\s/.test(line);
  }
  
  /**
   * Check if line is an ordered list item
   */
  isOrderedListItem(line) {
    return /^\s*\d+\.\s/.test(line);
  }
  
  /**
   * Check if line is an alert
   */
  isAlert(line) {
    return /^::(info|warning|danger)\[/.test(line);
  }
  
  /**
   * Parse kanban board
   */
  parseKanban() {
    this.pos++; // Skip start line
    const columns = [];
    let currentColumn = null;
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      
      // Check for end marker
      if (/^\s*-\s*\[<\]/.test(line.trim())) {
        this.pos++;
        break;
      }
      
      // Column line (2-4 spaces indentation)
      const columnMatch = line.match(/^\s{2,4}-\s*\[>\]\s*(.*)$/);
      if (columnMatch) {
        // Save previous column
        if (currentColumn) {
          columns.push(currentColumn);
        }
        
        const title = columnMatch[1].trim();
        currentColumn = new KanbanColumnNode(title, []);
      }
      // Card line (4+ spaces indentation)
      else if (currentColumn) {
        const cardMatch = line.match(/^\s{4,}-\s*\[~\]\s*(.*)$/);
        if (cardMatch) {
          const content = cardMatch[1].trim();
          const cardChildren = content ? this.parseInline(content) : [new TextNode('')];
          currentColumn.appendChild(new KanbanCardNode(cardChildren));
        }
      }
      
      this.pos++;
    }
    
    // Don't forget the last column
    if (currentColumn) {
      columns.push(currentColumn);
    }
    
    return new KanbanNode(columns);
  }
  
  /**
   * Parse fenced code block
   */
  parseCodeBlock() {
    const startLine = this.lines[this.pos];
    const startMatch = startLine.match(/^(\s*)```(\w*)/);
    const indentLength = startMatch[1].length;
    const language = startMatch[2];
    
    this.pos++;
    const contentLines = [];
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      
      if (/^\s*```\s*$/.test(line)) {
        this.pos++;
        break;
      }
      
      // Remove leading indentation
      const dedentedLine = line.slice(indentLength);
      contentLines.push(dedentedLine);
      this.pos++;
    }
    
    return new CodeBlockNode(language, contentLines.join('\n'));
  }
  
  /**
   * Parse table
   */
  parseTable() {
    const headerLine = this.lines[this.pos].trim();

    // Need at least 2 lines for a table
    if (this.pos + 1 >= this.lines.length) {
      return null;
    }

    const separatorLine = this.lines[this.pos + 1].trim();

    // Check if separator line is valid (must start with | and contain dashes)
    if (!/^\|/.test(separatorLine) || !/:?-+/.test(separatorLine)) {
      return null;
    }
    
    this.pos += 2;
    
    // Extract global width from separator line
    let globalWidth = null;
    const widthMatch = separatorLine.match(/\|\s*([^\s|]+)\s*$/);
    if (widthMatch) {
      globalWidth = widthMatch[1].trim();
    }
    
    // Parse column styles from separator
    const separatorCells = separatorLine
      .replace(/\|\s*[^|\s]+\s*$/, '|')
      .trim().slice(1, -1).split('|');
    
    const alignments = [];
    const widths = [];
    
    separatorCells.forEach(cell => {
      const trimmed = cell.trim();
      let align = null;
      
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
        align = 'center';
      } else if (trimmed.startsWith(':')) {
        align = 'left';
      } else if (trimmed.endsWith(':')) {
        align = 'right';
      }
      
      // Extract width from patterns like -100px- or -20%-
      // Pattern: optional colon at start, dash, width (non-greedy), dash, optional colon at end
      // The width should not include trailing colons used for alignment
      const widthPattern = trimmed.replace(/^:?-|-:?$/g, '');
      // Check if what's left is a width (contains non-dash characters and isn't just colons)
      const width = (widthPattern && widthPattern.length > 0 && /[^-:]/.test(widthPattern)) ? widthPattern.replace(/:+$/, '') : null;
      
      alignments.push(align);
      widths.push(width);
    });
    
    // Parse header - create header cells with isHeader=true
    const headerCells = this.parseTableCells(headerLine.slice(1, -1));
    const headerRowCells = headerCells.map((cell, i) => {
      const cellNode = new TableCellNode(this.parseInline(cell.trim()), {
        align: alignments[i],
        width: widths[i]
      });
      cellNode.isHeader = true;
      return cellNode;
    });
    const headerRows = [new TableRowNode(headerRowCells, true)];
    
    // Parse body rows
    const bodyRows = [];
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos].trim();
      
      if (!line.startsWith('|')) break;
      
      const bodyCells = this.parseTableCells(line.slice(1, -1));
      const rowCells = bodyCells.map((cell, i) => {
        return new TableCellNode(this.parseInline(cell.trim()), {
          align: alignments[i]
        });
      });
      bodyRows.push(new TableRowNode(rowCells, false));
      this.pos++;
    }
    
    return new TableNode(headerRows, bodyRows, {
      alignments,
      widths,
      globalWidth
    });
  }
  
  /**
   * Parse table cells, respecting escaped pipes
   */
  parseTableCells(line) {
    const placeholder = '\uE001';
    const protectedLine = line.replace(/\\\|/g, placeholder);
    const cells = protectedLine.split('|');
    return cells.map(cell => cell.replace(new RegExp(placeholder, 'g'), '|'));
  }
  
  /**
   * Parse blockquote
   */
  parseBlockquote() {
    const contentLines = [];
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      
      if (!line.startsWith('>')) break;
      
      // Remove leading '> ' or '>'
      const content = line.startsWith('> ') ? line.substring(2) : line.substring(1);
      contentLines.push(content);
      this.pos++;
    }
    
    // Parse content as markdown
    const innerParser = new MarkdownParser();
    const innerDoc = innerParser.parse(contentLines.join('\n'));
    
    return new BlockquoteNode(innerDoc.children);
  }
  
  /**
   * Parse unordered list with support for nested lists
   */
  parseUnorderedList() {
    return this.parseList('unordered');
  }

  /**
   * Parse ordered list with support for nested lists
   */
  parseOrderedList() {
    return this.parseList('ordered');
  }

  /**
   * Generic list parser that handles both ordered and unordered with nesting
   */
  parseList(type) {
    const items = [];
    const baseIndent = this.getCurrentLineIndent();
    
    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];
      const trimmed = line.trim();
      const currentIndent = this.getLineIndent(line);
      
      // Check if this line is a list item of the correct type
      const isUnorderedItem = type === 'unordered' && /^\s*[-*+]\s/.test(line);
      const isOrderedItem = type === 'ordered' && /^\s*\d+\.\s/.test(line);
      
      if (!isUnorderedItem && !isOrderedItem) break;
      
      // Check indentation - same level means new item, more means nested list, less means exit
      if (currentIndent < baseIndent) break;
      
      // Parse the list item
      const item = type === 'unordered' 
        ? this.parseUnorderedListItem(currentIndent)
        : this.parseOrderedListItem(currentIndent);
      
      if (item) {
        items.push(item);
      }
    }
    
    return type === 'unordered' 
      ? new UnorderedListNode(items)
      : new OrderedListNode(items);
  }

  /**
   * Get indentation level of current line
   */
  getCurrentLineIndent() {
    if (this.pos >= this.lines.length) return 0;
    return this.getLineIndent(this.lines[this.pos]);
  }

  /**
   * Get indentation level of a specific line
   */
  getLineIndent(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  /**
   * Parse a single unordered list item with potential nested content
   */
  parseUnorderedListItem(indent) {
    const line = this.lines[this.pos];
    const match = line.match(/^(\s*)[-*+](?:\s+(?:\[([ xX])\]\s+)?(.*))?$/);
    if (!match) return null;
    
    const [, , check, content] = match;
    
    // Determine if it's a task item
    let checked = null;
    if (check !== undefined) {
      checked = check.toLowerCase() === 'x';
    }
    
    this.pos++;
    
    // Parse the content and any nested lists
    const children = this.parseListItemContent(indent, content || '');
    
    return new ListItemNode(children, checked);
  }

  /**
   * Parse a single ordered list item with potential nested content
   */
  parseOrderedListItem(indent) {
    const line = this.lines[this.pos];
    const match = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (!match) return null;
    
    const [, , content] = match;
    
    this.pos++;
    
    // Parse the content and any nested lists
    const children = this.parseListItemContent(indent, content);
    
    return new ListItemNode(children);
  }

  /**
   * Parse list item content including any nested lists
   */
  parseListItemContent(baseIndent, initialContent) {
    const children = [];
    const contentLines = [];
    
    // Add initial content
    if (initialContent.trim()) {
      contentLines.push(initialContent);
    }
    
    // Collect continuation lines and check for nested lists
    const contentIndent = baseIndent + 2;
    
    while (this.pos < this.lines.length) {
      const nextLine = this.lines[this.pos];
      const nextIndent = this.getLineIndent(nextLine);
      const nextTrimmed = nextLine.trim();
      
      // Skip empty lines but don't break - they might be between nested items
      if (nextTrimmed === '') {
        this.pos++;
        continue;
      }
      
      // Check for nested list (indented more than current item)
      if (nextIndent > baseIndent) {
        // Check if it's a nested unordered list
        if (/^\s*[-*+]\s/.test(nextLine)) {
          // Parse the nested list
          const nestedList = this.parseUnorderedList();
          // First, add any accumulated content as inline nodes
          if (contentLines.length > 0) {
            const content = contentLines.join(' ').trim();
            if (content) {
              const inlineNodes = this.parseInline(content);
              children.push(...inlineNodes);
            }
            contentLines.length = 0;
          }
          children.push(nestedList);
          continue;
        }
        
        // Check for nested ordered list
        if (/^\s*\d+\.\s/.test(nextLine)) {
          const nestedList = this.parseOrderedList();
          // First, add any accumulated content as inline nodes
          if (contentLines.length > 0) {
            const content = contentLines.join(' ').trim();
            if (content) {
              const inlineNodes = this.parseInline(content);
              children.push(...inlineNodes);
            }
            contentLines.length = 0;
          }
          children.push(nestedList);
          continue;
        }
        
        // Regular continuation line - add to content
        if (nextLine.length > contentIndent) {
          contentLines.push(nextLine.substring(contentIndent));
        } else {
          contentLines.push(nextLine.trim());
        }
        this.pos++;
      } else {
        // Same or less indentation - end of this item
        break;
      }
    }
    
    // Add remaining content as inline nodes
    if (contentLines.length > 0) {
      const content = contentLines.join(' ').trim();
      if (content) {
        const inlineNodes = this.parseInline(content);
        children.push(...inlineNodes);
      }
    }
    
    return children;
  }
  

  
  /**
   * Check if line starts a new block
   */
  isBlockStart(line) {
    const trimmed = line.trim();
    return this.isHeading(trimmed) ||
           this.isUnorderedListItem(trimmed) ||
           this.isOrderedListItem(trimmed) ||
           this.isHorizontalRule(trimmed) ||
           this.isCodeBlockStart(trimmed) ||
           trimmed.startsWith('>') ||
           trimmed.startsWith('|') ||
           this.isAlert(trimmed) ||
           this.isKanbanStart(trimmed);
  }
  
  /**
   * Parse heading
   */
  parseHeading() {
    const line = this.lines[this.pos];
    const match = line.match(/^(#{1,6})\s*(.*)$/);
    
    if (match) {
      const level = match[1].length;
      const content = match[2];
      this.pos++;
      
      const children = content ? this.parseInline(content) : [];
      return new HeadingNode(level, children);
    }
    
    return null;
  }
  
  /**
   * Parse alert widget
   */
  parseAlert() {
    const line = this.lines[this.pos];
    const match = line.match(/^::(info|warning|danger)\[(.*)\]$/);
    
    if (match) {
      this.pos++;
      return new AlertNode(match[1], match[2]);
    }
    
    return null;
  }
  
  /**
   * Parse paragraph
   */
  parseParagraph() {
    const lines = [];

    while (this.pos < this.lines.length) {
      const line = this.lines[this.pos];

      if (line.trim() === '') break;
      // Check for block starts, but allow lines starting with | (failed table parses)
      if (this.isBlockStart(line) && !line.trim().startsWith('|')) break;

      lines.push(line);
      this.pos++;
    }

    if (lines.length === 0) return null;

    // Join lines with space for inline parsing
    const content = lines.join(' ');
    const children = this.parseInline(content);

    return new ParagraphNode(children);
  }
  
  /**
   * Parse inline content
   */
  parseInline(text) {
    if (!text) return [];
    
    const children = [];
    let remaining = text;
    
    // Process inline elements
    while (remaining.length > 0) {
      let matched = false;
      
      // Check for escaped characters first
      if (remaining.startsWith('\\')) {
        const nextChar = remaining[1];
        if (nextChar && /[\\`*_{}[\]<>#+-.!|]/.test(nextChar)) {
          children.push(new TextNode(nextChar));
          remaining = remaining.substring(2);
          matched = true;
          continue;
        }
      }
      
      // Link: [text](url)
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const linkChildren = this.parseInline(linkMatch[1]);
        children.push(new LinkNode(linkMatch[2], linkChildren));
        remaining = remaining.substring(linkMatch[0].length);
        matched = true;
        continue;
      }
      
      // Inline code: `code`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        children.push(new InlineCodeNode(codeMatch[1]));
        remaining = remaining.substring(codeMatch[0].length);
        matched = true;
        continue;
      }
      
      // Bold: **text** - check for ** first
      if (remaining.startsWith('**')) {
        let endPos = remaining.indexOf('**', 2);
        // If we found ** and it's followed by more asterisks, skip to the last pair
        // This handles cases like *** where we want to match the last ** (for nested italic)
        while (endPos > 2 && remaining[endPos + 2] === '*') {
          endPos++;
        }
        if (endPos > 2) {
          const content = remaining.substring(2, endPos);
          const boldChildren = this.parseInline(content);
          children.push(new BoldNode(boldChildren));
          remaining = remaining.substring(endPos + 2);
          matched = true;
          continue;
        }
      }
      
      // Italic: *text* - single asterisk
      if (remaining.startsWith('*')) {
        const endPos = remaining.indexOf('*', 1);
        if (endPos > 1) {
          const content = remaining.substring(1, endPos);
          const italicChildren = this.parseInline(content);
          children.push(new ItalicNode(italicChildren));
          remaining = remaining.substring(endPos + 1);
          matched = true;
          continue;
        }
      }
      
      // Strikethrough: ~~text~~
      const strikeMatch = remaining.match(/^~~([^~]+)~~/);
      if (strikeMatch) {
        const strikeChildren = this.parseInline(strikeMatch[1]);
        children.push(new StrikethroughNode(strikeChildren));
        remaining = remaining.substring(strikeMatch[0].length);
        matched = true;
        continue;
      }
      
      // Underline: ++text++
      const underlineMatch = remaining.match(/^\+\+([^+]+)\+\+/);
      if (underlineMatch) {
        const underlineChildren = this.parseInline(underlineMatch[1]);
        children.push(new UnderlineNode(underlineChildren));
        remaining = remaining.substring(underlineMatch[0].length);
        matched = true;
        continue;
      }
      
      // Highlight: ==text==
      const highlightMatch = remaining.match(/^==([^=]+)==/);
      if (highlightMatch) {
        const highlightChildren = this.parseInline(highlightMatch[1]);
        children.push(new HighlightNode(highlightChildren));
        remaining = remaining.substring(highlightMatch[0].length);
        matched = true;
        continue;
      }
      
      // Line break marker from paragraph parsing
      if (remaining.startsWith('<br>')) {
        children.push(new LineBreakNode());
        remaining = remaining.substring(4);
        matched = true;
        continue;
      }
      
      // No match - consume one character
      if (!matched) {
        // Find the next special character
        const nextSpecial = remaining.search(/[*_`\[~\\<]/);
        
        if (nextSpecial === -1) {
          // No more special characters
          children.push(new TextNode(remaining));
          break;
        } else if (nextSpecial > 0) {
          // Text before special character
          children.push(new TextNode(remaining.substring(0, nextSpecial)));
          remaining = remaining.substring(nextSpecial);
        } else {
          // Special character at start, but didn't match anything
          children.push(new TextNode(remaining[0]));
          remaining = remaining.substring(1);
        }
      }
    }
    
    return this.mergeTextNodes(children);
  }
  
  /**
   * Merge consecutive text nodes
   */
  mergeTextNodes(nodes) {
    const merged = [];
    
    for (const node of nodes) {
      if (node instanceof TextNode) {
        const lastNode = merged[merged.length - 1];
        if (lastNode instanceof TextNode) {
          lastNode.value += node.value;
        } else {
          merged.push(node);
        }
      } else {
        merged.push(node);
      }
    }
    
    return merged;
  }
}
