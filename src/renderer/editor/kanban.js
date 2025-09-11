// src/renderer/kanban.js

export class KanbanManager {
  constructor(editor) {
    this.editor = editor;
    this.editorEl = editor.editorEl;
    this.draggedCard = null;
  }

  init() {
    this.editorEl.addEventListener('click', (e) => {
      if (e.target.matches('.kanban-add-card')) {
        this.addCard(e.target);
      }
      if (e.target.matches('.kanban-add-column')) {
        this.addColumn(e.target);
      }
    });

    this.editorEl.addEventListener('dragstart', (e) => {
      const cardWrapper = e.target.closest('.kanban-card-wrapper');
      if (cardWrapper) {
        this.draggedCard = cardWrapper;
        setTimeout(() => cardWrapper.classList.add('dragging'), 0);
      }
    });

    this.editorEl.addEventListener('dragend', (e) => {
      if (this.draggedCard) {
        this.draggedCard.classList.remove('dragging');
        this.draggedCard = null;
      }
    });

    this.editorEl.addEventListener('dragover', (e) => {
      const column = e.target.closest('.kanban-cards');
      if (column && this.draggedCard) {
        e.preventDefault();
        column.classList.add('drag-over');
        const afterElement = this.getDragAfterElement(column, e.clientY);
        if (afterElement == null) {
          column.appendChild(this.draggedCard);
        } else {
          column.insertBefore(this.draggedCard, afterElement);
        }
      }
    });

    this.editorEl.addEventListener('dragleave', (e) => {
      const column = e.target.closest('.kanban-cards');
      if (column) {
        column.classList.remove('drag-over');
      }
    });

    this.editorEl.addEventListener('drop', (e) => {
      const column = e.target.closest('.kanban-cards');
      if (column) {
        column.classList.remove('drag-over');
        // --- START MODIFICATION ---
        this.editor.handleInput(); // <-- Add this line
        // --- END MODIFICATION ---
      }
    });
  }

  addCard(button) {
    const cardsContainer = button.previousElementSibling;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'kanban-card-wrapper';
    wrapper.setAttribute('draggable', 'true');

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.setAttribute('contenteditable', 'true');
    card.innerHTML = '<br>';

    wrapper.appendChild(card);
    cardsContainer.appendChild(wrapper);
    
    card.focus();
    this.editor.handleInput();
  }
  
  addColumn(button) {
    const newColumn = document.createElement('div');
    newColumn.className = 'kanban-column';

    newColumn.innerHTML = `
      <div class="kanban-column-title" contenteditable="true">New Column</div>
      <div class="kanban-cards"></div>
      <button class="kanban-add-card" contenteditable="false">+ Add Card</button>
    `;

    // Insert the new column before the button that was clicked
    button.parentNode.insertBefore(newColumn, button);

    // Focus the new column's title for immediate editing
    const titleEl = newColumn.querySelector('.kanban-column-title');
    if (titleEl) {
      titleEl.focus();
    }

    // Notify the editor of the change
    this.editor.handleInput();
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.kanban-card-wrapper:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  handleKeyDown(e) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const currentElement = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    const card = currentElement.closest('.kanban-card');
    const board = currentElement.closest('.kanban-board');

    if (!board) {
      return false; // Not inside a kanban board, do nothing.
    }

    // Handle Enter Key inside a card to create a new card
    if (e.key === 'Enter' && !e.shiftKey) {
      if (card) {
        e.preventDefault();
        const currentWrapper = card.closest('.kanban-card-wrapper');

        const newWrapper = document.createElement('div');
        newWrapper.className = 'kanban-card-wrapper';
        newWrapper.setAttribute('draggable', 'true');

        const newCard = document.createElement('div');
        newCard.className = 'kanban-card';
        newCard.setAttribute('contenteditable', 'true');
        newCard.innerHTML = '<br>';

        newWrapper.appendChild(newCard);
        
        currentWrapper.parentNode.insertBefore(newWrapper, currentWrapper.nextSibling);

        // Move cursor to the new card
        const newRange = document.createRange();
        newRange.setStart(newCard, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        return true; // Event handled
      }
    }

    // Handle Backspace Key on an empty card to delete it
    if (e.key === 'Backspace') {
      const cardWrapper = currentElement.closest('.kanban-card-wrapper');
      if (card && cardWrapper && card.textContent.trim() === '' && range.startOffset === 0) {
        e.preventDefault();
        const prevSiblingWrapper = cardWrapper.previousElementSibling;
        cardWrapper.remove();

        // Move cursor to the end of the previous card if it exists
        if (prevSiblingWrapper && prevSiblingWrapper.classList.contains('kanban-card-wrapper')) {
          const prevCardContent = prevSiblingWrapper.querySelector('.kanban-card');
          if (prevCardContent) {
            const newRange = document.createRange();
            newRange.selectNodeContents(prevCardContent);
            newRange.collapse(false); // false collapses to the end
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        }
        return true; // Event handled
      }
    }

    return false; // Event not handled by this function
  }
}