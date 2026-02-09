// src/renderer/editor/parser/htmlParser.js

import {
  DocumentNode, TextNode, LineBreakNode,
  ParagraphNode, EmptyParagraphNode, HeadingNode, BlockquoteNode, CodeBlockNode, HorizontalRuleNode,
  UnorderedListNode, OrderedListNode, ListItemNode,
  BoldNode, ItalicNode, StrikethroughNode, UnderlineNode, HighlightNode, InlineCodeNode, LinkNode, CheckboxNode,
  TableNode, TableRowNode, TableCellNode,
  AlertNode, KanbanNode, KanbanColumnNode, KanbanCardNode,
  AlertType
} from '../ast/index.js';

/**
 * HTML Parser - Converts HTML DOM to AST
 * Uses browser's DOMParser as requested, with graceful fallback
 */
export class HTMLParser {
  constructor() {
    // Check if DOMParser is available (browser environment)
    if (typeof DOMParser !== 'undefined') {
      this.parser = new DOMParser();
      this.hasDOMParser = true;
    } else {
      console.warn('DOMParser not available - HTML parsing will not work in this environment');
      this.hasDOMParser = false;
    }
  }
  
  /**
   * Parse HTML string to AST
   */
  parse(html) {
    try {
      if (!this.hasDOMParser) {
        console.warn('HTML parsing requires DOMParser which is not available');
        return new DocumentNode([]);
      }
      
      const doc = this.parser.parseFromString(html, 'text/html');
      const body = doc.body;
      
      const children = this.parseChildren(body);
      return new DocumentNode(children);
    } catch (error) {
      console.warn('HTML parsing error:', error);
      // Return empty document on error
      return new DocumentNode([]);
    }
  }
  
  /**
   * Parse child nodes of an element
   */
  parseChildren(element) {
    const children = [];
    
    for (const child of element.childNodes) {
      const node = this.parseNode(child);
      if (node) {
        if (Array.isArray(node)) {
          children.push(...node);
        } else {
          children.push(node);
        }
      }
    }
    
    return children;
  }
  
