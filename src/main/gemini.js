// src/main/gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function generateChatResponse(prompt, apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API key is not set. Please add it in the settings.');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    // Provide a more user-friendly error message
    if (error.message.includes('API key not valid')) {
        throw new Error('The provided Gemini API key is not valid. Please check it in the settings.');
    }
    throw new Error('An error occurred while communicating with the Gemini API.');
  }
}

module.exports = { generateChatResponse };