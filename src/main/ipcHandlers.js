// src/main/ipcHandlers.js
const { ipcMain, app } = require('electron'); // Added app
const projectManager = require('./projectManager');
const searchManager = require('./searchManager'); // Import the new search manager
const { readSettings, saveSettings } = require('./settings'); // Import settings functions
const { continueChat } = require('./gemini'); // Import Gemini function

/**
 * Registers all IPC handlers for the application.
 * @param {object} sessionRef - A reference object to store session data.
 */
function registerIpcHandlers(sessionRef) {
  // --- Project & Note Handlers ---
  ipcMain.handle('get-projects', () => {
    return projectManager.getProjects();
  });

  ipcMain.handle('add-project', (event) => {
    return projectManager.addProject(event);
  });

  ipcMain.handle('get-notes', (event, projectPath) => {
    return projectManager.getNotes(projectPath);
  });

  ipcMain.handle('get-note-content', (event, payload) => {
    return projectManager.getNoteContent(payload);
  });

  ipcMain.handle('save-note', (event, payload) => {
    return projectManager.saveNote(payload);
  });

  ipcMain.handle('delete-note', (event, payload) => {
    return projectManager.deleteNote(payload);
  });

  ipcMain.handle('create-note', (event, payload) => {
    return projectManager.createNote(payload);
  });

  ipcMain.handle('rename-note', (event, payload) => {
    return projectManager.renameNote(payload);
  });

  ipcMain.handle('move-note', (event, payload) => {
    return projectManager.moveNote(payload);
  });

  ipcMain.handle('reorder-notes', (event, payload) => {
    return projectManager.reorderNotes(payload);
  });

  // --- Version History Handlers ---
  ipcMain.handle('get-note-history', (event, payload) => {
    return projectManager.getNoteHistory(payload);
  });

  ipcMain.handle('get-note-version-content', (event, payload) => {
    return projectManager.getNoteVersionContent(payload);
  });
  
  // --- NEW: Project Actions ---
  ipcMain.handle('untrack-project', (event, projectPath) => {
    return projectManager.untrackProject(projectPath);
  });
 
  ipcMain.handle('delete-project', (event, projectPath) => {
    // Pass the event to get the window for the dialog
    return projectManager.deleteProject(event, projectPath);
  });

  // --- NEW: Settings Handlers ---
  ipcMain.handle('get-settings', async () => {
    return readSettings();
  });

  ipcMain.handle('save-settings', async (event, settings) => {
    return saveSettings(settings);
  });
  
  // --- UPGRADED: Gemini Chat Handler with Tool Calling ---
  ipcMain.handle('chat-with-gemini', async (event, messages) => {
    try {
      const settings = await readSettings();
      let currentMessages = messages;
      const maxTurns = 5; // Safety brake for tool-use loops

      for (let i = 0; i < maxTurns; i++) {
        const result = await continueChat(currentMessages, settings.geminiApiKey);
        const response = result.response;
        const candidate = response.candidates[0];

        // Check for function call
        const functionCalls = candidate.content.parts.filter(part => part.functionCall);

        if (functionCalls.length > 0) {
          // Add the model's tool request to history
          currentMessages.push(candidate.content);
          
          const call = functionCalls[0].functionCall; // Handle one call at a time for simplicity
          
          if (call.name === 'search_notes') {
            const query = call.args.query;
            event.sender.send('chat-update', { type: 'tool_start', tool: { name: 'search_notes', args: { query } } });
            
            const searchResults = searchManager.performSearch(query, {});
            
            let searchResultText;
            if (searchResults.length === 0) {
              searchResultText = `No relevant information found in the notes for the query: "${query}"`;
            } else {
              const formattedResults = searchResults.slice(0, 5).map(r => {
                  let context = `In project "${r.metadata.projectName}"`;
                  if (r.metadata.noteName) context += `, note "${r.metadata.noteName}"`;
                  if (r.metadata.lineNumber) context += ` on line ${r.metadata.lineNumber}`;
                  return `- ${context}:\n  > "${r.text.trim()}"`;
              }).join('\n\n');
              searchResultText = `Found ${searchResults.length} results. Here are the top ${Math.min(5, searchResults.length)}:\n\n${formattedResults}`;
            }

            event.sender.send('chat-update', { type: 'tool_end' });
            
            // Add the tool's response to history
            currentMessages.push({
              role: 'tool',
              parts: [{
                functionResponse: {
                  name: 'search_notes',
                  response: { content: searchResultText },
                }
              }]
            });
            // Continue the loop to get the final text response from the model
            continue;
          }
        } else {
          // If no function call, it's a text response. We are done.
          const text = candidate.content.parts.map(p => p.text).join('');
          return { success: true, response: text };
        }
      }
      return { success: false, error: 'AI took too many steps to generate a response.' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // --- NEW: Session Handler ---
  ipcMain.on('update-session-data', (event, data) => {
    sessionRef.current = data;
  });

  // --- NEW: App Info ---
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // --- NEW: Search Handlers ---
  ipcMain.handle('search-perform', (event, { query, context }) => {
    // Now calls the dedicated search manager for performing a search
    return searchManager.performSearch(query, context);
  });

  ipcMain.handle('search-build-all-indices', () => {
    // Building the index is an orchestration task that projectManager handles
    return projectManager.buildAllIndices();
  });
}

module.exports = { registerIpcHandlers };