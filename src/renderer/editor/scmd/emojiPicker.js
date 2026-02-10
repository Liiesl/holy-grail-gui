// src/renderer/scmd/emojiPicker.js

export class EmojiPicker {
  constructor(editor) {
    this.editor = editor;
    this.container = null;
    this.emojis = [];
    this.filteredEmojis = []; // Used for search results grid
    this.emojisByCategory = {};
    this.categories = [
      "Smileys & Emotion", "People & Body", "Animals & Nature", 
      "Food & Drink", "Travel & Places", "Activities", "Objects", 
      "Symbols", "Flags"
    ];
    this.activeCategory = this.categories[0];
    this.activeIndex = 0; // Index for keyboard navigation in search grid
    this.triggerInfo = null;
    this.isLoading = true; // Loading state flag

    // Render UI shell immediately and load data in the background.
    this.render();
    this.addEventListeners();
    this.loadEmojis();
  }

  async loadEmojis() {
    try {
      const response = await fetch('./editor/scmd/emoji-data.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.emojis = await response.json();

      // Group emojis by category for grid view
      this.categories.forEach(cat => this.emojisByCategory[cat] = []);
      this.emojis.forEach(emoji => {
        if (this.emojisByCategory[emoji.category]) {
          this.emojisByCategory[emoji.category].push(emoji);
        }
      });

    } catch (error) {
      console.error("Failed to load emojis:", error);
      // Fallback with a single emoji to prevent total failure
      this.emojis = [{ "emoji": "😀", "name": "grinning face", "category": "Smileys & Emotion", "keywords": ["error"] }];
      this.emojisByCategory[this.categories[0]] = this.emojis;
    } finally {
      // Update state and refresh UI if it's visible
      this.isLoading = false;
      if (this.isVisible()) {
        this.update(this.triggerInfo?.filter || '');
      }
    }
  }

  render() {
    this.container = document.createElement('div');
    this.container.id = 'emoji-picker-menu';
    this.container.classList.add('hidden');
    // Render with a loading indicator initially.
    this.container.innerHTML = `
      <div class="emoji-categories"></div>
      <div class="emoji-content">
        <div class="emoji-loader">Loading emojis...</div>
      </div>
    `;
    this.editor.container.appendChild(this.container);
    this.renderCategories();
  }

  renderCategories() {
    const categoriesContainer = this.container.querySelector('.emoji-categories');
    if (!categoriesContainer) return;

    categoriesContainer.innerHTML = this.categories.map(cat => `
      <button 
        class="emoji-category-button ${cat === this.activeCategory ? 'active' : ''}" 
        data-category="${cat}"
        title="${cat}"
      >
        ${this.getCategoryIcon(cat)}
      </button>
    `).join('');
  }
  
  getCategoryIcon(category) {
    const icons = {
      "Smileys & Emotion": "😀",
      "People & Body": "🧑",
      "Animals & Nature": "🐾",
      "Food & Drink": "🍔",
      "Travel & Places": "✈️",
      "Activities": "⚽",
      "Objects": "💡",
      "Symbols": "💕",
      "Flags": "🏳️"
    };
    return icons[category] || '❔';
  }

  addEventListeners() {
    this.container.addEventListener('mousedown', e => {
      e.preventDefault();
      
      const categoryButton = e.target.closest('.emoji-category-button');
      if (categoryButton) {
        this.activeCategory = categoryButton.dataset.category;
        this.update(''); // Re-render with new category, no filter
        return;
      }
      
      const emojiItem = e.target.closest('.emoji-item');
      if (emojiItem) {
        const emojiChar = emojiItem.dataset.emojiChar;
        // Find in the full list as it's the source of truth
        const emoji = this.emojis.find(e => e.emoji === emojiChar);
        if (emoji) {
          this.execute(emoji);
        }
      }
    });
  }

  show(position, triggerInfo, editorRect) {
    this.triggerInfo = triggerInfo;
    this.container.classList.remove('hidden');
    this.update(triggerInfo.filter);
    
    // Get menu dimensions after rendering
    const menuHeight = this.container.offsetHeight || 300;
    const menuWidth = this.container.offsetWidth || 320;
    
    // Calculate vertical position - show above if not enough space below
    let top = position.top;
    const spaceBelow = editorRect.height - position.top;
    const spaceAbove = position.top - position.cursorHeight;
    
    if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
      // Not enough space below, but enough above - show above
      top = position.top - menuHeight - position.cursorHeight;
    }
    
    // Calculate horizontal position - keep within editor bounds on the right
    let left = position.left;
    const spaceRight = editorRect.width - position.left;
    
    if (spaceRight < menuWidth) {
      // Not enough space on the right, shift left
      left = editorRect.width - menuWidth - 10; // 10px padding from right edge
      if (left < 0) left = 0; // Don't go past left edge
    }
    
    this.container.style.top = `${top}px`;
    this.container.style.left = `${left}px`;
  }

