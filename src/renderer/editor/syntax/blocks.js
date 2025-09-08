// src/renderer/syntax/blocks.js

/**
 * Syntax rules for standard block-level elements like headings.
 */
const blockRules = [
  {
    name: 'empty-lines',
    type: 'block',
    // NOTE: mdRegex is omitted; this rule is for HTML -> MD conversion.
    // This is the rule for an intentional blank line in the editor.
    // It is placed BEFORE the general 'paragraph' rule to ensure it is
    // processed first, preserving the blank line on save.
    htmlRegex: /<p><br\s*\/?><\/p>/gi,
    htmlToMd: '\n',
  },
  {
    name: 'heading',
    type: 'block',
    mdRegex: /^(#{1,3})\s*(.*)/,
    mdToHtml: function(match, hashes, content, engine) {
      const level = hashes.length;
      const processedContent = engine._processInlineMd(content);
      return `<h${level}>${processedContent}</h${level}>`;
    },
    htmlRegex: /<h([1-3])>(.*?)<\/h\1>/gi,
    htmlToMd: (match, level, content) => {
      const sanitizedContent = content.replace(/<br\s*\/?>$/, '').trim();
      return '#'.repeat(parseInt(level)) + (sanitizedContent ? ' ' + sanitizedContent : '') + '\n';
    },
  },
  {
    name: 'horizontal-rule',
    type: 'block',
    mdRegex: /^(?:---|\*\*\*|___)\s*$/,
    mdToHtml: '<hr>',
    htmlRegex: /<hr\s*\/?>/gi,
    htmlToMd: '---\n',
  },
  {
    name: 'fenced-code-block',
    type: 'block',
    multiLine: true,
    mdRegex: /^\s*```(\w*)/,
    mdToHtml: function(startIndex, lines) {
      // FIX: Capture the indentation of the opening fence to dedent the content correctly.
      const startMatch = lines[startIndex].match(/^(\s*)```(\w*)/);
      const indentLength = startMatch[1].length;
      const lang = startMatch[2];
      
      const contentLines = [];
      let i = startIndex + 1;

      // Collect and dedent content lines until the closing fence is found.
      while (i < lines.length && !lines[i].match(/^\s*```\s*$/)) {
        const line = lines[i];
        // Remove a number of leading characters equal to the opening fence's indentation.
        // String.prototype.slice() is safe for any length.
        const dedentedLine = line.slice(indentLength);
        contentLines.push(dedentedLine);
        i++;
      }

      // Join the processed lines back into a single string.
      const content = contentLines.join('\n');
      
      const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const langClass = lang ? ` class="language-${lang}"` : '';
      const linesConsumed = (i - startIndex) + (i < lines.length ? 1 : 0);

      // FIX: The previous .trim() call removed indentation from the first line only, causing
      // the misalignment. The new dedenting logic handles this for all lines, so trim() is removed.
      return {
        htmlParts: [`<pre><code${langClass}>`, escapeHtml(content), `</code></pre>`],
        linesConsumed,
      };
    },
    htmlRegex: /<pre><code(?: class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/gi,
    htmlToMd: (match, lang, content) => {
      const unescapeHtml = (text) => text.replace(/&lt;(\w+)&gt;/g, '$1')
                                         .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      return '```' + (lang || '') + '\n' + unescapeHtml(content) + '\n```\n';
    }
  },
  {
    name: 'blockquote',
    type: 'block',
    multiLine: true,
    mdRegex: /^>\s?(.*)/,
    mdToHtml: function(startIndex, lines, engine) {
      let contentLines = [];
      let i = startIndex;
      while (i < lines.length && lines[i].startsWith('>')) {
        contentLines.push(lines[i].substring(lines[i] === ' ' ? 2 : 1));
        i++;
      }
      const content = contentLines.join('\n');
      // Use the internal helper to get an array of parts for the blockquote's content
      const innerHtmlParts = engine._markdownToHtmlParts(content); 
      
      // Wrap the inner parts with blockquote tags, creating an array of parts for the whole blockquote
      const blockquoteHtmlParts = ['<blockquote>', ...innerHtmlParts, '</blockquote>'];
      
      return {
        htmlParts: blockquoteHtmlParts, // Return an array of parts
        linesConsumed: i - startIndex,
      };
    },
    htmlRegex: /<blockquote>([\s\S]*?)<\/blockquote>/gi,
    htmlToMd: (match, content) => {
      const markdownContent = content.replace(/<p>(.*?)<\/p>/g, '$1\n').replace(/<br\s*\/?>/g, '\n').trim();
      const lines = markdownContent.split('\n');
      return lines.filter(line => line.trim() !== '').map(line => `> ${line}`).join('\n');
    },
  },
  {
    name: 'unordered-list',
    type: 'block',
    multiLine: true,
    // FIX: Make the trigger regex stricter to avoid an infinite loop.
    // It now requires the list marker to be followed by a space or end-of-line,
    // preventing it from incorrectly matching lines like '***' or '*word*'.
    mdRegex: /^\s*[-*+](?=\s|$)/,
    mdToHtml: function(startIndex, lines, engine) {
      const listItemsHtml = []; // Array to hold <li> strings
      let i = startIndex;
      const itemRegex = /^\s*[-*+](?:\s+(?:\[([ xX])\]\s+)?(.*)|\s*)$/;
      while (i < lines.length) {
        const match = lines[i].match(itemRegex);
        if (!match) break;

        const [, check, content] = match;
        let itemHtml = '';
        if (check !== undefined) {
          const isChecked = check.toLowerCase() === 'x';
          itemHtml += `<input type="checkbox" disabled${isChecked ? ' checked' : ''}> `;
        }
        itemHtml += engine._processInlineMd(content || '');
        listItemsHtml.push(`<li>${itemHtml}</li>`);
        i++;
      }
      // Return parts for the ul, to avoid joining all <li>s into one massive string before the main engine joins them
      return { htmlParts: [`<ul>`, ...listItemsHtml, `</ul>`], linesConsumed: i - startIndex };
    },
    htmlRegex: /<ul>([\s\S]*?)<\/ul>/gi,
    htmlToMd: (match, content) => {
      let markdown = '';
      const itemRegex = /<li>([\s\S]*?)<\/li>/gi;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        // ACTUAL FIX: Use itemMatch to get the captured string content.
        let itemContent = itemMatch[1];
        const checkboxRegex = /<input type="checkbox"[^>]*>/;
        const checkboxMatch = itemContent.match(checkboxRegex);
        if (checkboxMatch) {
          const isChecked = /checked/.test(checkboxMatch);
          const cleanedContent = itemContent.replace(checkboxRegex, '').replace(/<br\s*\/?>/gi, '').trim();
          markdown += `- [${isChecked ? 'x' : ' '}] ${cleanedContent}\n`;
        } else {
          const cleanedContent = itemContent.replace(/<br\s*\/?>/gi, '').trim();
          if (cleanedContent) {
            markdown += `- ${cleanedContent}\n`;
          } else {
            markdown += '-  \n';
          }
        }
      }
      return markdown;
    },
  },
  {
    name: 'ordered-list',
    type: 'block',
    multiLine: true,
    mdRegex: /^\s*\d+\.\s+/,
    mdToHtml: function(startIndex, lines, engine) {
      const listItemsHtml = []; // Array to hold <li> strings
      let i = startIndex;
      const itemRegex = /^\s*\d+\.\s+(.*)/;
      while (i < lines.length && itemRegex.test(lines[i])) {
        const [, content] = lines[i].match(itemRegex);
        listItemsHtml.push(`<li>${engine._processInlineMd(content)}</li>`);
        i++;
      }
      // Return parts for the ol
      return { htmlParts: [`<ol>`, ...listItemsHtml, `</ol>`], linesConsumed: i - startIndex };
    },
    htmlRegex: /<ol>([\s\S]*?)<\/ol>/gi,
    htmlToMd: (match, content) => {
      let markdown = '';
      const itemRegex = /<li>([\s\S]*?)<\/li>/gi;
      let itemMatch;
      let counter = 1;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        // ACTUAL FIX: Use itemMatch to get the captured string content.
        let itemContent = itemMatch[1];
        const cleanedContent = itemContent.replace(/<br\s*\/?>/gi, '').trim();
        if (cleanedContent) {
          markdown += `${counter}. ${cleanedContent}\n`;
        } else {
          markdown += `${counter}.  \n`;
        }
        counter++;
      }
      return markdown;
    },
  },
  {
    name: 'paragraph',
    type: 'block',
    // mdRegex is intentionally omitted for md->html fallback handling.
    htmlRegex: /<p>([\s\S]*?)<\/p>/gi,
    htmlToMd: (match, content) => {
      // Convert inner <br> to spaces for markdown, trim whitespace.
      const markdownContent = content.replace(/<br\s*\/?>/gi, ' ').trim();
      // An empty <p></p> tag or a <p> containing only whitespace should not produce output.
      // The `empty-lines` rule has already handled legitimate <p><br></p> cases.
      return markdownContent ? markdownContent + '\n\n' : '';
    },
  },
];

export default blockRules;