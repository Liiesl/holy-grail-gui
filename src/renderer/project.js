// src/renderer/project.js

/**
 * Manages all data interactions for projects and notes
 * by communicating with the main process.
 */
export class ProjectManager {
  async getProjects() {
    return window.api.getProjects();
  }

  async addProject() {
    return window.api.addProject();
  }

  async untrackProject(projectPath) {
    return window.api.untrackProject(projectPath);
  }

  async deleteProject(projectPath) {
    return window.api.deleteProject(projectPath);
   }

  async getNotes(projectPath) {
    return window.api.getNotes(projectPath);
  }

  async getNoteContent(projectPath, filename) {
    return window.api.getNoteContent(projectPath, filename);
  }

  async saveNote({ projectPath, filename, content }) {
    return window.api.saveNote({ projectPath, filename, content });
  }

  async deleteNote(projectPath, filename) {
    return window.api.deleteNote(projectPath, filename);
  }
  
  async createNote(projectPath, name, parentId) { // Add parentId parameter
    return window.api.createNote({ projectPath, name, parentId }); // Pass as an object
  }

  async renameNote(projectPath, id, newName) {
    return window.api.renameNote(projectPath, id, newName);
  }

  // Version History Methods
  async getNoteHistory(projectPath, filename) {
    return window.api.getNoteHistory(projectPath, filename);
  }

  async getNoteVersionContent(projectPath, hash) {
    return window.api.getNoteVersionContent(projectPath, hash);
  }
}