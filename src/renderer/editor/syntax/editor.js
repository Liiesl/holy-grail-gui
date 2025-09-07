// src/renderer/syntax/editor.js

/**
 * Special HTML-only rules to handle artifacts from contenteditable editors,
 * like empty paragraphs or divs representing newlines.
 * These rules are crucial for the HTML -> Markdown conversion and have no
 * effect on Markdown -> HTML conversion.
 */
const editorArtifactRules = [
  {
    name: 'li-empty-content',
    type: 'block',
    // Matches empty <li> tags, which may contain just whitespace or a single <br> tag.
    // It replaces them with an li containing a single space. This ensures that
    // a subsequent list processing rule will treat it as a list item with content,
    // resulting in a space after the list marker (e.g., "-  " or "1.  ").
    htmlRegex: /<li>\s*(?:<br\s*\/?>)?\s*<\/li>/gi,
    htmlToMd: '<li> </li>',
  },
  // The 'empty-lines' rule that was here has been moved to blocks.js to ensure
  // it runs before the general 'paragraph' rule, fixing a bug where intentional
  // blank lines were deleted on save.
  {
    name: 'lines',
    type: 'block', // Type is for processing order in htmlToMarkdown
    htmlRegex: /<(p|div)>(.*?)<\/\1>/gi,
    htmlToMd: '$2\n',
  },
];

export default editorArtifactRules;