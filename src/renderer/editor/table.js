// src/renderer/table.js

/**
 * Manages interactive table resizing and row/column insertion within the editor.
 */
export class TableManager {
  /**
   * @param {Editor} editor - The main editor instance.
   */
  constructor(editor) {
    this.editor = editor;
    this.editorEl = editor.editorEl;
    this.editorContainer = editor.container; // For positioning inserters

    this.isResizing = false;
    this.resizingColumn = null; // The <th> of the column being resized
    this.resizingTable = null; // The <table> being resized
    this.hoveredTable = null; // The table being hovered for whole-table resize
    this.hoveredColumnIndex = -1; // Index of the column being hovered for resize
    this.lastHoveredTable = null; // The table containing the hovered column
    this.startX = 0;
    this.startWidth = 0;

    this.colInserter = null;
    this.rowInserter = null;
    this.insertTarget = null; // { table, index, type: 'col' | 'row' }

    // Bind `this` for event handlers
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleColumnInsert = this.handleColumnInsert.bind(this);
    this.handleRowInsert = this.handleRowInsert.bind(this);
  }

  /**
   * Attaches the necessary event listeners and creates UI elements.
   */
  init() {
    this.editorEl.addEventListener('mousemove', this.handleMouseMove);
    this.editorEl.addEventListener('mousedown', this.handleMouseDown);
    // mouseup is added to the document during a drag to ensure it's captured globally
    this.createInserters();
  }

  /**
   * Creates the floating `+` buttons for adding rows/columns.
   */
  createInserters() {
    // Column inserter is now a single button element
    this.colInserter = document.createElement('button');
    this.colInserter.id = 'table-col-inserter';
    this.colInserter.className = 'hidden';
    this.colInserter.textContent = '+';
    this.colInserter.title = 'Insert column';
    this.colInserter.addEventListener('click', this.handleColumnInsert);

    // Row inserter is also a single button element
    this.rowInserter = document.createElement('button');
    this.rowInserter.id = 'table-row-inserter';
    this.rowInserter.className = 'hidden';
    this.rowInserter.textContent = '+';
    this.rowInserter.title = 'Insert row';
    this.rowInserter.addEventListener('click', this.handleRowInsert);

    this.editorContainer.appendChild(this.colInserter);
    this.editorContainer.appendChild(this.rowInserter);
  }

  /**
   * Handles mouse movement over the editor. It detects if the cursor is
   * near a resizable or insertable area.
   * @param {MouseEvent} e
   */
  handleMouseMove(e) {
    if (this.isResizing) {
      // --- DRAG HANDLER ---
      const dx = e.clientX - this.startX;
      if (this.resizingTable) {
        const newWidth = this.startWidth + dx;
        if (newWidth > 20) this.resizingTable.style.width = `${newWidth}px`;
      } else if (this.resizingColumn) {
        const newWidth = this.startWidth + dx;
        if (newWidth > 20) this.resizingColumn.style.width = `${newWidth}px`;
      }
      return;
    }

    // --- HOVER HANDLER to detect resizable/insertable areas ---
    const target = e.target;
    const targetTable = target.closest('table');

    // If we're not over a table or editor is readonly, clean up and exit.
    if (!targetTable || this.editorEl.contentEditable === 'false') {
      this.clearAllHoverStates();
      return;
    }

    const tableRect = targetTable.getBoundingClientRect();

    // A. Check for whole-table resize hover (right border of table)
    if (Math.abs(e.clientX - tableRect.right) < 5) {
      this.clearAllHoverStates();
      this.editorEl.style.cursor = 'col-resize';
      targetTable.classList.add('table-resizing-hover');
      this.hoveredTable = targetTable;
      return;
    }

    // B. Check for column resize hover (ONLY in thead)
    const targetHeaderCell = target.closest('thead th');
    if (targetHeaderCell && targetHeaderCell.nextElementSibling !== null && Math.abs(e.clientX - targetHeaderCell.getBoundingClientRect().right) < 5) {
      this.clearAllHoverStates();
      this.editorEl.style.cursor = 'col-resize';
      this.updateColumnHighlight(targetTable, targetHeaderCell.cellIndex);
      return;
    }

    // At this point, no resize is happening. Check for inserts.
    const targetCell = target.closest('th, td');
    if (!targetCell) {
      this.clearAllHoverStates();
      return;
    }

    const cellRect = targetCell.getBoundingClientRect();
    const editorRect = this.editorContainer.getBoundingClientRect();

    // C. Check for column INSERT hover (left border of cells in tbody)
    if (targetCell.closest('tbody') && targetCell.cellIndex > 0 && Math.abs(e.clientX - cellRect.left) < 6) {
      this.clearAllHoverStates();
      const left = cellRect.left - editorRect.left - (this.colInserter.offsetWidth / 2);
      this.colInserter.style.top = `${tableRect.top - editorRect.top}px`;
      this.colInserter.style.left = `${left}px`;
      this.colInserter.style.height = `${tableRect.height}px`;
      this.colInserter.classList.remove('hidden');
      this.insertTarget = { table: targetTable, index: targetCell.cellIndex, type: 'col' };
      return;
    }

    // D. Check for row INSERT hover (top border of any row except the first)
    const tableRow = targetCell.parentElement;
    if (tableRow && tableRow.rowIndex > 0 && Math.abs(e.clientY - cellRect.top) < 6) {
      this.clearAllHoverStates();
      const top = cellRect.top - editorRect.top - (this.rowInserter.offsetHeight / 2);
      this.rowInserter.style.top = `${top}px`;
      this.rowInserter.style.left = `${tableRect.left - editorRect.left}px`;
      this.rowInserter.style.width = `${tableRect.width}px`;
      this.rowInserter.classList.remove('hidden');
      this.insertTarget = { table: targetTable, index: tableRow.rowIndex, type: 'row' };
      return;
    }

    // E. No action found, clear everything
    this.clearAllHoverStates();
  }