  /**
   * Parse a single DOM node to AST
   */
  parseNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return this.parseTextNode(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      return this.parseElement(node);
    }
    return null;
  }
  
  /**
   * Parse text node
   */
  parseTextNode(node) {
    const text = node.textContent;
    if (!text || text === '\n') return null;
    return new TextNode(text);
  }
  
  /**
   * Parse element node
   */
  parseElement(element) {
    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      // Block elements
      case 'p':
        return this.parseParagraph(element);
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return this.parseHeading(element);
      case 'blockquote':
        return this.parseBlockquote(element);
      case 'pre':
        return this.parsePreformatted(element);
      case 'code':
        return this.parseCode(element);
      case 'hr':
        return new HorizontalRuleNode();
      case 'ul':
        return this.parseUnorderedList(element);
      case 'ol':
        return this.parseOrderedList(element);
      case 'li':
        return this.parseListItem(element);
      case 'table':
        return this.parseTable(element);
      case 'thead':
      case 'tbody':
      case 'tr':
      case 'td':
      case 'th':
        // These are handled by parseTable
        return this.parseChildren(element);
      case 'div':
        return this.parseDiv(element);
      case 'br':
        return new LineBreakNode();
        
      // Inline elements
      case 'strong':
      case 'b':
        return new BoldNode(this.parseChildren(element));
      case 'em':
      case 'i':
        return new ItalicNode(this.parseChildren(element));
      case 's':
      case 'del':
        return new StrikethroughNode(this.parseChildren(element));
      case 'u':
        return new UnderlineNode(this.parseChildren(element));
      case 'mark':
        return new HighlightNode(this.parseChildren(element));
      case 'a':
        return this.parseLink(element);
      case 'input':
        return this.parseInput(element);
      case 'button':
      case 'comment':
        // Skip these elements
        return null;
      default:
        // Unknown element - parse children
        console.warn(`Unknown HTML element: ${tagName}, parsing children only`);
        return this.parseChildren(element);
    }
  }
  
  /**
   * Parse paragraph
   */
  parseParagraph(element) {
    // Check for empty paragraph (editor artifact)
    if (element.innerHTML === '<br>' || element.innerHTML === '') {
      return new EmptyParagraphNode(); // Represents intentional blank line
    }
    
    const children = this.parseChildren(element);
    
    // If paragraph only contains a <br>, it's an empty paragraph
    if (children.length === 1 && children[0] instanceof LineBreakNode) {
      return new EmptyParagraphNode();
    }
    
    return new ParagraphNode(children);
  }
  
  /**
   * Parse heading
   */
  parseHeading(element) {
    const level = parseInt(element.tagName[1]);
    const children = this.parseChildren(element);
    return new HeadingNode(level, children);
  }
  
  /**
   * Parse blockquote
   */
  parseBlockquote(element) {
    const children = this.parseChildren(element);
    return new BlockquoteNode(children);
  }
  
  /**
   * Parse preformatted/code block
   */
  parsePreformatted(element) {
    const codeElement = element.querySelector('code');

    if (codeElement) {
      const language = this.extractLanguage(codeElement);
      // Get text content and strip HTML-like tags (e.g., <const> -> const)
      let content = this.getTextContent(codeElement);
      content = content.replace(/<([^>]+)>/g, '$1');
      return new CodeBlockNode(language, content);
    }

    // Plain preformatted text
    let content = this.getTextContent(element);
    content = content.replace(/<([^>]+)>/g, '$1');
    return new CodeBlockNode('', content);
  }

  /**
   * Decode HTML entities to their character equivalents
   */
  decodeHtmlEntities(text) {
    if (!text) return '';
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
  }
  
  /**
   * Parse inline code
   */
  parseCode(element) {
    // If it's inside a pre, it's already handled
    if (element.closest('pre')) {
      return null;
    }
    return new InlineCodeNode(this.getTextContent(element));
  }
  
  /**
   * Extract language from code element class
   */
  extractLanguage(codeElement) {
    const className = codeElement.className || '';
    const match = className.match(/language-(\w+)/);
    return match ? match[1] : '';
  }
  
  /**
   * Parse unordered list
   */
  parseUnorderedList(element) {
    const items = this.parseListItems(element);
    return new UnorderedListNode(items);
  }
  
  /**
   * Parse ordered list
   */
  parseOrderedList(element) {
    const items = this.parseListItems(element);
    return new OrderedListNode(items);
  }
  
  /**
   * Parse list items from a list element
   * Handles nested lists that appear as siblings to li elements (browser contenteditable quirk)
   */
  parseListItems(listElement) {
    const items = [];
    let lastItem = null;
    
    for (const child of listElement.children) {
      const tagName = child.tagName.toLowerCase();
      
      if (tagName === 'li') {
        const item = this.parseListItem(child);
        if (item) {
          items.push(item);
          lastItem = item;
        }
      } else if ((tagName === 'ul' || tagName === 'ol') && lastItem) {
        // Nested list appearing as sibling to li - attach to previous item
        const nestedList = tagName === 'ul' 
          ? this.parseUnorderedList(child)
          : this.parseOrderedList(child);
        if (nestedList) {
          lastItem.children.push(nestedList);
        }
      }
    }
    return items;
  }
  
  /**
   * Parse list item
   */
  parseListItem(element) {
    // Check for checkbox at the start
    const checkbox = element.querySelector('input[type="checkbox"]');
    let checked = null;
    
    if (checkbox) {
      checked = checkbox.hasAttribute('checked');
      // Remove checkbox from DOM for processing content
      checkbox.remove();
    }
    
    const children = this.parseChildren(element);
    
    // Wrap bare text in paragraph if needed
    if (children.length > 0) {
      return new ListItemNode(children, checked);
    }
    
    return new ListItemNode([], checked);
  }
  
  /**
   * Parse link
   */
  parseLink(element) {
    const href = element.getAttribute('href') || '';
    const title = element.getAttribute('title') || '';
    const children = this.parseChildren(element);
    return new LinkNode(href, children, title);
  }
  
  /**
   * Parse input element (checkboxes)
   */
  parseInput(element) {
    if (element.getAttribute('type') === 'checkbox') {
      const checked = element.hasAttribute('checked');
      return new CheckboxNode(checked);
    }
    return null;
  }
  
  /**
   * Parse table
   */
  parseTable(element) {
    const headerRows = [];
    const bodyRows = [];
    const alignments = [];
    const widths = [];
    let globalWidth = null;
    
    // Extract table styles
    const style = element.getAttribute('style') || '';
    const widthMatch = style.match(/width:\s*([^;]+)/);
    if (widthMatch) {
      globalWidth = widthMatch[1].trim();
    }
    
    // Parse thead
    const thead = element.querySelector('thead');
    if (thead) {
      const headerRow = thead.querySelector('tr');
      if (headerRow) {
        const cells = [];
        let cellIndex = 0;
        for (const th of headerRow.querySelectorAll('th')) {
          const cellStyle = th.getAttribute('style') || '';
          const align = this.extractAlign(cellStyle);
          const width = this.extractWidth(cellStyle);

          alignments[cellIndex] = align;
          widths[cellIndex] = width;

          cells.push(new TableCellNode(this.parseChildren(th), { align, width }));
          cellIndex++;
        }
        headerRows.push(new TableRowNode(cells, true));
      }
    }
    
    // Parse tbody
    const tbody = element.querySelector('tbody');
    if (tbody) {
      for (const tr of tbody.querySelectorAll('tr')) {
        const cells = [];
        let cellIndex = 0;
        for (const td of tr.querySelectorAll('td')) {
          const cellStyle = td.getAttribute('style') || '';
          const align = this.extractAlign(cellStyle) || alignments[cellIndex] || null;
          cells.push(new TableCellNode(this.parseChildren(td), { align }));
          cellIndex++;
        }
        bodyRows.push(new TableRowNode(cells, false));
      }
    }
    
    return new TableNode(headerRows, bodyRows, {
      alignments,
      widths,
      globalWidth
    });
  }
  
  /**
   * Extract text alignment from style
   */
  extractAlign(style) {
    const match = style.match(/text-align:\s*(left|center|right)/);
    return match ? match[1] : null;
  }
  
  /**
   * Extract width from style
   */
  extractWidth(style) {
    const match = style.match(/width:\s*([^;]+)/);
    return match ? match[1].trim() : null;
  }
  
  /**
   * Parse div (widgets, alerts, etc.)
   */
  parseDiv(element) {
    const className = element.className || '';
    
    // Alert widget
    const alertMatch = className.match(/alert-(info|warning|danger)/);
    if (alertMatch) {
      const type = alertMatch[1];
      const content = this.getTextContent(element);
      return new AlertNode(type, content);
    }
    
    // Kanban board
    if (className.includes('kanban-board')) {
      return this.parseKanbanBoard(element);
    }
    
    // Kanban column
    if (className.includes('kanban-column')) {
      return this.parseKanbanColumn(element);
    }
    
    // Generic div - parse children
    return this.parseChildren(element);
  }
  
  /**
   * Parse kanban board
   */
  parseKanbanBoard(element) {
    const columns = [];
    
    for (const child of element.children) {
      if (child.className && child.className.includes('kanban-column')) {
        const column = this.parseKanbanColumn(child);
        if (column) columns.push(column);
      }
    }
    
    return new KanbanNode(columns);
  }
  
  /**
   * Parse kanban column
   */
  parseKanbanColumn(element) {
    const titleElement = element.querySelector('.kanban-column-title');
    const title = titleElement ? this.getTextContent(titleElement) : 'Untitled';
    
    const cards = [];
    const cardsContainer = element.querySelector('.kanban-cards');
    
    if (cardsContainer) {
      for (const card of cardsContainer.querySelectorAll('.kanban-card')) {
        const cardChildren = this.parseChildren(card);
        cards.push(new KanbanCardNode(cardChildren));
      }
    }
    
    return new KanbanColumnNode(title, cards);
  }
  
  /**
   * Get text content without HTML tags
   */
  getTextContent(element) {
    return element.textContent || '';
  }
}
