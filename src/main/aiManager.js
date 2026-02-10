// src/main/aiManager.js
import tools from './tools.js';
import geminiProvider from './providers/gemini.js';
import mistralProvider from './providers/mistral.js';

// Map providers string to implementation
const PROVIDERS = {
    'gemini': geminiProvider,
    'mistral': mistralProvider
};

/**
 * Main chat function that delegates to specific providers.
 */
export async function continueChat(messages, settings, eventSender) {
  const providerName = settings.aiProvider || 'gemini';
  const provider = PROVIDERS[providerName];

  if (!provider) {
      return { success: false, error: `Provider '${providerName}' not implemented.` };
  }

  // 1. Prepare Context
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

  // Separate history from the very last message
  const history = messages.slice(0, -1); 
  const lastMessageObj = messages[messages.length - 1];
  const lastMessageText = lastMessageObj ? lastMessageObj.parts[0].text : null;

  try {
    let turns = 0;
    const MAX_TURNS = 10;
    let currentHistory = [...history];
    let currentMessage = lastMessageText;
    let currentToolOutputs = null;

    // Loop for Tool Calls
    while (turns < MAX_TURNS) {
        turns++;

        // A. Call the Provider
        const response = await provider.sendMessage({
            history: currentHistory,
            latestMessage: currentMessage,
            systemInstruction: systemInstruction,
            tools: tools.definitions,
            settings: settings,
            toolOutputs: currentToolOutputs
        });

        // B. Check for Function Calls
        if (response.functionCalls && response.functionCalls.length > 0) {
            
            // Notify UI
            if (eventSender) {
                eventSender.send('chat-update', { 
                    type: 'tool_start', 
                    tool: { name: response.functionCalls[0].name, args: response.functionCalls[0].args } 
                });
            }

            // Execute Tools
            const toolResults = await Promise.all(response.functionCalls.map(async (call) => {
                let content;
                try {
                    content = await tools.executeTool(call.name, call.args);
                } catch (e) {
                    content = `Error: ${e.message}`;
                }
                return {
                    id: call.id,
                    name: call.name,
                    content: content
                };
            }));

            if (eventSender) {
                eventSender.send('chat-update', { type: 'tool_end' });
            }

            // Update State for next loop iteration

            if (providerName === 'gemini') {
                // Gemini SDK Flow:
                
                // 1. We must append the USER message that caused this turn, 
                //    otherwise the next history is [OldHistory, ModelResponse], 
                //    missing the "User" part, causing 400 Errors.
                if (currentMessage) {
                    currentHistory.push({
                        role: 'user',
                        parts: [{ text: currentMessage }]
                    });
                }

                // 2. Append the Model's response (which contains the Function Call)
                // We use the raw SDK parts to ensure the internal structure is preserved.
                // Note: response.raw should be the 'candidates[0].content' or similar structure
                const modelContent = response.raw.candidates ? response.raw.candidates[0].content : response.raw;
                
                currentHistory.push({
                    role: 'model',
                    parts: modelContent.parts
                });
                
                // 3. Prepare for next turn
                currentMessage = null; // No new user text
                currentToolOutputs = toolResults; // Pass outputs to be sent in the next API call
            } 
            else if (providerName === 'mistral') {
                // Mistral Flow:
                
                // 1. Append User Message
                if (currentMessage) {
                    currentHistory.push({ role: 'user', parts: [{ text: currentMessage }] });
                    currentMessage = null;
                }

                // 2. Append Assistant Message (with tool_calls)
                currentHistory.push({
                    role: 'model',
                    parts: [{ text: response.text || "" }], 
                    tool_calls: response.raw.toolCalls 
                });

                // 3. Append Tool Results (Mistral treats these as history messages)
                toolResults.forEach(res => {
                    currentHistory.push({
                        role: 'tool',
                        name: res.name,
                        content: res.content,
                        tool_call_id: res.id
                    });
                });
                
                currentToolOutputs = null;
            }

        } else {
            // C. No tools, final response
            return { success: true, response: response.text };
        }
    }
    
    return { success: false, error: "Max conversation turns exceeded." };

  } catch (error) {
    console.error('AI Agent Error:', error);
    return { success: false, error: error.message };
  }
}

export default { continueChat };
