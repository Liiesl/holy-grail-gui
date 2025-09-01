// src/renderer/titlebar.js

export class Titlebar {
  constructor(container) {
    this.container = container;
    this.render();
    // You can re-add event binding here for your new menu items
    this.bindMenuEvents(); 
  }

  render() {
    // Add the HTML structure for a menu
    this.container.innerHTML = `
      <div class="titlebar-menu">
        <!-- You could add a logo here -->
        <!-- <img src="path/to/icon.png" class="titlebar-icon" /> -->
        <div class="titlebar-menu-item">File</div>
        <div class="titlebar-menu-item">Edit</div>
        <div class="titlebar-menu-item">View</div>
        <div class="titlebar-menu-item">Help</div>
      </div>
      <div class="titlebar-drag-region"></div>
    `;
  }

  bindMenuEvents() {
    // Example: Add a click listener to the 'File' menu item
    this.container.querySelector('.titlebar-menu-item').addEventListener('click', () => {
      console.log('File menu clicked!');
      // In a real app, you would open a custom dropdown menu here
    });
  }
}