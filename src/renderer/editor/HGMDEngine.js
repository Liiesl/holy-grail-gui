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
    
    // FIX: Implement a placeholder system to correctly handle escaped characters.
    const escapedChars = [];
    const placeholder = '\uE000'; // A character from the Private Use Area

    // 1. Protect escaped characters by replacing them with placeholders.
    let protectedText = text.replace(/\\([!"#$%&'()*+,-./:;<=>?@\[\\\]^_`{|}~])/g, (match, char) => {
      escapedChars.push(char);
      return placeholder;
    });

    let processedText = protectedText;
    
    // 2. Process all other inline rules. These rules will ignore the placeholders.
    this.inlineRules.forEach(rule => {
      processedText = processedText.replace(rule.mdRegex, rule.mdToHtml);
    });

    // 3. Restore the original characters from the placeholders.
    // The `indexOf` check handles cases where there are no escaped characters.
    if (escapedChars.length > 0) {
      processedText = processedText.replace(new RegExp(placeholder, 'g'), () => escapedChars.shift());
    }
    
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
      
      // FIX: This logic is now smarter. It distinguishes between a paragraph
      // separator (a single blank line) and an intentional empty paragraph
      // (multiple blank lines).
      if (lines[i].trim() === '') {
        // Look ahead: is the next line also blank?
        // If so, this is an intentional empty paragraph.
        if (i + 1 < lines.length && lines[i + 1].trim() === '') {
          htmlParts.push('<p><br></p>');
        }
        // Otherwise, it's just a separator between blocks, so we consume
        // it without generating any HTML.
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
        const paragraphContent = paragraphLines.join('<br>');
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
   * Recursively traverses a DOM node and escapes ASCII punctuation and symbols in text nodes.
   * This prevents the markdown converter from interpreting user-inputted syntax.
   * @param {Node} node The DOM node to process.
   * @private
   */
  _escapeAsciiSyntaxInTextNodes(node) {
    // A comprehensive regex for all standard ASCII punctuation and symbols.
    const asciiPunctuationAndSymbols = /[\\!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~]/g;

    if (node.nodeType === Node.TEXT_NODE) {
      // Do not escape content within code blocks or preformatted text elements.
      if (node.parentNode.closest('code, pre')) {
        return;
      }
      // Replace each special character with a backslash-escaped version.
      node.textContent = node.textContent.replace(asciiPunctuationAndSymbols, '\\$&');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // If it's an element node, recursively process its children.
      for (const child of node.childNodes) {
        this._escapeAsciiSyntaxInTextNodes(child);
      }
    }
  }
  
  /**
   * Converts an HTML string from the editor to a Markdown string.
   * @param {string} html - The HTML content.
   * @returns {string} - The resulting Markdown.
   */
  htmlToMarkdown(html) {
    if (!html) return '';

    // Pre-processing Step 1: Parse HTML and escape special characters in text nodes.
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    this._escapeAsciiSyntaxInTextNodes(doc.body);
    let processedHtml = doc.body.innerHTML;

    // Pre-processing Step 2: Standardize input from contenteditable fields.
    processedHtml = processedHtml.replace(/&nbsp;/g, ' '); // Replace non-breaking spaces.
    
    let markdown = processedHtml;
    
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