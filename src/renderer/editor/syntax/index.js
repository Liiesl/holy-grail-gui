// src/renderer/syntax/index.js

import widgetRules from './widgets.js';
import blockRules from './blocks.js';
import editorArtifactRules from './editor.js';
import inlineStyleRules from './inlineStyles.js';

/**
 * A unified syntax dictionary, aggregated from multiple rule files.
 * Each rule is an object defining a piece of Markdown/HTML syntax.
 *
 * The structure of a rule object is as follows:
 * - name: A unique identifier for the rule.
 * - type: 'block' or 'inline'. Block rules are processed first on a line-by-line basis
 *         during MD->HTML conversion. The type is also used to determine processing order
 *         during HTML->MD conversion.
 * - mdRegex: A regular expression to find the Markdown pattern. Used for MD->HTML.
 * - mdToHtml: A replacement string or a function to generate HTML. Functions receive
 *             the full match, capture groups, and the engine instance `this` as the last
 *             argument, allowing them to recursively call the inline processor.
 * - htmlRegex: A regular expression to find the HTML pattern. Used for HTML->MD.
 * - htmlToMd: A replacement string or a function to generate Markdown. Functions receive
 *             the full match and capture groups.
 *
 * --- IMPORTANT ---
 * The order of rule aggregation below is crucial for the HTML -> Markdown conversion.
 * More specific block rules (e.g., custom `<div>` for alerts) must come before
 * more general ones (e.g., generic `<p>` or `<div>` tags for paragraphs). This
 * prevents general rules from incorrectly matching and converting the more specific
 * HTML structures first.
 */
const SYNTAX_RULES = [
  // 1. Special widgets and custom blocks. These are the most specific.
  ...widgetRules,

  // 2. Standard block-level elements like headings.
  ...blockRules,

  // 3. Special rules for handling editor-generated HTML artifacts (e.g., <p><br></p>).
  //    These are often general (<p>, <div>) but must come after more specific divs/ps.
  ...editorArtifactRules,

  // 4. Inline styling rules. Their order relative to each other matters less,
  //    but they should generally be processed after block-level conversions.
  ...inlineStyleRules,
];

export default SYNTAX_RULES;