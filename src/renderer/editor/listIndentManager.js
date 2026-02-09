// src/renderer/editor/listIndentManager.js

/**
 * ListIndentManager - Handles list indentation and unindentation
 * Supports Tab/Ctrl+] for indent and Ctrl+[/Shift+Tab for unindent
 * Ordered lists follow pattern: 1. → a. → i. → a)
 */
export class ListIndentManager {
  constructor(editor) {
    this.editor = editor;
  }

  /**
   * Check if the current selection is inside a list
   */
  isInList() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const node = selection.anchorNode;
    if (!node) return false;
    
    const listItem = this.findListItem(node);
    return !!listItem;
  }

  /**
   * Find the closest list item element containing the given node
   */
  findListItem(node) {
    let current = node;
    while (current && current !== this.editor.editorEl) {
      if (current.nodeName === 'LI') {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Find the parent list element of a list item
   */
  findParentList(listItem) {
    let current = listItem.parentElement;
    while (current && current !== this.editor.editorEl) {
      if (current.nodeName === 'UL' || current.nodeName === 'OL') {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  /**
   * Get the nesting level of a list item (0 = top level)
   */
  getListItemLevel(listItem) {
    let level = 0;
    let current = listItem;
    
    while (current && current !== this.editor.editorEl) {
      if (current.nodeName === 'UL' || current.nodeName === 'OL') {
        level++;
      }
      current = current.parentElement;
    }
    
    return level - 1; // Subtract 1 because we count the list containing the item
  }

  /**
   * Get the ordered list type based on nesting level
   * Level 0: 1, 2, 3...
   * Level 1: a, b, c...
   * Level 2: i, ii, iii...
   * Level 3: a), b), c)...
   */
  getOrderedListType(level) {
    const types = ['1', 'a', 'i'];
    return types[level % 3] || '1';
  }

  /**
   * Indent the current list item (make it a child of the previous item)
   */
  indent() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const listItem = this.findListItem(selection.anchorNode);
    if (!listItem) return false;

    // Find previous sibling to nest under
    const previousItem = listItem.previousElementSibling;
    if (!previousItem) return false; // Can't indent first item

    // Get or create nested list in previous item
    let nestedList = previousItem.querySelector(':scope > ul, :scope > ol');
    
    if (!nestedList) {
      // Create new nested list
      const parentList = this.findParentList(listItem);
      const isOrdered = parentList && parentList.nodeName === 'OL';
      nestedList = document.createElement(isOrdered ? 'ol' : 'ul');
      
      // Set appropriate type for ordered lists
      if (isOrdered) {
        // Calculate new level after indenting
        const currentLevel = this.getListItemLevel(listItem);
        const newLevel = currentLevel + 1;
        const type = this.getOrderedListType(newLevel);
        nestedList.setAttribute('type', type);
        
        // For level 3 (a) format), add a data attribute for CSS styling
        if (newLevel === 3) {
          nestedList.setAttribute('data-list-level', '3');
        }
      }
      
      previousItem.appendChild(nestedList);
    }

    // Move current item to nested list
    nestedList.appendChild(listItem);

    // Restore cursor position
    this.restoreCursor(listItem);
    
    this.editor.handleInput();
    return true;
  }

  /**
   * Unindent the current list item (move it to parent level)
   */
  unindent() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const listItem = this.findListItem(selection.anchorNode);
    if (!listItem) return false;

    // Find the immediate parent list
    const parentList = listItem.parentElement;
    if (!parentList || (parentList.nodeName !== 'UL' && parentList.nodeName !== 'OL')) {
      return false;
    }

    // Find the grandparent list item (if nested)
    const grandparentItem = parentList.closest('li');
    if (!grandparentItem) {
      // Top level item - can't unindent further
      return false;
    }

    // Find the great-grandparent list (to check if ordered)
    const greatGrandparentList = grandparentItem.parentElement;
    const isOrdered = greatGrandparentList && greatGrandparentList.nodeName === 'OL';

    // Move item after the grandparent item
    grandparentItem.after(listItem);

    // Check if there are remaining items in the old parent list
    const remainingItems = Array.from(parentList.children);
    
    // If parent list is now empty, remove it
    if (remainingItems.length === 0) {
      parentList.remove();
    } else if (isOrdered) {
      // Update the type of the remaining nested list based on its new level
      const nestedLevel = this.getListItemLevel(remainingItems[0]);
      parentList.setAttribute('type', this.getOrderedListType(nestedLevel));
      
      // Remove old data-list-level attribute and add new if needed
      parentList.removeAttribute('data-list-level');
      if (nestedLevel === 3) {
        parentList.setAttribute('data-list-level', '3');
      }
    }

    // Restore cursor position
    this.restoreCursor(listItem);
    
    this.editor.handleInput();
    return true;
  }

  /**
   * Restore cursor to the given list item
   */
  restoreCursor(listItem) {
    const selection = window.getSelection();
    const range = document.createRange();
    
    // Try to place cursor at the start of the list item's text content
    let textNode = null;
    
    // Find first text node in the list item
    const walker = document.createTreeWalker(
      listItem,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim().length > 0) {
        textNode = walker.currentNode;
        break;
      }
    }

    if (textNode) {
      range.setStart(textNode, 0);
      range.collapse(true);
    } else {
      range.selectNodeContents(listItem);
      range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  /**
   * Handle keydown events for list indentation
   * Returns true if the event was handled
   */
  handleKeyDown(e) {
    // Check if we're in a list
    if (!this.isInList()) return false;

    // Indent: Tab or Ctrl+]
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      return this.indent();
    }

    // Unindent: Shift+Tab or Ctrl+[
    if ((e.key === 'Tab' && e.shiftKey) || (e.key === '[' && e.ctrlKey)) {
      e.preventDefault();
      return this.unindent();
    }

    // Ctrl+] for indent
    if (e.key === ']' && e.ctrlKey) {
      e.preventDefault();
      return this.indent();
    }

    return false;
  }
}
