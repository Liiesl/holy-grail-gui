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
    name: 'kanban',
    type: 'block',
    multiLine: true,
    mdRegex: /^\s*-\s*\[>\]\s*(.*)/, // --- FIX: Detect new start line ---
    mdToHtml: (startIndex, lines, engine) => {
      // --- START: NEW PARSING LOGIC ---
      const htmlParts = ['<div class="kanban-board" contenteditable="false">'];
      let i = startIndex + 1;
      let linesConsumed = 1; // For the start line '- [>] ...'

      let inColumn = false;

      const columnRegex = /^\s{2,4}-\s*\[>\]\s*(.*)/;
      const cardRegex = /^\s{4,}-\s*\[~\]\s*(.*)/;
      const endRegex = /^\s*-\s*\[<\]/;

      while (i < lines.length && !endRegex.test(lines[i])) {
        const line = lines[i];
        linesConsumed++;

        const columnMatch = line.match(columnRegex);
        const cardMatch = line.match(cardRegex);

        if (columnMatch) {
          if (inColumn) {
            // Close the previous column's card container and the column itself
            htmlParts.push('</div>'); // .kanban-cards
            htmlParts.push('<button class="kanban-add-card" contenteditable="false">+ Add Card</button>');
            htmlParts.push('</div>'); // .kanban-column
          }
          inColumn = true;
          const title = engine._processInlineMd(columnMatch[1].trim());
          htmlParts.push('<div class="kanban-column">');
          htmlParts.push(`<div class="kanban-column-title" contenteditable="true">${title}</div>`);
          htmlParts.push('<div class="kanban-cards">');
        } else if (cardMatch && inColumn) {
          const content = engine._processInlineMd(cardMatch[1].trim());
          htmlParts.push('<div class="kanban-card-wrapper" draggable="true">');
          // Use <br> for cards that are empty in markdown for better rendering
          htmlParts.push(`<div class="kanban-card" contenteditable="true">${content || '<br>'}</div>`);
          htmlParts.push('</div>');
        }
        // Lines that do not match the column or card pattern are ignored.
        i++;
      }

      if (inColumn) {
        // Close the last column
        htmlParts.push('</div>'); // .kanban-cards
        htmlParts.push('<button class="kanban-add-card" contenteditable="false">+ Add Card</button>');
        htmlParts.push('</div>'); // .kanban-column
      }

      // Add the button to create new columns at the end of the board.
      htmlParts.push('<button class="kanban-add-column" title="Add another column" contenteditable="false">+</button>');

      htmlParts.push('</div><!--KANBAN_END_MARKER-->'); // Close board and add marker

      if (i < lines.length && endRegex.test(lines[i])) {
        linesConsumed++; // Consume the end marker line ' - [<] ...'
      }

      return { htmlParts, linesConsumed };
      // --- END: NEW PARSING LOGIC ---
    },
    htmlRegex: /<div class="kanban-board"[^>]*>([\s\S]*?)<!--KANBAN_END_MARKER-->/gis,
    htmlToMd: (match, boardContent) => {
      // --- START: NEW SERIALIZATION LOGIC ---
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${boardContent}</div>`, 'text/html');
      const boardNode = doc.body.firstChild;

      let markdown = '- [>] Kanban Board\n';

      const columns = boardNode.querySelectorAll('.kanban-column');

      columns.forEach(column => {
        const titleNode = column.querySelector('.kanban-column-title');
        const titleText = titleNode ? titleNode.textContent.trim() : 'Untitled';
        markdown += `  - [>] ${titleText}\n`;

        const cardsContainer = column.querySelector('.kanban-cards');
        if (cardsContainer) {
          const cards = cardsContainer.querySelectorAll('.kanban-card');
          cards.forEach(card => {
            const cardText = card.textContent.trim();
            markdown += `    - [~] ${cardText}\n`;
          });
        }
      });

      markdown += '- [<] Kanban Board\n';
      return markdown;
      // --- END: NEW SERIALIZATION LOGIC ---
    },
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

      // FIX: Implement a placeholder for escaped pipes to prevent incorrect splitting.
      const pipePlaceholder = '\uE001'; // A character from the Private Use Area
      const protectEscapedPipes = (str) => str.replace(/\\\|/g, pipePlaceholder);
      const restoreEscapedPipes = (str) => str.replace(new RegExp(pipePlaceholder, 'g'), '|');
      
      const protectedHeader = protectEscapedPipes(headerLine.slice(1, -1));
      const headerCells = protectedHeader.split('|');
      const thsHtml = headerCells.map((cell, i) => {
        const style = columnStyles[i] ? `style="${columnStyles[i]}"` : '';
        const content = engine._processInlineMd(restoreEscapedPipes(cell).trim());
        return `<th ${style}>${content}</th>`;
      });
      const theadHtmlParts = [`<thead><tr>`, ...thsHtml, `</tr></thead>`];

      const tbodyRowsHtml = [];
      let currentRowIndex = startIndex + 2;
      while (currentRowIndex < lines.length && lines[currentRowIndex].trim().startsWith('|')) {
        const rowLine = lines[currentRowIndex].trim();
        // Protect, split, then restore for each cell.
        const protectedRow = protectEscapedPipes(rowLine.slice(1, -1));
        const bodyCells = protectedRow.split('|');
        const tdsHtml = bodyCells.map((cell, i) => {
          let tdStyle = '';
          if (columnStyles[i]) {
            const alignMatch = columnStyles[i].match(/text-align:\s*[^;]+/);
            if (alignMatch) tdStyle = `style="${alignMatch[0]}"`;
          }
          const content = engine._processInlineMd(restoreEscapedPipes(cell).trim());
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