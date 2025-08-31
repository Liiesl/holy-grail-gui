// src/renderer/titlebar.js

export class Titlebar {
  constructor(container) {
    this.container = container;
    this.render();
    
    // Get references to the elements we need to manipulate
    this.maximizeBtn = document.getElementById('maximize-btn');
    this.maximizeIcon = this.maximizeBtn.querySelector('i');

    this.bindEvents();
  }

  render() {
    // Replaced text characters with Font Awesome <i> tags
    this.container.innerHTML = `
      <div class="titlebar-drag-region"></div>
      <div class="window-controls">
        <button id="minimize-btn" class="window-control-btn" title="Minimize"><i class="fa-solid fa-minus"></i></button>
        <button id="maximize-btn" class="window-control-btn" title="Maximize"><i class="fa-regular fa-square"></i></button>
        <button id="close-btn" class="window-control-btn window-control-close-btn" title="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `;
  }

  bindEvents() {
    document.getElementById('minimize-btn').addEventListener('click', () => {
      window.api.minimizeWindow();
    });

    // Use the stored reference for the maximize button
    this.maximizeBtn.addEventListener('click', () => {
      window.api.maximizeWindow();
    });

    document.getElementById('close-btn').addEventListener('click', () => {
      window.api.closeWindow();
    });

    // Listen for window state changes from the main process
    window.api.onWindowMaximizedStateChanged((isMaximized) => {
      this.updateMaximizeIcon(isMaximized);
    });
  }

  // New method to toggle the maximize/restore icon and tooltip
  updateMaximizeIcon(isMaximized) {
    if (isMaximized) {
      this.maximizeIcon.classList.remove('fa-square');
      this.maximizeIcon.classList.add('fa-window-restore');
      this.maximizeBtn.setAttribute('title', 'Restore Down');
    } else {
      this.maximizeIcon.classList.remove('fa-window-restore');
      this.maximizeIcon.classList.add('fa-square');
      this.maximizeBtn.setAttribute('title', 'Maximize');
    }
  }
}