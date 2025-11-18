// src/main/gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * The definition of the "search_notes" tool that the Gemini model can use.
 */
const searchTool = {
  functionDeclarations: [
    {
      name: 'search_notes',
      description: 'Searches the user\'s notes for a given query to find relevant context. Use this to answer questions about topics mentioned in the notes.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: 'The search term or question to look for in the notes.',
          },
        },
        required: ['query'],
      },
    },
  ],
};

/**
 * Executes a step in the conversation with the Gemini model.
 * It sends the current conversation history and lets the model decide whether to
 * respond with text or call a tool (like search_notes).
 * @param {Array} messages - The conversation history.
 * @param {string} apiKey - The user's Gemini API key.
 * @returns {Promise<Object>} The raw response from the Gemini API.
 */
async function continueChat(messages, apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API key is not set. Please add it in the settings.');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use a model that supports tool calling
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-pro-preview',
    });

    const result = await model.generateContent({
      contents: messages,
      tools: [searchTool],
    });
    
    return result;

  } catch (error) {
    console.error('Gemini API Error:', error);
    // Provide a more user-friendly error message
    if (error.message.includes('API key not valid')) {
        throw new Error('The provided Gemini API key is not valid. Please check it in the settings.');
    }
    // Handle cases where the model might reject the prompt
    if (error.message.includes('finish_reason: SAFETY')) {
        throw new Error('The response was blocked due to safety settings.');
    }
    throw new Error('An error occurred while communicating with the Gemini API.');
  }
}

module.exports = { continueChat };