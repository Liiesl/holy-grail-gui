/**
 * Manages the Version History view in the sidebar.
 */
export class HistoryView {
  constructor(projectManager, container) {
    this.projectManager = projectManager;
    this.container = container;
    this.listeners = {};
    this.render();
    this.initElements();
  }
  
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="view-header">
        <span id="history-view-title" class="view-header-title">Version History</span>
      </div>
      <ul id="history-list"></ul>
    `;
  }
  
  initElements() {
    this.historyList = this.container.querySelector('#history-list');
    this.titleEl = this.container.querySelector('#history-view-title');
  }

  async load(project, file) {
    if (!project || !file) {
      this.historyList.innerHTML = '<li>Select a file to see its history.</li>';
      this.titleEl.textContent = 'Version History';
      return;
    }
    this.titleEl.textContent = `History: ${file.replace('.md', '')}`;
    this.historyList.innerHTML = '<li>Loading...</li>';
    const history = await this.projectManager.getNoteHistory(project.path, file);

    if (history.length === 0) {
      this.historyList.innerHTML = '<li>No history found for this file.</li>';
      return;
    }

    this.historyList.innerHTML = '';
    history.forEach(version => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="commit-date">${new Date(version.timestamp).toLocaleString()}</span>
        <span class="commit-hash" title="Hash: ${version.hash}">${version.hash.substring(0, 7)}</span>
      `;
      li.addEventListener('click', () => {
        this.emit('versionSelected', { project, version });
        this.historyList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
        li.classList.add('active');
      });
      this.historyList.appendChild(li);
    });
  }
  
  clear() {
    this.historyList.innerHTML = '';
    this.titleEl.textContent = 'Version History';
    this.historyList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
  }
}