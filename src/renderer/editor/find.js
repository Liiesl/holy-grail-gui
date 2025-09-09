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
    this.replaceInput = editor.container.querySelector('#replace-input');
    this.replaceOneBtn = editor.container.querySelector('#replace-one');
    this.replaceAllBtn = editor.container.querySelector('#replace-all');

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

    this.replaceOneBtn.addEventListener('click', () => this.replace());
    this.replaceAllBtn.addEventListener('click', () => this.replaceAll());
    this.replaceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.replace();
        }
    });
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
        const pos = a.compareDocumentPosition(b);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
    });

    if (this.findMatches.length > 0) {
        this.currentFindIndex = this.findClosestMatchIndex();
        this.navigateToMatch(this.currentFindIndex);
    } else {
        this.findCounter.textContent = '0/0';
    }
  }

  isElementInViewport(el) {
    const editorRect = this.editorEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return (
        elRect.top >= editorRect.top &&
        elRect.bottom <= editorRect.bottom
    );
  }

  findClosestMatchIndex() {
    const editorRect = this.editorEl.getBoundingClientRect();
    
    let firstVisibleIndex = -1;
    let firstAfterIndex = -1;

    for (let i = 0; i < this.findMatches.length; i++) {
        const match = this.findMatches[i];
        const matchRect = match.getBoundingClientRect();
        
        if (matchRect.bottom > editorRect.top && matchRect.top < editorRect.bottom) {
             if (firstVisibleIndex === -1) firstVisibleIndex = i;
        }
        
        if (matchRect.top >= editorRect.bottom) {
            if (firstAfterIndex === -1) firstAfterIndex = i;
        }
    }
    
    if (firstVisibleIndex !== -1) return firstVisibleIndex;
    if (firstAfterIndex !== -1) return firstAfterIndex;
    return 0;
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
    
    if (!this.isElementInViewport(currentMatch)) {
        currentMatch.scrollIntoView({
            behavior: 'instant',
            block: 'center',
            inline: 'nearest'
        });
    }
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

  replace() {
    if (this.currentFindIndex === -1 || !this.findMatches[this.currentFindIndex]) return;
    
    const currentMatch = this.findMatches[this.currentFindIndex];
    const parent = currentMatch.parentNode;
    const replacementText = this.replaceInput.value;

    const range = document.createRange();
    range.setStartAfter(currentMatch);
    range.collapse(true);
    
    const newTextNode = document.createTextNode(replacementText);
    parent.replaceChild(newTextNode, currentMatch);
    parent.normalize();
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    this.executeFind();
    this.editor.handleInput();
  }

  replaceAll() {
    const searchTerm = this.findInput.value;
    const replaceText = this.replaceInput.value;
    const matchCount = this.findMatches.length;
    
    if (searchTerm.length < 1 || matchCount === 0) return;
    
    for (let i = matchCount - 1; i >= 0; i--) {
        const match = this.findMatches[i];
        if (match && match.parentNode) {
            const newTextNode = document.createTextNode(replaceText);
            match.parentNode.replaceChild(newTextNode, match);
        }
    }
    
    this.editorEl.normalize();
    
    this.findMatches = [];
    this.currentFindIndex = -1;
    this.findCounter.textContent = `Replaced ${matchCount} item(s).`;
    
    this.findInput.focus();
    this.editor.handleInput();
  }
}