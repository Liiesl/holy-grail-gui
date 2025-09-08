// src/renderer/titlebar.js

export class Titlebar {
  constructor(container) {
    this.container = container;
    this.isContextMenuVisible = false;
    this.projectRightClickMenu = null; // For right-click menu
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="titlebar-controls-left">
        <div class="titlebar-mode-switcher">
          <div id="project-mode-wrapper">
            <button id="project-mode-btn" class="mode-btn active" data-mode="project" title="Project Explorer">
              <i class="fas fa-folder"></i>
              <i class="fas fa-sort switcher-icon" style="font-size: 8px; margin-bottom: 1px;"></i>
              <span id="current-project-name">No Project</span>
            </button>
          </div>
          <button class="mode-btn icon-only" data-mode="pageHistory" title="Page History" disabled><i class="fas fa-history"></i></button>
          <button class="mode-btn icon-only" data-mode="projectHistory" title="Project History (coming soon)" disabled><i class="fas fa-code-branch"></i></button>
        </div>
      </div>

      <!-- Sidebar Toggle is now here, right after left controls -->
      <div class="titlebar-controls-middle">
        <button id="sidebar-toggle-btn" class="titlebar-action-btn" title="Toggle Sidebar"><i class="fas fa-bars"></i></button>
      </div>

      <div class="titlebar-drag-region"></div>

      <!-- Chat Toggle is now inside the right controls wrapper for padding -->
      <div class="titlebar-controls-right">
        <button id="chat-toggle-btn" class="titlebar-action-btn" title="Toggle AI Chat">💬</button>
      </div>
      
      <ul id="project-context-menu"></ul>
    `;
    this.modeButtons = this.container.querySelectorAll('.titlebar-mode-switcher .mode-btn');
    this.projectModeBtn = this.container.querySelector('#project-mode-btn');
    this.currentProjectNameEl = this.container.querySelector('#current-project-name');
    this.projectContextMenu = this.container.querySelector('#project-context-menu');
  }

  // ... (the rest of the file remains the same)
  bindEvents() {
    // Mode switcher
    this.modeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const mode = button.dataset.mode;
        const isProjectButton = mode === 'project';

        if (isProjectButton) {
          e.stopPropagation(); // Prevent document click listener from firing immediately
        }

        if (button.classList.contains('active')) {
          // If the active button is clicked, only the project button has a special action
          if (isProjectButton) {
            this.toggleContextMenu();
          }
          return; // For other buttons, do nothing if they are already active
        }
        
        if (button.disabled) return;
        
        // If a non-active button was clicked, activate it
        this.setActiveMode(mode);
        this.hideContextMenu(); // Always hide menu when switching modes

        this.container.dispatchEvent(new CustomEvent('modeChange', {
          detail: { mode: mode },
          bubbles: true
        }));
      });
    });

    // Chat toggle
    this.container.querySelector('#chat-toggle-btn').addEventListener('click', () => {
      this.container.dispatchEvent(new CustomEvent('chatToggle', { bubbles: true }));
    });

    // Sidebar toggle
    this.container.querySelector('#sidebar-toggle-btn').addEventListener('click', () => {
      this.container.dispatchEvent(new CustomEvent('sidebarToggle', { bubbles: true }));
    });

    // Hide context menu when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (this.isContextMenuVisible && !this.projectModeBtn.contains(e.target)) {
        this.hideContextMenu();
      }
      // Hide right-click menu on any left click
      this.hideProjectRightClickMenu();
     });

    // Hide right-click menu if another context menu is opened
    document.addEventListener('contextmenu', (e) => {
        if (this.projectRightClickMenu && !this.projectRightClickMenu.contains(e.target)) {
            this.hideProjectRightClickMenu();
        }
    }, true); // Use capture phase to catch it early
  }
  
  toggleContextMenu() {
    this.isContextMenuVisible = !this.isContextMenuVisible;

    if (this.isContextMenuVisible) {
      // --- NEW POSITIONING LOGIC ---
      // When showing the menu, calculate its position based on the button
      const buttonRect = this.projectModeBtn.getBoundingClientRect();
      this.projectContextMenu.style.left = `${buttonRect.left}px`;
      this.projectContextMenu.style.top = `${buttonRect.bottom + 4}px`; // 4px margin below button
      this.projectContextMenu.style.minWidth = `${buttonRect.width}px`;
    }

    this.projectContextMenu.classList.toggle('visible', this.isContextMenuVisible);
  }

  hideContextMenu() {
    if (!this.isContextMenuVisible) return;
    this.isContextMenuVisible = false;
    this.projectContextMenu.classList.remove('visible');
  }

  updateProjectList(projects, currentProjectPath) {
    this.projectContextMenu.innerHTML = '';
    
    if (projects && projects.length > 0) {
        projects.forEach(p => {
            const li = document.createElement('li');
            li.className = 'menu-item';
            li.dataset.path = p.path;
            const isCurrent = p.path === currentProjectPath;
            
            li.innerHTML = `
                <span>${p.name}</span>
                ${isCurrent ? '<span class="checkmark">✓</span>' : ''}
            `;
            
            li.addEventListener('click', () => {
                if (isCurrent) { // Don't fire event if clicking the current project
                    this.hideContextMenu();
                    return;
                }
                this.container.dispatchEvent(new CustomEvent('projectChange', {
                    detail: { path: p.path },
                    bubbles: true
                }));
                this.hideContextMenu();
            });

            // Add right-click listener
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showProjectRightClickMenu(e, p);
            });
            this.projectContextMenu.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.className = 'menu-item';
        li.style.fontStyle = 'italic';
        li.textContent = 'No projects found.';
        this.projectContextMenu.appendChild(li);
    }

    const separator = document.createElement('li');
    separator.className = 'menu-separator';
    this.projectContextMenu.appendChild(separator);

    const addProjectLi = document.createElement('li');
    addProjectLi.className = 'menu-item';
    addProjectLi.textContent = '+ Add New Project...';
    addProjectLi.dataset.action = 'add_new_project';
    addProjectLi.addEventListener('click', () => {
        this.container.dispatchEvent(new CustomEvent('projectAction', {
            detail: { action: 'add_new_project' },
            bubbles: true
        }));
        this.hideContextMenu();
    });
    this.projectContextMenu.appendChild(addProjectLi);
  }
  
  setCurrentProjectName(name) {
      this.currentProjectNameEl.textContent = name || 'No Project';
  }

  setActiveMode(mode) {
    this.modeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  setHistoryModeAvailable(isAvailable) {
      const pageHistoryBtn = this.container.querySelector('[data-mode="pageHistory"]');
      if (pageHistoryBtn) {
          pageHistoryBtn.disabled = !isAvailable;
      }
  }

  // Methods for right-click context menu
  showProjectRightClickMenu(event, project) {
    this.hideProjectRightClickMenu(); // Close any existing menu

    this.projectRightClickMenu = document.createElement('ul');
    this.projectRightClickMenu.className = 'project-right-click-menu';
    this.projectRightClickMenu.innerHTML = `
        <li class="menu-item" data-action="untrack_project" data-path="${project.path}">Untrack Project</li>
        <li class="menu-item menu-item-danger" data-action="delete_project" data-path="${project.path}">Delete Project...</li>
    `;
    
    document.body.appendChild(this.projectRightClickMenu);

    this.projectRightClickMenu.style.top = `${event.clientY}px`;
    this.projectRightClickMenu.style.left = `${event.clientX}px`;

    this.projectRightClickMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.menu-item');
        if (item) {
            const action = item.dataset.action;
            const path = item.dataset.path;
            
            this.container.dispatchEvent(new CustomEvent('projectAction', {
                detail: { action, path },
                bubbles: true
            }));
        }
        this.hideProjectRightClickMenu(); // Hide after action
    });
  }

  hideProjectRightClickMenu() {
    if (this.projectRightClickMenu) {
        this.projectRightClickMenu.remove();
        this.projectRightClickMenu = null;
    }
  }
}