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
  {
    name: 'table',
    type: 'block',
    multiLine: true,
    mdRegex: /^\|.*\|/,
    mdToHtml: (startIndex, lines, engine) => {
      const headerLine = lines[startIndex].trim();
      const separatorLine = lines[startIndex + 1] ? lines[startIndex + 1].trim() : '';

      const isSeparatorLine = /^\|(?:\s*:?-[^|]*:?\s*\|)+/.test(separatorLine);
      if (!separatorLine || !isSeparatorLine) {
        const pContent = engine._processInlineMd(headerLine);
        return { htmlParts: [`<p>${pContent}</p>`], linesConsumed: 1 }; // Return as parts array
      }

      let linesConsumed = 2;

      let tableStyle = '';
      const tableOptionsMatch = separatorLine.match(/\|\s*([^\s|]+)\s*$/);
      if (tableOptionsMatch) {
        tableStyle = `style="width: ${tableOptionsMatch[1]};"`;
      }

      const separatorCells = separatorLine
        .replace(/\|\s*[^|\s]+\s*$/, '|')
        .trim().slice(1, -1).split('|');

      const columnStyles = separatorCells.map(cell => {
        const trimmedCell = cell.trim();
        let align = '';
        if (trimmedCell.startsWith(':') && trimmedCell.endsWith(':')) align = 'center';
        else if (trimmedCell.startsWith(':')) align = 'left';
        else if (trimmedCell.endsWith(':')) align = 'right';

        const widthMatch = trimmedCell.match(/-([^-]+)-/);
        const width = widthMatch ? widthMatch[1] : null;

        let style = '';
        if (align) style += `text-align: ${align};`;
        if (width) style += `width: ${width};`;
        return style;
      });

      const headerCells = headerLine.slice(1, -1).split('|');
      const thsHtml = headerCells.map((cell, i) => {
        const style = columnStyles[i] ? `style="${columnStyles[i]}"` : '';
        const content = engine._processInlineMd(cell.trim());
        return `<th ${style}>${content}</th>`;
      });
      const theadHtmlParts = [`<thead><tr>`, ...thsHtml, `</tr></thead>`];

      const tbodyRowsHtml = [];
      let currentRowIndex = startIndex + 2;
      while (currentRowIndex < lines.length && lines[currentRowIndex].trim().startsWith('|')) {
        const rowLine = lines[currentRowIndex].trim();
        const bodyCells = rowLine.slice(1, -1).split('|');
        const tdsHtml = bodyCells.map((cell, i) => {
          let tdStyle = '';
          if (columnStyles[i]) {
            const alignMatch = columnStyles[i].match(/text-align:\s*[^;]+/);
            if (alignMatch) tdStyle = `style="${alignMatch[0]}"`;
          }
          const content = engine._processInlineMd(cell.trim());
          return `<td ${tdStyle}>${content}</td>`;
        });
        tbodyRowsHtml.push(`<tr>`, ...tdsHtml, `</tr>`);
        currentRowIndex++;
        linesConsumed++;
      }
      const tbodyHtmlParts = [`<tbody>`, ...tbodyRowsHtml, `</tbody>`];

      // Assemble the final table as an array of parts
      const tableHtmlParts = [`<table ${tableStyle}>`, ...theadHtmlParts, ...tbodyHtmlParts, `</table>`];
      return { htmlParts: tableHtmlParts, linesConsumed }; // Return parts array
    },
    htmlRegex: /<table([^>]*)>\s*<thead>(.*?)<\/thead>\s*<tbody>(.*?)<\/tbody>\s*<\/table>/gis,
    htmlToMd: (match, tableAttrs, headContent, bodyContent) => {
      let md = '';

      let globalWidth = '';
      const styleMatch = tableAttrs.match(/style=".*?width:\s*([^;"]+)/);
      if (styleMatch) {
        globalWidth = ` ${styleMatch[1]}`;
      }

      const mdHeaderParts = [];
      const mdSeparatorParts = [];

      const headRowMatch = headContent.match(/<tr[^>]*>(.*?)<\/tr>/is);
      if (!headRowMatch) return '';
      const headerCells = headRowMatch[1].match(/<th[^>]*>.*?<\/th>/gis);
      if (!headerCells) return '';

      headerCells.forEach(thHtml => {
        const contentMatch = thHtml.match(/<th[^>]*>(.*?)<\/th>/is);
        mdHeaderParts.push(` ${contentMatch ? contentMatch[1] : ''} `);

        const thStyleMatch = thHtml.match(/style="([^"]+)"/);
        let align = '', width = '';
        if (thStyleMatch) {
          const style = thStyleMatch[1];
          const alignMatch = style.match(/text-align:\s*(left|center|right)/);
          if (alignMatch) align = alignMatch[1];
          const widthMatch = style.match(/width:\s*([^;]+)/);
          if (widthMatch) width = widthMatch[1];
        }

        let separator = width ? `-${width}-` : '---';
        if (align === 'center') separator = `:${separator}:`;
        else if (align === 'left') separator = `:${separator}`;
        else if (align === 'right') separator = `${separator}:`;
        mdSeparatorParts.push(separator);
      });

      md += `|${mdHeaderParts.join('|')}|\n`;
      md += `| ${mdSeparatorParts.join(' | ')} |${globalWidth}\n`;

      const bodyRows = bodyContent.match(/<tr[^>]*>.*?<\/tr>/gis);
      if (bodyRows) {
        bodyRows.forEach(trHtml => {
          const bodyCells = trHtml.match(/<td[^>]*>.*?<\/td>/gis);
          if (!bodyCells) return;
          const mdBodyParts = bodyCells.map(tdHtml => {
            const contentMatch = tdHtml.match(/<td[^>]*>(.*?)<\/td>/is);
            return ` ${contentMatch ? contentMatch[1] : ''} `;
          });
          md += `|${mdBodyParts.join('|')}|\n`;
        });
      }

      return md;
    },
  },
];

export default widgetRules;