  /**
   * Handles the mousedown event to initiate a resize operation.
   * @param {MouseEvent} e
   */
  handleMouseDown(e) {
    if (this.editorEl.style.cursor !== 'col-resize') return;
    this.hideInserters();
    e.preventDefault();

    if (this.hoveredTable) {
      this.isResizing = true;
      this.resizingTable = this.hoveredTable;
      this.startX = e.clientX;
      this.startWidth = this.resizingTable.offsetWidth;
    } else {
      const targetCell = e.target.closest('th'); // Should only be a TH now
      if (!targetCell) return;
      const table = targetCell.closest('table');
      const cellIndex = targetCell.cellIndex;
      const headerCell = table.querySelector(`thead th:nth-child(${cellIndex + 1})`);
      if (!headerCell) return;

      this.isResizing = true;
      this.resizingColumn = headerCell;
      this.startX = e.clientX;
      this.startWidth = this.resizingColumn.offsetWidth;
    }

    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  /**
   * Handles the mouseup event to end a resize operation.
   * @param {MouseEvent} e
   */
  handleMouseUp(e) {
    if (!this.isResizing) return;
    this.isResizing = false;
    this.resizingColumn = null;
    this.resizingTable = null;

    this.clearAllHoverStates();

    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);

    this.editor.handleInput();
  }

  /**
   * Inserts a new column into the target table.
   */
  handleColumnInsert() {
    if (!this.insertTarget || this.insertTarget.type !== 'col') return;
    const { table, index } = this.insertTarget;
    for (const row of table.rows) {
      const isHeader = row.parentElement.tagName === 'THEAD';
      const cell = document.createElement(isHeader ? 'th' : 'td');
      cell.appendChild(document.createElement('br')); // Ensures contenteditable works
      row.insertBefore(cell, row.cells[index] || null);
    }
    this.editor.handleInput();
    this.hideInserters();
  }

  /**
   * Inserts a new row into the target table.
   */
  handleRowInsert() {
    if (!this.insertTarget || this.insertTarget.type !== 'row') return;
    const { table, index } = this.insertTarget;
    const newRow = table.insertRow(index);
    const colCount = table.rows[0]?.cells.length || 1;
    for (let i = 0; i < colCount; i++) {
      const cell = newRow.insertCell();
      cell.appendChild(document.createElement('br'));
    }
    this.editor.handleInput();
    this.hideInserters();
  }

  /**
   * Highlights all cells in a specific column for resizing.
   * @param {HTMLTableElement} table
   * @param {number} colIndex
   */
  updateColumnHighlight(table, colIndex) {
    if (this.lastHoveredTable === table && this.hoveredColumnIndex === colIndex) return;
    this.clearColumnHighlight();
    this.lastHoveredTable = table;
    this.hoveredColumnIndex = colIndex;
    table.querySelectorAll('tr').forEach(row => {
      if (row.cells[colIndex]) {
        row.cells[colIndex].classList.add('cell-resizing-hover');
      }
    });
  }

  /** Removes highlighting from any previously highlighted column. */
  clearColumnHighlight() {
    if (this.lastHoveredTable && this.hoveredColumnIndex > -1) {
      this.lastHoveredTable.querySelectorAll('tr').forEach(row => {
        if (row.cells[this.hoveredColumnIndex]) {
          row.cells[this.hoveredColumnIndex].classList.remove('cell-resizing-hover');
        }
      });
    }
    this.hoveredColumnIndex = -1;
    this.lastHoveredTable = null;
  }
  
  /** Hides the row/column inserter UI. */
  hideInserters() {
    this.colInserter?.classList.add('hidden');
    this.rowInserter?.classList.add('hidden');
    this.insertTarget = null;
  }
  
  /** Resets all hover-related UI states (cursors, highlights, inserters). */
  clearAllHoverStates() {
    this.editorEl.style.cursor = '';
    this.clearColumnHighlight();
    this.hideInserters();
    if (this.hoveredTable) {
      this.hoveredTable.classList.remove('table-resizing-hover');
      this.hoveredTable = null;
    }
  }
}