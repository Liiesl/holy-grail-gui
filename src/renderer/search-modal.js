// src/renderer/search-modal.js

/**
 * Search Modal Component
 * Manages the fuzzy search UI overlay.
 */
export class SearchModal {
  constructor(projectManager, container) {
    this.projectManager = projectManager;
    this.container = container;
    this.isVisible = false;
    this.listeners = {};
    this.debounceTimer = null;
    this.currentContext = {};

    this.render();
    this.inputEl = this.container.querySelector('.search-modal-input');
    this.resultsEl = this.container.querySelector('.search-modal-results');

    this.container.addEventListener('click', (e) => {
        if (e.target === this.container) this.hide(); // Close on overlay click
    });
    this.inputEl.addEventListener('input', this._handleInput.bind(this));
    this.inputEl.addEventListener('keydown', this._handleKeyDown.bind(this));
  }
  
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="search-modal-content">
        <input type="text" class="search-modal-input" placeholder="Search projects, pages, and content...">
        <ul class="search-modal-results"></ul>
      </div>
    `;
  }

  show(context = {}) {
    this.currentContext = context;
    this.isVisible = true;
    this.container.classList.add('visible');
    this.inputEl.value = '';

    let placeholder = "Search projects, pages, and content...";
    if (context.noteName) { // More specific context first
        placeholder = `Search in page "${context.noteName}"...`;
    } else if (context.projectName) {
        placeholder = `Search in project "${context.projectName}"...`;
    }
    this.inputEl.placeholder = placeholder;

    this.resultsEl.innerHTML = '<li>Start typing to search...</li>';
    setTimeout(() => this.inputEl.focus(), 50);
  }

  hide() {
    this.isVisible = false;
    this.container.classList.remove('visible');
    document.getElementById('app').classList.remove('modal-open');
  }

  _handleInput() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const query = this.inputEl.value.trim();
      if (query.length > 0) {
        const results = await this.projectManager.performSearch(query, this.currentContext);
        this._renderResults(results);
      } else {
        this.resultsEl.innerHTML = '<li>Start typing to search...</li>';
      }
    }, 150);
  }

  _handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = Array.from(this.resultsEl.querySelectorAll('li'));
      if (!items.length) return;
      
      let currentIndex = items.findIndex(item => item.classList.contains('selected'));
      if (currentIndex === -1) {
        currentIndex = (e.key === 'ArrowDown') ? -1 : 1;
      }
      
      items[currentIndex]?.classList.remove('selected');
      let nextIndex = (e.key === 'ArrowDown') ? currentIndex + 1 : currentIndex - 1;
      
      if (nextIndex >= items.length) nextIndex = 0;
      if (nextIndex < 0) nextIndex = items.length - 1;
      
      items[nextIndex].classList.add('selected');
      items[nextIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedItem = this.resultsEl.querySelector('li.selected');
      if (selectedItem) {
        selectedItem.click();
      }
    }
  }

  _renderResults(results) {
    if (results.length === 0) {
      this.resultsEl.innerHTML = '<li>No results found.</li>';
      return;
    }

    this.resultsEl.innerHTML = results.map(result => {
      const { type, text, matches, metadata } = result;
      
      let icon = '📄';
      let title = '';
      let context = `In project: ${metadata.projectName}`;

      switch(type) {
        case 'project':
          icon = '🗂️';
          title = this._highlightMatches(metadata.projectName, matches);
          context = 'Project';
          break;
        case 'page':
          icon = '📄';
          title = this._highlightMatches(metadata.noteName, matches);
          break;
        case 'content_line':
          icon = '✏️';
          title = this._highlightMatches(text, matches);
          context += ` / Page: ${metadata.noteName}`;
          break;
      }

      const li = document.createElement('li');
      li.innerHTML = `
        <span class="search-result-icon">${icon}</span>
        <div class="search-result-text">
            <span class="search-result-title">${title}</span>
            <span class="search-result-context">${context}</span>
        </div>`;
      li.addEventListener('click', () => this._emit('resultSelected', { type, metadata }));
      return li.outerHTML;
    }).join('');
  }

  _highlightMatches(text, matches) {
    let highlightedText = '';
    let lastIndex = 0;
    const matchSet = new Set(matches);

    for (let i = 0; i < text.length; i++) {
        if (matchSet.has(i)) {
            highlightedText += `<strong>${text[i]}</strong>`;
        } else {
            highlightedText += text[i];
        }
    }
    return highlightedText;
  }
}