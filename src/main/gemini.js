// src/main/gemini.js
const { GoogleGenAI } = require('@google/genai');
const projectManager = require('./projectManager');
const searchManager = require('./searchManager');

// ... [Keep your tool definitions (searchTool, readNoteTool, etc.) exactly as they were] ...

const searchTool = {
  name: 'search_notes',
  description: 'Fuzzy searches across all notes for a query. Returns snippets. Use this to find topics.',
  parameters: {
    type: 'OBJECT',
    properties: {
      query: { type: 'STRING', description: 'The search term.' },
    },
    required: ['query'],
  },
};

const readNoteTool = {
  name: 'read_note',
  description: 'Reads the FULL content of a specific note file. Use this when you need to read a whole document to summarize or edit it.',
  parameters: {
    type: 'OBJECT',
    properties: {
      projectPath: { type: 'STRING', description: 'The absolute path to the project folder.' },
      filename: { type: 'STRING', description: 'The filename (e.g., "todo.hgmd").' },
    },
    required: ['projectPath', 'filename'],
  },
};

const createNoteTool = {
  name: 'create_note',
  description: 'Creates a new note (or overwrites) with the given Markdown content.',
  parameters: {
    type: 'OBJECT',
    properties: {
      projectPath: { type: 'STRING', description: 'The absolute path to the project folder.' },
      name: { type: 'STRING', description: 'The display name of the note (e.g. "Meeting Notes").' },
      content: { type: 'STRING', description: 'The Markdown content to write.' },
    },
    required: ['projectPath', 'name', 'content'],
  },
};


// ... [Keep your TOOL_FUNCTIONS and helper exactly as they were] ...

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

async function findFilenameByName(projectPath, name) {
    const notes = await projectManager.getNotes(projectPath);
    const note = notes.find(n => n.name === name);
    return note ? note.id : null;
}

function getResponseText(result) {
  // Try the documented property first
  if (result.text) {
    return result.text;
  }
  
  // Fallback: Manually extract text from candidates
  // This handles cases where .text is missing or undefined in some SDK versions
  if (result.candidates && result.candidates.length > 0) {
    const content = result.candidates[0].content;
    if (content && content.parts) {
      return content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('');
    }
  }
  
  return ""; // Return empty string if nothing found
}

/**
 * Main chat function using the new Google GenAI SDK.
 */
async function continueChat(messages, settings, eventSender) {
  const apiKey = settings.geminiApiKey;
  if (!apiKey) throw new Error('Gemini API key is missing.');

  const ai = new GoogleGenAI({ apiKey });
  
  // Inject project paths
  const projectListContext = settings.projects
    .map(p => `- Name: "${p.name}", Path: "${p.path}"`)
    .join('\n');

  const systemInstruction = `
You are an intelligent assistant inside a note-taking app.
You can Search, Read, and Create notes.

AVAILABLE PROJECTS:
${projectListContext}

GUIDELINES:
1. Always use Markdown.
2. If the user implies "this project", infer it from context or ask.
3. To read a file, you first need its filename (e.g. via Search).
4. When using tools, use the exact absolute paths provided above.
`;

  const history = messages.slice(0, -1); 
  const lastMessage = messages[messages.length - 1].parts[0].text;

  const chat = ai.chats.create({
    model: 'gemini-flash-latest',
    history: history,
    config: {
      systemInstruction: systemInstruction,
      tools: [{ functionDeclarations: [searchTool, readNoteTool, createNoteTool] }],
      automaticFunctionCalling: { disable: true } 
    },
  });

  try {
    // 1. Send user message
    // Note: The new SDK uses { message: ... }
    let result = await chat.sendMessage({ message: lastMessage });
    
    let functionCalls = getFunctionCalls(result);
    
    let turns = 0;
    const MAX_TURNS = 10;

    while (functionCalls.length > 0 && turns < MAX_TURNS) {
      turns++;

      // 2. Execute Tools
      const toolOutputs = await Promise.all(functionCalls.map(async (call) => {
        const fn = TOOL_FUNCTIONS[call.name];
        
        if(eventSender) {
           eventSender.send('chat-update', { 
             type: 'tool_start', 
             tool: { name: call.name, args: call.args } 
           });
        }

        let toolResult;
        if (fn) {
            toolResult = await fn(call.args);
        } else {
            toolResult = "Error: Tool function not found.";
        }

        if(eventSender) {
           eventSender.send('chat-update', { type: 'tool_end' });
        }

        return {
          id: call.id,
          name: call.name,
          content: toolResult
        };
      }));

      // 3. Send Tool Outputs back to Model
      // FIX: Wrap the parts array in an object with the 'message' key.
      result = await chat.sendMessage({
        message: toolOutputs.map(out => ({
          functionResponse: {
            name: out.name,
            response: { content: out.content } 
          }
        }))
      });

      functionCalls = getFunctionCalls(result);
    }

    // === CHANGE THIS LINE ===
    // Old: return { success: true, response: result.text };
    // New: Use the helper
    const finalResponse = getResponseText(result);
    return { success: true, response: finalResponse };

  } catch (error) {
    console.error('Gemini Agent Error:', error);
    return { success: false, error: error.message };
  }
}

// 2. UPDATE THIS FUNCTION (At the bottom of the file)
function getFunctionCalls(result) {
  // A. Try the official SDK getter first (most reliable)
  if (result.functionCalls) {
    // Some versions return a function, some return the array directly
    const calls = typeof result.functionCalls === 'function' 
      ? result.functionCalls() 
      : result.functionCalls;
      
    if (calls && calls.length > 0) return calls;
  }

  // B. Fallback: Manual extraction (for older/beta SDK structures)
  const parts = result.candidates?.[0]?.content?.parts || [];
  return parts
    .filter(part => part.functionCall)
    .map(part => ({
      name: part.functionCall.name,
      args: part.functionCall.args,
      id: part.functionCall.id // Important for identifying the call in history
    }));
}

module.exports = { continueChat };