  hide() {
    if (this.isVisible()) {
      this.container.classList.add('hidden');
      this.triggerInfo = null;
    }
  }

  isVisible() {
    return !this.container.classList.contains('hidden');
  }

  update(filterText) {
    const contentEl = this.container.querySelector('.emoji-content');
    
    // Handle loading state
    if (this.isLoading) {
      contentEl.innerHTML = `<div class="emoji-loader">Loading emojis...</div>`;
      this.renderCategories(); // Ensure categories are always visible
      return;
    }

    if (filterText) {
      // SEARCH MODE: Show filtered grid
      const lowerFilter = filterText.toLowerCase();
      this.filteredEmojis = this.emojis.filter(emoji =>
        emoji.name.toLowerCase().includes(lowerFilter) ||
        emoji.keywords.some(kw => kw.toLowerCase().includes(lowerFilter))
      );
      
      if (this.filteredEmojis.length === 0) {
        this.renderNoResults(contentEl);
      } else {
        this.activeIndex = 0;
        this.renderGrid(contentEl, this.filteredEmojis, true);
      }
    } else {
      // CATEGORY MODE: Show grid for active category
      this.filteredEmojis = []; // Clear search results to disable keyboard nav
      this.activeIndex = 0;
      this.renderCategories(); // Re-render to update active tab style
      const emojisForCategory = this.emojisByCategory[this.activeCategory] || [];
      this.renderGrid(contentEl, emojisForCategory, false);
    }
  }
  
  renderNoResults(container) {
    container.innerHTML = `<div class="emoji-no-results">No emojis found</div>`;
  }

  renderGrid(container, emojis, highlightActive = false) {
    container.innerHTML = `
      <div class="emoji-grid">
        ${emojis.map((emoji, index) => `
          <button 
            class="emoji-item ${highlightActive && index === this.activeIndex ? 'active' : ''}" 
            data-emoji-char="${emoji.emoji}"
            title="${emoji.name}"
          >
            <span class="emoji-char">${emoji.emoji}</span>
          </button>
        `).join('')}
      </div>
    `;

    if (highlightActive) {
      container.querySelector('.emoji-item.active')?.scrollIntoView({ block: 'nearest' });
    } else {
      container.scrollTop = 0; // Reset scroll on category change
    }
  }
  
  handleKeyDown(e) {
    // This will only work in search mode because filteredEmojis is empty in category mode
    if (!this.isVisible() || this.filteredEmojis.length === 0) return false;
    
    const contentEl = this.container.querySelector('.emoji-content');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % this.filteredEmojis.length;
      this.renderGrid(contentEl, this.filteredEmojis, true);
      return true;
    }
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex = (this.activeIndex - 1 + this.filteredEmojis.length) % this.filteredEmojis.length;
      this.renderGrid(contentEl, this.filteredEmojis, true);
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const emoji = this.filteredEmojis[this.activeIndex];
      if (emoji) {
        this.execute(emoji);
      }
      return true;
    }
    
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      return true;
    }
    
    return false;
  }

  execute(emoji) {
    const { range } = this.triggerInfo;
    
    range.deleteContents();
    const emojiNode = document.createTextNode(emoji.emoji);
    range.insertNode(emojiNode);
    
    const sel = window.getSelection();
    range.setStartAfter(emojiNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    
    this.hide();
    this.editor.editorEl.focus();
    this.editor.handleInput();
  }
}