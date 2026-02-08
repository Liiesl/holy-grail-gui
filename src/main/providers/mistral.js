// src/main/providers/mistral.js
const { Mistral } = require('@mistralai/mistralai');

/**
 * Adapter for the official Mistral AI SDK.
 * Handles the conversion between the app's generic history format and Mistral's specific format.
 */
async function sendMessage({ history, latestMessage, systemInstruction, tools, settings }) {
  const apiKey = settings.mistralApiKey;
  if (!apiKey) throw new Error('Mistral API key is missing.');

  const client = new Mistral({ apiKey: apiKey });

  // 1. Construct Messages for Mistral
  const mistralMessages = [];

  // Add System Instruction
  if (systemInstruction) {
    mistralMessages.push({ role: 'system', content: systemInstruction });
  }

  // Transform generic history to Mistral format
  // We handle standard user/model roles, plus the special "tool_calls" and "tool" output roles
  history.forEach(msg => {
    if (msg.role === 'model') {
      const content = msg.parts.map(p => p.text).join('') || null; // Content can be null if it's a tool call
      
      const messageObj = {
        role: 'assistant',
        content: content
      };

      // If we stored tool calls in the history (see aiManager), attach them here
      if (msg.tool_calls) {
        messageObj.toolCalls = msg.tool_calls;
      }
      
      mistralMessages.push(messageObj);
    } 
    else if (msg.role === 'tool') {
      // Message representing the output of a tool
      mistralMessages.push({
        role: 'tool',
        content: msg.content,
        name: msg.name,
        toolCallId: msg.tool_call_id
      });
    }
    else {
      // User messages
      const text = msg.parts.map(p => p.text).join('');
      mistralMessages.push({
        role: 'user',
        content: text
      });
    }
  });

  // Add the latest user message if it exists (it might be null if we are in a tool-loop)
  if (latestMessage) {
    mistralMessages.push({ role: 'user', content: latestMessage });
  }

  // 2. Format Tools
  // Mistral SDK expects: { type: 'function', function: { ... } }
  // Our tools.js definitions are the inner function object.
  const mistralTools = tools.map(tool => ({
    type: 'function',
    function: tool // tool definition from tools.js
  }));

  // 3. Call API
  const response = await client.chat.complete({
    model: 'mistral-large-latest',
    messages: mistralMessages,
    tools: mistralTools,
    toolChoice: 'auto' 
  });

  // 4. Parse Response
  const choice = response.choices[0];
  const message = choice.message;

  // Map SDK response back to our generic app format
  const functionCalls = [];
  if (message.toolCalls) {
    message.toolCalls.forEach(tc => {
      // Mistral SDK might return arguments as a string or object depending on version
      // Safe parsing:
      let args = tc.function.arguments;
      if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch(e) { console.error("Mistral JSON parse error", e); }
      }

      functionCalls.push({
        name: tc.function.name,
        args: args,
        id: tc.id
      });
    });
  }

  return {
    text: message.content || "",
    functionCalls: functionCalls,
    raw: message
  };
}

module.exports = { sendMessage };