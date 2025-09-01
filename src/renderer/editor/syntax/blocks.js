// src/renderer/syntax/blocks.js

/**
 * Syntax rules for standard block-level elements like headings.
 */
const blockRules = [
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
    name: 'fenced-code-block',
    type: 'block',
    multiLine: true,
    mdRegex: /^```(\w*)/,
    mdToHtml: function(startIndex, lines) {
      const startMatch = lines[startIndex].match(/^```(\w*)/);
      const lang = startMatch[1];
      let content = '';
      let i = startIndex + 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        content += lines[i] + '\n';
        i++;
      }
      const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const langClass = lang ? ` class="language-${lang}"` : '';
      const linesConsumed = (i - startIndex) + (i < lines.length ? 1 : 0);
      return {
        html: `<pre><code${langClass}>${escapeHtml(content.trim())}</code></pre>`,
        linesConsumed,
      };
    },
    htmlRegex: /<pre><code(?: class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/gi,
    htmlToMd: (match, lang, content) => {
      const unescapeHtml = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
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
        contentLines.push(lines[i].substring(lines[i][1] === ' ' ? 2 : 1));
        i++;
      }
      const content = contentLines.join('\n');
      const processedContent = engine.markdownToHtml(content); // Recursively parse content
      return {
        html: `<blockquote>${processedContent}</blockquote>`,
        linesConsumed: i - startIndex,
      };
    },
    htmlRegex: /<blockquote>([\s\S]*?)<\/blockquote>/gi,
    htmlToMd: (match, content) => {
      const markdownContent = content.replace(/<p>(.*?)<\/p>/g, '$1\n').replace(/<br\s*\/?>/g, '\n').trim();
      const lines = markdownContent.split('\n');
      return lines.map(line => `> ${line}`).join('\n') + '\n';
    },
  },
  {
    name: 'unordered-list',
    type: 'block',
    multiLine: true,
    mdRegex: /^\s*[-*+]/, // More lenient trigger to catch lines with just "-"
    mdToHtml: function(startIndex, lines, engine) {
      let html = '<ul>';
      let i = startIndex;
      // This regex handles: "- item", "- [x] item", and "-" (empty)
      const itemRegex = /^\s*[-*+](?:\s+(?:\[([ xX])\]\s+)?(.*)|\s*)$/;
      while (i < lines.length) {
        const match = lines[i].match(itemRegex);
        if (!match) break; // End of list

        const [, check, content] = match;
        let itemHtml = '';
        if (check !== undefined) {
          const isChecked = check.toLowerCase() === 'x';
          itemHtml += `<input type="checkbox" disabled${isChecked ? ' checked' : ''}> `;
        }
        itemHtml += engine._processInlineMd(content || '');
        html += `<li>${itemHtml}</li>`;
        i++;
      }
      html += '</ul>';
      return { html, linesConsumed: i - startIndex };
    },
    htmlRegex: /<ul>([\s\S]*?)<\/ul>/gi,
    htmlToMd: (match, content) => {
      let markdown = '';
      const itemRegex = /<li>([\s\S]*?)<\/li>/gi;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        let itemContent = itemMatch[1];
        const checkboxRegex = /<input type="checkbox"[^>]*>/;
        const checkboxMatch = itemContent.match(checkboxRegex);
        if (checkboxMatch) {
          const isChecked = /checked/.test(checkboxMatch[0]);
          const cleanedContent = itemContent.replace(checkboxRegex, '').replace(/<br\s*\/?>/gi, '').trim();
          markdown += `- [${isChecked ? 'x' : ' '}] ${cleanedContent}\n`;
        } else {
          const cleanedContent = itemContent.replace(/<br\s*\/?>/gi, '').trim();
          if (cleanedContent) {
            markdown += `- ${cleanedContent}\n`;
          } else {
            // For an empty li, output two spaces to survive the engine's final trim.
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
      let html = '<ol>';
      let i = startIndex;
      const itemRegex = /^\s*\d+\.\s+(.*)/;
      while (i < lines.length && itemRegex.test(lines[i])) {
        const [, content] = lines[i].match(itemRegex);
        html += `<li>${engine._processInlineMd(content)}</li>`;
        i++;
      }
      html += '</ol>';
      return { html, linesConsumed: i - startIndex };
    },
    htmlRegex: /<ol>([\s\S]*?)<\/ol>/gi,
    htmlToMd: (match, content) => {
      let markdown = '';
      const itemRegex = /<li>([\s\S]*?)<\/li>/gi;
      let itemMatch;
      let counter = 1;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        const itemContent = itemMatch[1];
        const cleanedContent = itemContent.replace(/<br\s*\/?>/gi, '').trim();
        if (cleanedContent) {
          markdown += `${counter}. ${cleanedContent}\n`;
        } else {
          // Use two spaces for empty items to survive the final trim.
          markdown += `${counter}.  \n`;
        }
        counter++;
      }
      return markdown;
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
];

export default blockRules;