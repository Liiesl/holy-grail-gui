// src/renderer/syntax/inlineStyles.js

/**
 * Syntax rules for inline text styling (bold, italic, etc.).
 * Escaped characters are handled by the HGMDEngine's _processInlineMd method
 * before these rules are applied.
 */
const inlineStyleRules = [
  // The 'escape' rule has been removed from here. Its logic is now
  // centralized in the HGMDEngine._processInlineMd method.
  {
    name: 'code',
    type: 'inline',
    mdRegex: /`(.+?)`/g,
    mdToHtml: '<code>$1</code>',
    htmlRegex: /<code>(.*?)<\/code>/gi,
    htmlToMd: '`$1`',
  },
  {
    name: 'link',
    type: 'inline',
    mdRegex: /\[([^\]]+)\]\(([^)]+)\)/g,
    mdToHtml: '<a href="$2">$1</a>',
    htmlRegex: /<a href="(.*?)">(.*?)<\/a>/gi,
    htmlToMd: '[$2]($1)',
  },
  {
    name: 'bold',
    type: 'inline',
    mdRegex: /\*\*(.*?)\*\*/g,
    mdToHtml: '<strong>$1</strong>',
    htmlRegex: /<strong>(.*?)<\/strong>/gi,
    htmlToMd: '**$1**',
  },
  {
    name: 'italic',
    type: 'inline',
    mdRegex: /\*(.*?)\*/g,
    mdToHtml: '<em>$1</em>',
    htmlRegex: /<em>(.*?)<\/em>/gi,
    htmlToMd: '*$1*',
  },
  {
    name: 'strikethrough',
    type: 'inline',
    mdRegex: /~~(.*?)~~/g,
    mdToHtml: '<s>$1</s>',
    htmlRegex: /<s>(.*?)<\/s>/gi,
    htmlToMd: '~~$1~~',
  },
  {
    name: 'underline',
    type: 'inline',
    mdRegex: /\+\+(.*?)\+\+/g,
    mdToHtml: '<u>$1</u>',
    htmlRegex: /<u>(.*?)<\/u>/gi,
    htmlToMd: '++$1++',
  },
  {
    name: 'highlight',
    type: 'inline',
    mdRegex: /==(.*?)==/g,
    mdToHtml: '<mark>$1</mark>',
    htmlRegex: /<mark>(.*?)<\/mark>/gi,
    htmlToMd: '==$1==',
  },
];

export default inlineStyleRules;