// src/renderer/context-menu.js

export class ContextMenuService {
  constructor(container) {
    this.container = container;
    this.menuElement = null;
    this.boundHide = this.hide.bind(this);
    this.boundHandleEscKey = this.handleEscKey.bind(this); // Bind this once
    this.render();
    this.addEventListeners();
  }

  render() {
    this.menuElement = document.createElement('div');
    this.menuElement.className = 'context-menu';
    this.container.appendChild(this.menuElement);
  }

  addEventListeners() {
    // Stop clicks *inside* the menu from bubbling up to the document.
    // This ensures only clicks truly outside the menu will trigger the hide() method.
    this.menuElement.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  show(x, y, items) {
    // Hide any existing menu first to ensure listeners are cleaned up
    this.hide();

    this.menuElement.innerHTML = ''; // Clear previous items
    this.menuElement.style.left = `${x}px`;
    this.menuElement.style.top = `${y}px`;

    items.forEach(item => {
      if (item.type === 'separator') {
        const separator = document.createElement('div');
        separator.className = 'context-menu-separator';
        this.menuElement.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.disabled) {
          menuItem.classList.add('disabled');
        }
        menuItem.textContent = item.label;

        if (!item.disabled && item.callback) {
          // Add a one-time listener for the action
          menuItem.addEventListener('click', () => {
            item.callback();
            this.hide(); // Hide after the action is performed
          });
        }
        this.menuElement.appendChild(menuItem);
      }
    });

    this.menuElement.classList.add('visible');

    // Add listeners to close the menu on the next event loop tick
    setTimeout(() => {
        document.addEventListener('click', this.boundHide);
        document.addEventListener('keydown', this.boundHandleEscKey);
    }, 0);
  }

  hide() {
    if (this.menuElement) {
        this.menuElement.classList.remove('visible');
    }
    // IMPORTANT: Remove the exact same listener functions that were added
    document.removeEventListener('click', this.boundHide);
    document.removeEventListener('keydown', this.boundHandleEscKey);
  }
  
  handleEscKey(e) {
      if (e.key === 'Escape') {
          this.hide();
      }
  }
}