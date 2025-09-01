// src/renderer/syntax/widgets.js

/**
 * Syntax rules for special "widget-like" block elements.
 */
const widgetRules = [
  {
    name: 'alert',
    type: 'block',
    mdRegex: /^::(info|warning|danger)\[(.*?)\]$/,
    mdToHtml: (match, type, content) => `<div class="alert alert-${type}">${content}</div>`, // Content in alerts is not processed for inline styles
    htmlRegex: /<div class="alert alert-(info|warning|danger)">(.*?)<\/div>/gi,
    htmlToMd: '::$1[$2]\n',
  },
];

export default widgetRules;