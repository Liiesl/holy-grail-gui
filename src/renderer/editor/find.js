// src/renderer/find.js

export class FindManager {
  constructor(editor) {
    this.editor = editor;
    this.editorEl = editor.editorEl;

    // Get elements from the editor's container
    this.findBar = editor.container.querySelector('#find-bar');
    this.findInput = editor.container.querySelector('#find-input');
    this.findCounter = editor.container.querySelector('#find-counter');
    this.findPrev = editor.container.querySelector('#find-prev');
    this.findNext = editor.container.querySelector('#find-next');
    this.findClose = editor.container.querySelector('#find-close');

    this.findMatches = [];
    this.currentFindIndex = -1;

    this.addEventListeners();
  }

  addEventListeners() {
    this.findInput.addEventListener('input', () => this.executeFind());
    this.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.findPrevMatch();
        } else {
          this.findNextMatch();
        }
      }
      if (e.key === 'Escape') {
        this.hideFindBar();
      }
    });
    this.findNext.addEventListener('click', () => this.findNextMatch());
    this.findPrev.addEventListener('click', () => this.findPrevMatch());
    this.findClose.addEventListener('click', () => this.hideFindBar());
  }
  
  showFindBar() {
    this.findBar.classList.remove('hidden');
    const selection = window.getSelection().toString();
    if (selection) {
        this.findInput.value = selection;
    }
    this.findInput.focus();
    this.findInput.select();
    this.executeFind();
  }

  hideFindBar() {
    this.findBar.classList.add('hidden');
    this.clearFindHighlights();
    this.editorEl.focus();
  }

  clearFindHighlights() {
    const marks = Array.from(this.editorEl.querySelectorAll('mark.find-match'));
    marks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize(); // Merges adjacent text nodes
        }
    });
    this.findMatches = [];
    this.currentFindIndex = -1;
    this.findCounter.textContent = '';
  }
  
  escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  executeFind() {
    this.clearFindHighlights();
    const searchTerm = this.findInput.value;
    if (searchTerm.length < 1) return;

    const regex = new RegExp(this.escapeRegex(searchTerm), 'gi');
    const walker = document.createTreeWalker(this.editorEl, NodeFilter.SHOW_TEXT);
    
    const nodesToSearch = [];
    let currentNode;
    while(currentNode = walker.nextNode()) {
        nodesToSearch.push(currentNode);
    }
    
    for (const node of nodesToSearch) {
        if (!node.parentNode || node.parentNode.nodeName === 'MARK' || !this.editorEl.contains(node)) continue;

        const matches = [...node.nodeValue.matchAll(regex)];
        if (matches.length === 0) continue;

        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const matchIndex = match.index;
            const matchText = match[0];
            
            node.splitText(matchIndex + matchText.length);
            let matchNode = node.splitText(matchIndex);
            
            const mark = document.createElement('mark');
            mark.className = 'find-match';
            mark.textContent = matchText;

            matchNode.parentNode.replaceChild(mark, matchNode);
            this.findMatches.push(mark);
        }
    }

    this.findMatches.sort((a, b) => {
        // compareDocumentPosition returns a bitmask.
        // We check if 'a' comes before 'b' in the document tree.
        const pos = a.compareDocumentPosition(b);
        
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
            // 'a' precedes 'b', so 'a' should come first.
            return 1;
        } else if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
            // 'a' follows 'b', so 'a' should come second.
            return -1;
        } else {
            // They are the same node.
            return 0;
        }
    });

    if (this.findMatches.length > 0) {
        this.currentFindIndex = 0;
        this.navigateToMatch(this.currentFindIndex);
    } else {
        this.findCounter.textContent = '0/0';
    }
  }

  navigateToMatch(index) {
    if (this.findMatches.length === 0 || index < 0 || index >= this.findMatches.length) return;

    if (this.currentFindIndex !== -1 && this.findMatches[this.currentFindIndex]) {
        this.findMatches[this.currentFindIndex].classList.remove('current');
    }

    this.currentFindIndex = index;
    const currentMatch = this.findMatches[this.currentFindIndex];
    currentMatch.classList.add('current');
    this.findCounter.textContent = `${this.currentFindIndex + 1}/${this.findMatches.length}`;
    
    currentMatch.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
    });
  }

  findNextMatch() {
    if (this.findMatches.length === 0) return;
    const nextIndex = (this.currentFindIndex + 1) % this.findMatches.length;
    this.navigateToMatch(nextIndex);
  }

  findPrevMatch() {
    if (this.findMatches.length === 0) return;
    const prevIndex = (this.currentFindIndex - 1 + this.findMatches.length) % this.findMatches.length;
    this.navigateToMatch(prevIndex);
  }
}