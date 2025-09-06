// src/renderer/syntax/index.js

import widgetRules from './widgets.js';
import blockRules from './blocks.js';
import editorArtifactRules from './editor.js';
import inlineStyleRules from './inlineStyles.js';

/**
 * @file This file serves as the central registry for all syntax conversion rules
 * used by the HGMDEngine. It aggregates rules from different categories into a
 * single, ordered array. The processing strategy differs significantly between
 * Markdown-to-HTML and HTML-to-Markdown conversions, and the order of rules is
 * critical for the latter.
 */

/**
 * A unified syntax dictionary, aggregated from multiple rule files.
 * Each rule is an object defining a piece of Markdown/HTML syntax.
 *
 * The structure of a rule object is as follows:
 * - name: {string} A unique identifier for the rule (e.g., 'heading', 'bold').
 * - type: {'block' | 'inline'} Determines the processing strategy.
 * - multiLine: {boolean} (Optional, for block rules) If true, indicates the rule's
 *              `mdToHtml` function can process multiple lines of Markdown at once.
 * - mdRegex: {RegExp} A regular expression to find the Markdown pattern.
 * - mdToHtml: {string | Function} A replacement string or a function to generate HTML.
 * - htmlRegex: {RegExp} A regular expression to find the HTML pattern.
 * - htmlToMd: {string | Function} A replacement string or a function to generate Markdown.
 *
 * --- MD -> HTML Conversion Strategy ---
 * For performance, this conversion builds an array of HTML string parts rather than
 * concatenating a single large string in a loop.
 * 1. The engine splits the input Markdown into lines.
 * 2. It iterates through the lines, applying only 'block' type rules to identify
 *    major structural elements (headings, lists, code blocks, paragraphs, etc.).
 * 3. Matched content is converted to HTML and pushed into an array of parts.
 * 4. For rules that produce content needing further processing (like paragraphs),
 *    the engine calls a dedicated inline processor which applies all 'inline' type
 *    rules (bold, italic, etc.) on that content.
 * 5. Finally, the array of HTML parts is joined into a single string.
 *
 * This approach is highly efficient for large documents. Rule functions for this
 * conversion process are defined as follows:
 * - Single-line function: `mdToHtml(match, capture1, ..., engine)` receives regex match
 *   groups and the engine instance `this`, allowing it to call the inline processor
 *   via `engine._processInlineMd(content)`.
 * - Multi-line function: `mdToHtml(startIndex, allLines, engine)` must return an object:
 *   `{ htmlParts: string[], linesConsumed: number }`. Returning an array of parts
 *   (`htmlParts`) is preferred to avoid performance bottlenecks. A legacy
 *   `{ html: string, linesConsumed: number }` is also supported.
 *
 * --- HTML -> MD Conversion Strategy ---
 * This conversion is a series of `replace()` calls on the entire HTML string.
 * The order of rules in the `SYNTAX_RULES` array below is CRITICAL for this process.
 * Rules must be ordered from MOST SPECIFIC to LEAST SPECIFIC (most general).
 * This prevents a general rule (like converting `<p>...</p>`) from matching and
 * incorrectly converting a more specific structure (like a `<div class="alert"><p>...</p></div>`)
 * before the specific rule has a chance to run.
 *
 * The processing order is as follows:
 * 1. Widgets & Custom Blocks: Most specific, unique HTML structures.
 * 2. Standard Blocks: Headings, lists, blockquotes.
 * 3. Editor Artifacts: Generic HTML from contenteditable like `<p><br></p>`,
 *    which must run after specific blocks are handled.
 * 4. Inline Styles: Bold, italic, etc., which operate on text content.
 */
const SYNTAX_RULES = [
  // 1. Special widgets and custom blocks. These are the most specific.
  ...widgetRules,

  // 2. Standard block-level elements like headings, lists, and blockquotes.
  ...blockRules,

  // 3. Special rules for handling editor-generated HTML artifacts (e.g., <p><br></p>).
  //    These are often general (<p>, <div>) but must come after more specific divs/ps.
  ...editorArtifactRules,

  // 4. Inline styling rules. Their order relative to each other matters less,
  //    but they should generally be processed after block-level conversions.
  ...inlineStyleRules,
];

export default SYNTAX_RULES;