// src/renderer/chat.js
export class Chat {
    constructor(container) {
        this.container = container;
        this.history = []; 
        this.systemMessage = null; 
        this.render();
        this.initElements();
        this.addEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="chat-header">
                <h3>AI Assistant</h3>
            </div>
            <div class="chat-messages" id="chat-messages">
                <div class="message model">
                    <p>Hello! I can search your notes, read content, and help you write. Please ensure your AI Provider is configured in Settings.</p>
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

        // Listen for real-time updates from the main process
        window.api.onChatUpdate(update => {
            this.handleChatUpdate(update);
        });
    }

    handleChatUpdate(update) {
        if (!this.systemMessage) return;

        const p = this.systemMessage.querySelector('p');
        if (update.type === 'tool_start') {
            const query = update.tool.args.query || update.tool.name;
            p.textContent = `Using tool: ${update.tool.name}...`;
        } else if (update.type === 'tool_end') {
            p.textContent = 'Processing results...';
        }
    }

    async sendMessage() {
        const messageText = this.inputEl.value.trim();
        if (!messageText) return;

        this.addMessage(messageText, 'user');
        this.history.push({ role: 'user', parts: [{ text: messageText }] });

        this.inputEl.value = '';
        this.inputEl.focus();
        this.sendBtn.disabled = true;

        this.systemMessage = this.addMessage('Thinking...', 'loading');

        try {
            // Note: We still call 'chatWithGemini' because the preload/IPC bridge matches the main process.
            // The Main process 'aiManager' handles switching providers.
            const result = await window.api.chatWithGemini(this.history);

            // Remove the status message
            this.systemMessage.remove();
            this.systemMessage = null;

            if (result.success) {
                // Only add to history if the response actually has text
                if (result.response && result.response.trim().length > 0) {
                    this.addMessage(result.response, 'model'); // 'model' class replaces 'gemini'
                    this.history.push({ role: 'model', parts: [{ text: result.response }] });
                } else {
                    this.addMessage("(No text response received)", 'error');
                }
            } else {
                this.addMessage(result.error, 'error');
            }
        } catch (e) {
            if (this.systemMessage) this.systemMessage.remove();
            this.addMessage('An unexpected error occurred.', 'error');
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
        return messageEl;
    }
}