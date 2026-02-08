// src/main/providers/gemini.js
const { GoogleGenAI } = require('@google/genai');

async function sendMessage({ history, latestMessage, systemInstruction, tools, settings, toolOutputs }) {
  const apiKey = settings.geminiApiKey;
  if (!apiKey) throw new Error('Gemini API key is missing.');

  const ai = new GoogleGenAI({ apiKey });

  // Gemini SDK manages chat session statefuly, but to keep our architecture generic,
  // we recreate the chat state from the provided history.
  
  const chat = ai.chats.create({
    model: 'gemini-flash-lite-latest', 
    history: history,
    config: {
      systemInstruction: systemInstruction,
      tools: [{ functionDeclarations: tools }],
      automaticFunctionCalling: { disable: true } 
    },
  });

  let result;

  // Case A: We are returning tool outputs
  if (toolOutputs && toolOutputs.length > 0) {
     // The SDK expects the previous turn to be the model asking for tools.
     // In this stateless wrapper, 'history' already contains that.
     // However, the Google SDK `sendMessage` is designed to send a USER message or Tool Responses.
     
     result = await chat.sendMessage({
        message: toolOutputs.map(out => ({
          functionResponse: {
            name: out.name,
            response: { content: out.content } 
          }
        }))
      });
  } 
  // Case B: Normal user message
  else if (latestMessage) {
     result = await chat.sendMessage({ message: latestMessage });
  } 
  else {
     throw new Error("Invalid state: No message and no tool outputs.");
  }

  // Normalize Output
  const responseText = getResponseText(result);
  const functionCalls = getFunctionCalls(result);

  return {
    text: responseText,
    functionCalls: functionCalls,
    raw: result
  };
}

// Helpers from original code
function getResponseText(result) {
  if (result.text) return result.text;
  if (result.candidates && result.candidates.length > 0) {
    const content = result.candidates[0].content;
    if (content && content.parts) {
      return content.parts.filter(part => part.text).map(part => part.text).join('');
    }
  }
  return "";
}

function getFunctionCalls(result) {
  if (result.functionCalls) {
    const calls = typeof result.functionCalls === 'function' ? result.functionCalls() : result.functionCalls;
    if (calls && calls.length > 0) return calls;
  }
  const parts = result.candidates?.[0]?.content?.parts || [];
  return parts.filter(part => part.functionCall).map(part => ({
      name: part.functionCall.name,
      args: part.functionCall.args,
      id: part.functionCall.id
    }));
}

module.exports = { sendMessage };