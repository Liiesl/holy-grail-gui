// src/main/tools.js
const projectManager = require('./projectManager');
const searchManager = require('./searchManager');

// --- Tool Definitions (JSON Schema) ---

const searchTool = {
  name: 'search_notes',
  description: 'Fuzzy searches across all notes for a query. Returns snippets. Use this to find topics.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search term.' },
    },
    required: ['query'],
  },
};

const readNoteTool = {
  name: 'read_note',
  description: 'Reads the FULL content of a specific note file. Use this when you need to read a whole document.',
  parameters: {
    type: 'object',
    properties: {
      projectPath: { type: 'string', description: 'The absolute path to the project folder.' },
      filename: { type: 'string', description: 'The filename (e.g., "todo.hgmd").' },
    },
    required: ['projectPath', 'filename'],
  },
};

const createNoteTool = {
  name: 'create_note',
  description: 'Creates a new note (or overwrites) with the given Markdown content.',
  parameters: {
    type: 'object',
    properties: {
      projectPath: { type: 'string', description: 'The absolute path to the project folder.' },
      name: { type: 'string', description: 'The display name of the note (e.g. "Meeting Notes").' },
      content: { type: 'string', description: 'The Markdown content to write.' },
    },
    required: ['projectPath', 'name', 'content'],
  },
};

const tools = [searchTool, readNoteTool, createNoteTool];

// --- Tool Implementations ---

async function findFilenameByName(projectPath, name) {
    const notes = await projectManager.getNotes(projectPath);
    const note = notes.find(n => n.name === name);
    return note ? note.id : null;
}

const TOOL_FUNCTIONS = {
  'search_notes': async ({ query }) => {
    const results = searchManager.performSearch(query, {});
    if (results.length === 0) return "No results found.";
    return results.slice(0, 5).map(r => 
      `[File: ${r.metadata.noteName} | Project: ${r.metadata.projectName}]\n${r.text.trim()}`
    ).join('\n---\n');
  },
  'read_note': async ({ projectPath, filename }) => {
    try {
      return await projectManager.getNoteContent({ projectPath, filename });
    } catch (e) {
      return `Error reading note: ${e.message}`;
    }
  },
  'create_note': async ({ projectPath, name, content }) => {
    try {
      const result = await projectManager.createNote({ projectPath, name });
      if (!result.success && result.error !== 'A page with this name already exists.') {
         return `Error creating note structure: ${result.error}`;
      }
      const filename = result.note ? result.note.id : (await findFilenameByName(projectPath, name));
      if (!filename) return "Error: Could not determine filename for writing.";

      await projectManager.saveNote({ projectPath, filename: filename, content });
      return `Successfully created/updated note "${name}" (ID: ${filename}).`;
    } catch (e) {
      return `Error creating note: ${e.message}`;
    }
  }
};

async function executeTool(name, args) {
    const fn = TOOL_FUNCTIONS[name];
    if (fn) {
        return await fn(args);
    }
    throw new Error(`Tool function '${name}' not found.`);
}

module.exports = {
    definitions: tools,
    executeTool
};