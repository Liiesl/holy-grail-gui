// src/renderer/chat.js
export class Chat {
    constructor(container) {
        this.container = container;
        this.render();
        this.initElements();
        this.addEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="chat-header">
                <h3>Gemini Chat</h3>
            </div>
            <div class="chat-messages" id="chat-messages">
                <div class="message gemini">
                    <p>Hello! How can I help you today? Please set your Gemini API key in Settings to begin.</p>
                </div>
            </div>
            <div class="chat-input-area">
                <textarea id="chat-input" placeholder="Ask something..." rows="3"></textarea>
                <button id="chat-send-btn">Send</button>
            </div>
        `;
    }

    initElements() {
        this.messagesContainer = this.container.querySelector('#chat-messages');
        this.inputEl = this.container.querySelector('#chat-input');
        this.sendBtn = this.container.querySelector('#chat-send-btn');
    }

    addEventListeners() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    async sendMessage() {
        const messageText = this.inputEl.value.trim();
        if (!messageText) return;

        this.addMessage(messageText, 'user');
        this.inputEl.value = '';
        this.inputEl.focus();
        this.sendBtn.disabled = true;

        const loadingMessage = this.addMessage('Thinking...', 'loading');

        try {
            const result = await window.api.chatWithGemini(messageText);

            // Remove loading message
            loadingMessage.remove();

            if (result.success) {
                this.addMessage(result.response, 'gemini');
            } else {
                // Display user-friendly error from main process
                this.addMessage(result.error, 'error');
            }
        } catch (e) {
            // Handle unexpected errors during IPC call itself
            loadingMessage.remove();
            this.addMessage('An unexpected error occurred. Please check the developer console.', 'error');
            console.error('Chat IPC error:', e);
        } finally {
            this.sendBtn.disabled = false;
        }
    }

    addMessage(text, type) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', type);
        
        const p = document.createElement('p');
        p.textContent = text;
        messageEl.appendChild(p);

        this.messagesContainer.appendChild(messageEl);
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        return messageEl; // Return element to allow for its removal
    }
}