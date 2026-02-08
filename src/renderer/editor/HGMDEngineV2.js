// src/renderer/editor/HGMDEngineV2.js

import { HTMLParser, MarkdownParser } from './parser/index.js';
import { HTMLVisitor, MarkdownVisitor } from './visitors/index.js';

/**
 * HGMDEngine V2 - AST-based conversion engine
 * 
 * Architecture:
 * Markdown → MarkdownParser → AST → HTMLVisitor → HTML
 * HTML → HTMLParser → AST → MarkdownVisitor → Markdown
 * 
 * Uses DOMParser for HTML parsing as requested.
 * Fails gracefully with console warnings on errors.
 */
export class HGMDEngineV2 {
  constructor() {
    this.markdownParser = new MarkdownParser();
    this.htmlParser = new HTMLParser();
    this.htmlVisitor = new HTMLVisitor();
    this.markdownVisitor = new MarkdownVisitor();
  }
  
  /**
   * Convert Markdown to HTML
   * @param {string} markdown - Markdown content
   * @returns {string} HTML content
   */
  markdownToHtml(markdown) {
    try {
      // Handle null/undefined/empty
      if (markdown === null || markdown === undefined || markdown.trim() === '') {
        return '<p><br></p>';
      }
      
      // Parse markdown to AST
      const ast = this.markdownParser.parse(markdown);
      
      // Generate HTML from AST
      const html = this.htmlVisitor.visit(ast);
      
      return html;
    } catch (error) {
      console.warn('HGMDEngineV2.markdownToHtml error:', error);
      // Return safe fallback
      return '<p><br></p>';
    }
  }
  
  /**
   * Convert HTML to Markdown
   * @param {string} html - HTML content
   * @returns {string} Markdown content
   */
  htmlToMarkdown(html) {
    try {
      // Handle null/undefined/empty
      if (html === null || html === undefined || html.trim() === '') {
        return '';
      }
      
      // Parse HTML to AST using DOMParser
      const ast = this.htmlParser.parse(html);
      
      // Generate Markdown from AST
      const markdown = this.markdownVisitor.visit(ast);
      
      return markdown.trim();
    } catch (error) {
      console.warn('HGMDEngineV2.htmlToMarkdown error:', error);
      // Return safe fallback
      return '';
    }
  }
}

// Export as default and named
export default HGMDEngineV2;
