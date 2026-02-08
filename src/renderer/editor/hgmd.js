// src/renderer/hgmd.js
import { HGMDEngineV2 } from './HGMDEngineV2.js';

// Instantiate the engine once to be used as a singleton service.
const engine = new HGMDEngineV2();

/**
 * Handles Markdown-to-HTML and HTML-to-Markdown conversions
 * by delegating to a central HGMDEngine instance.
 */
export class Hgmd {
  toHtml(markdown) {
    return engine.markdownToHtml(markdown);
  }

  toMarkdown(html) {
    return engine.htmlToMarkdown(html);
  }
}