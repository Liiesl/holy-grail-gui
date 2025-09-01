// src/renderer/HGMDEngine.js

import SYNTAX_RULES from './syntax/index.js';

export class HGMDEngine {
  constructor() {
    this.rules = SYNTAX_RULES;
    // Separate rules by type for efficient processing.
    this.blockRules = this.rules.filter(rule => rule.type === 'block' && rule.mdRegex);
    this.inlineRules = this.rules.filter(rule => rule.type === 'inline' && rule.mdRegex);
  }

  /**
   * Processes a string for all defined inline markdown rules.
   * @param {string} text - The text to process.
   * @returns {string} - Text with inline markdown converted to HTML.
   * @private
   */
  _processInlineMd(text) {
    if (text === undefined || text === null) return '';
    let processedText = text;
    this.inlineRules.forEach(rule => {
      processedText = processedText.replace(rule.mdRegex, rule.mdToHtml);
    });
    return processedText;
  }

  /**
   * Converts a Markdown string to an HTML string.
   * @param {string} markdown - The Markdown content.
   * @returns {string} - The resulting HTML.
   */
  markdownToHtml(markdown) {
    if (markdown === null || markdown === undefined) return '';

    const lines = markdown.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
      let lineMatched = false;
      for (const rule of this.blockRules) {
        const match = lines[i].match(rule.mdRegex);
        if (match) {
          if (rule.multiLine && typeof rule.mdToHtml === 'function') {
            const result = rule.mdToHtml(i, lines, this);
            html += result.html;
            i += result.linesConsumed;
          } else if (typeof rule.mdToHtml === 'function') {
            html += rule.mdToHtml(...match, this);
            i++;
          } else {
            html += lines[i].replace(rule.mdRegex, rule.mdToHtml);
            i++;
          }
          lineMatched = true;
          break; // Rule matched, move to the next block
        }
      }

      if (!lineMatched) {
        if (lines[i].trim() === '') {
          // An empty line in Markdown should become a visible empty line in the editor.
          html += '<p><br></p>';
        } else {
          // If no block rule matched, treat it as a paragraph.
          const content = this._processInlineMd(lines[i]);
          html += `<p>${content}</p>`;
        }
        i++;
      }
    }

    return html;
  }

  /**
   * Converts an HTML string from the editor to a Markdown string.
   * @param {string} html - The HTML content.
   * @returns {string} - The resulting Markdown.
   */
  htmlToMarkdown(html) {
    if (!html) return '';

    // Pre-processing: Standardize input from contenteditable fields.
    let markdown = html
      .replace(/\n/g, '')      // Remove newlines between tags.
      .replace(/&nbsp;/g, ' '); // Replace non-breaking spaces.

    // Apply all rules in their defined order. The order is critical here.
    this.rules.forEach(rule => {
      if (rule.htmlRegex) { // Some rules might only be for MD->HTML
        markdown = markdown.replace(rule.htmlRegex, rule.htmlToMd);
      }
    });

    // Post-processing: Clean up any remaining artifacts.
    markdown = markdown.replace(/<[^>]*>/g, ''); // Strip lingering HTML tags
    return markdown.trim();
  }
}