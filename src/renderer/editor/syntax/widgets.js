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
    // A loose regex to identify a potential table start.
    // The mdToHtml function does the real validation by checking the next line.
    mdRegex: /^\|.*\|/,
    mdToHtml: (startIndex, lines, engine) => {
      const headerLine = lines[startIndex].trim();
      const separatorLine = lines[startIndex + 1] ? lines[startIndex + 1].trim() : '';

      // The second line must be a valid separator line for it to be a table.
      const isSeparatorLine = /^\|(?:\s*:?-[^|]*:?\s*\|)+/.test(separatorLine);
      if (!separatorLine || !isSeparatorLine) {
        // This is not a table. The engine matched this rule, so we must process
        // the line to avoid an infinite loop. We'll render it as a paragraph.
        const pContent = engine._processInlineMd(headerLine);
        return { html: `<p>${pContent}</p>`, linesConsumed: 1 };
      }

      // --- It's a valid table, proceed with parsing ---
      let linesConsumed = 2; // Header + Separator

      // 1. Parse table-wide width from the end of the separator line (e.g., "|...| 100vw")
      let tableStyle = '';
      const tableOptionsMatch = separatorLine.match(/\|\s*([^\s|]+)\s*$/);
      if (tableOptionsMatch) {
        tableStyle = `style="width: ${tableOptionsMatch[1]};"`;
      }

      // 2. Parse column styles from the separator cells
      const separatorCells = separatorLine
        .replace(/\|\s*[^|\s]+\s*$/, '|') // Remove table-wide option before splitting
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

      // 3. Build the <thead> from the header line
      const headerCells = headerLine.slice(1, -1).split('|');
      let theadHtml = '<thead><tr>';
      headerCells.forEach((cell, i) => {
        const style = columnStyles[i] ? `style="${columnStyles[i]}"` : '';
        const content = engine._processInlineMd(cell.trim());
        theadHtml += `<th ${style}>${content}</th>`;
      });
      theadHtml += '</tr></thead>';

      // 4. Build the <tbody> from the subsequent lines
      let tbodyHtml = '<tbody>';
      let currentRowIndex = startIndex + 2;
      while (currentRowIndex < lines.length && lines[currentRowIndex].trim().startsWith('|')) {
        const rowLine = lines[currentRowIndex].trim();
        const bodyCells = rowLine.slice(1, -1).split('|');
        tbodyHtml += '<tr>';
        bodyCells.forEach((cell, i) => {
          let tdStyle = '';
          if (columnStyles[i]) {
            const alignMatch = columnStyles[i].match(/text-align:\s*[^;]+/);
            if (alignMatch) tdStyle = `style="${alignMatch[0]}"`;
          }
          const content = engine._processInlineMd(cell.trim());
          tbodyHtml += `<td ${tdStyle}>${content}</td>`;
        });
        tbodyHtml += '</tr>';
        currentRowIndex++;
        linesConsumed++;
      }
      tbodyHtml += '</tbody>';

      // 5. Assemble the final table
      const tableHtml = `<table ${tableStyle}>${theadHtml}${tbodyHtml}</table>`;
      return { html: tableHtml, linesConsumed };
    },
    // --- FIX: Added \s* to tolerate whitespace between elements from innerHTML ---
    htmlRegex: /<table([^>]*)>\s*<thead>(.*?)<\/thead>\s*<tbody>(.*?)<\/tbody>\s*<\/table>/gis,
    htmlToMd: (match, tableAttrs, headContent, bodyContent) => {
      let md = '';

      // 1. Parse global table width from the <table> tag's style attribute
      let globalWidth = '';
      const styleMatch = tableAttrs.match(/style=".*?width:\s*([^;"]+)/);
      if (styleMatch) {
        globalWidth = ` ${styleMatch[1]}`;
      }

      // 2. Parse <thead> to build markdown header and separator lines
      const mdHeaderParts = [];
      const mdSeparatorParts = [];

      const headRowMatch = headContent.match(/<tr[^>]*>(.*?)<\/tr>/is);
      if (!headRowMatch) return ''; // Should not happen with our own generated HTML
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

      // 3. Parse <tbody> to build markdown body rows
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