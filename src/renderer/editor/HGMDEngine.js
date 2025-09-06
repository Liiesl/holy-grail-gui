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
    // For inline rules, simple replace is often fine as the target text is usually
    // a single line or small block, and replace is optimized. If this becomes
    // an issue, it would need the array-building approach.
    this.inlineRules.forEach(rule => {
      processedText = processedText.replace(rule.mdRegex, rule.mdToHtml);
    });
    return processedText;
  }

  /**
   * Converts a Markdown string to an array of HTML string parts.
   * Internal helper function, primarily used for recursive calls in block parsing.
   * @param {string} markdown - The Markdown content.
   * @returns {string[]} - An array of HTML string parts.
   * @private
   */
  _markdownToHtmlParts(markdown) {
    if (markdown === null || markdown === undefined) return ['<p><br></p>'];

    const lines = markdown.split('\n');
    const htmlParts = [];
    let i = 0;

    while (i < lines.length) {
      let lineMatched = false;
      for (const rule of this.blockRules) {
        const match = lines[i].match(rule.mdRegex);
        if (match) {
          if (rule.multiLine && typeof rule.mdToHtml === 'function') {
            const result = rule.mdToHtml(i, lines, this);
            // Multi-line rules must now return an array of parts
            if (result.htmlParts) {
                htmlParts.push(...result.htmlParts);
            } else {
                // Fallback for rules that might still return a single string (should be avoided for large outputs)
                htmlParts.push(result.html);
            }
            i += result.linesConsumed;
          } else if (typeof rule.mdToHtml === 'function') {
            htmlParts.push(rule.mdToHtml(...match, this));
            i++;
          } else {
            // For simple string replacements
            htmlParts.push(lines[i].replace(rule.mdRegex, rule.mdToHtml));
            i++;
          }
          lineMatched = true;
          break;
        }
      }

      if (lineMatched) {
        continue;
      }
      
      // If we are here, the line is not a recognized block element.
      // It's either an empty line or part of a paragraph.
      if (lines[i].trim() === '') {
        htmlParts.push('<p><br></p>');
        i++;
        continue;
      }

      // It's a paragraph. Collect all consecutive non-block, non-empty lines.
      const paragraphLines = [];
      while (i < lines.length && lines[i].trim() !== '') {
        const isBlock = this.blockRules.some(rule => lines[i].match(rule.mdRegex));
        if (isBlock) {
          break;
        }
        paragraphLines.push(lines[i]);
        i++;
      }
      
      if (paragraphLines.length > 0) {
        const paragraphContent = paragraphLines.join(' ');
        const processedContent = this._processInlineMd(paragraphContent);
        htmlParts.push(`<p>${processedContent}</p>`);
      }
    }
    return htmlParts; // Return the array of parts
  }

  /**
   * Converts a Markdown string to an HTML string, ensuring the output is
   * a clean series of block-level elements suitable for a contenteditable editor.
   * Public API, calls internal helper and joins parts.
   * @param {string} markdown - The Markdown content.
   * @returns {string} - The resulting HTML.
   */
  markdownToHtml(markdown) {
    const htmlParts = this._markdownToHtmlParts(markdown);
    const html = htmlParts.join('');
    // Ensure we always return something the editor can handle.
    return html.trim() === '' ? '<p><br></p>' : html;
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
      .replace(/&nbsp;/g, ' '); // Replace non-breaking spaces.

    // Apply all rules in their defined order. The order is critical here.
    this.rules.forEach(rule => {
      if (rule.htmlRegex) {
        markdown = markdown.replace(rule.htmlRegex, rule.htmlToMd);
      }
    });

    // Post-processing: Clean up any remaining artifacts.
    markdown = markdown.replace(/<[^>]*>/g, ''); // Strip lingering HTML tags
    return markdown.trim();
  }
}