### **Tier 1: Foundational & Critical Features**

These features address the most significant limitations of the current table syntax and are essential for creating moderately complex, common layouts. They are the highest priority.

**1. Column Spanning (Colspan)**
*   **Concept:** Allow a single cell to merge horizontally across multiple columns.
*   **Syntax:** An empty cell `||` indicates that the previous non-empty cell in the row should span over it.
*   **Example:**
    ```markdown
    | Column 1  | Column 2 | Column 3 |
    |:----------|:--------:|:--------:|
    | Merged across two columns || C    |
    | Merged across all three columns |||
    ```
*   **Why it's useful:** Essential for creating headers that group sub-columns or for data cells that span multiple categories. This is a fundamental feature of HTML tables.
*   **Priority Rationale:** **CRITICAL**. This is arguably the single most requested feature for any advanced Markdown table implementation. Its absence prevents the creation of countless common table layouts (e.g., grouped headers). Implementation will require significant updates to both `widgets.js` (for parsing `||` into `<td colspan="...">`) and `table.js` (the `TableManager` must correctly handle column insertion/resizing on a spanned grid).

**2. Row Spanning (Rowspan)**
*   **Concept:** Allow a single cell to merge vertically across multiple rows.
*   **Syntax:** A caret `^` in a cell indicates it should be merged with the cell directly above it.
*   **Example:**
    ```markdown
    | Quarter | Month     | Profit |
    |:--------|:----------|:-------|
    | Q1      | January   | $100   |
    | ^       | February  | $150   |
    | ^       | March     | $175   |
    | Q2      | April     | $200   |
    ```
*   **Why it's useful:** Perfect for grouping related sub-items under a single category without repeating the category name on each row, leading to cleaner and more readable tables.
*   **Priority Rationale:** **CRITICAL**. The vertical counterpart to colspan. Equally fundamental for creating clean, professional tables that group related items. This has the same high-impact and implementation considerations as colspan, affecting both the parser and the interactive `TableManager`.  

**3. Block-Level Content in Cells**
*   **Concept:** Allow complex Markdown (like lists, code blocks, quotes) to be rendered inside a single table cell.
*   **Syntax:** Use indentation on subsequent lines to indicate that the content belongs to the cell in the row above it.
*   **Example:**
    ```markdown
    | Feature          | Description               |
    |:-----------------|:--------------------------|
    | Lists            |
    |                  | - First list item
    |                  | - Second list item
    | Code Blocks      |
    |                  | ```js
    |                  | console.log('Hello');
    |                  | ```
    ```
*   **Why it's useful:** This is a highly sought-after feature that removes a major limitation of standard Markdown tables, enabling the creation of truly rich and detailed comparison tables.
*   **Priority Rationale:** **CRITICAL**. For a WYSIWYG editor, this is a user expectation. A user will naturally press `Enter` in a table cell and expect to create a new paragraph or a list. The current implementation forces everything onto a single line. This feature is vital for making the editor feel intuitive and powerful. The main challenge will be the `htmlToMd` conversion, which must correctly serialize complex nested HTML within a `<td>` back to indented Markdown lines.

### **Tier 2: High-Impact Enhancements**

These features dramatically improve the semantic correctness, accessibility, and flexibility of tables. They should be tackled after the foundational features are complete.

**4. Row Headers (`<th>` in `<tbody>`)**
*   **Concept:** Designate the first cell of a body row as a header cell (`<th>`), scoped to that row.
*   **Syntax:** Start a row with `!|` instead of the standard `|`.
*   **Example:**
    ```markdown
    | Property    | Value        |
    |:------------|:-------------|
    !| **Name**    | HGMDEngine   |
    !| **Version** | 2.0          |
    !| **License** | MIT          |
    ```
*   **Why it's useful:** Creates semantically correct tables for key-value data, which greatly improves accessibility and machine readability.
*   **Priority Rationale:** **HIGH**. Crucial for accessibility and creating semantically correct key-value tables (e.g., a "specifications" table). This is a relatively simple parsing change in `widgets.js` that provides significant semantic value.

**5. Table Caption**
*   **Concept:** Add a proper `<caption`> element to the table for titles and descriptions.
*   **Syntax:** Place the caption text in square brackets `[...]` on the separator line.
*   **Example:**
    ```markdown
    | Region | Q1 Sales |
    |:-------|:---------| [Quarterly Sales Report] 100%
    | North  | $150,000 |
    | South  | $120,000 |
    ```
*   **Why it's useful:** Crucial for accessibility, as screen readers announce the caption to give users context before reading the table data.
*   **Priority Rationale:** **HIGH**. A standard, essential feature for accessible tables. It gives context to screen readers before they parse the data. It's a low-effort, high-reward feature that makes the tables more professional and compliant.

**5. Headerless Tables**
*   **Concept:** Create a simple table that contains only data rows (`<tbody>`) without a header (`<thead>`).
*   **Syntax:** Omit the header separator line (`|:--|:--|`) entirely.
*   **Example:**
    ```markdown
    | A1 | B1 | C1 |
    | A2 | B2 | C2 |
    | A3 | B3 | C3 |
    ```
*   **Why it's useful:** For simple, grid-like data where column headers are unnecessary or would be redundant.
*   **Priority Rationale:** **MEDIUM-HIGH**. Solves a common use case for displaying simple grid data where headers are redundant. This simplifies the `mdToHtml` logic in `widgets.js` by allowing it to create a table without a `<thead>` if no separator is found.   

**7. Table Footer (`<tfoot>`)**
*   **Concept:** Semantically distinguish the table's footer rows (for totals, summaries, etc.) from the main body.
*   **Syntax:** Use a double-line separator `|===|===|` to separate the `<tbody>` from the `<tfoot>`.
*   **Example:**
    ```markdown
    | Item      | Quantity | Price |
    |:----------|:--------:|------:|
    | Apples    | 5        | $5.00 |
    | Oranges   | 3        | $4.50 |
    |===========|==========|=======|
    | **Total** | 8        | $9.50 |
    ```
*   **Why it's useful:** Improves accessibility for screen readers and allows for distinct CSS styling of the header, body, and footer sections.
*   **Priority Rationale:** **MEDIUM**. Good semantic practice that completes the holy trinity of `<thead>`, `<tbody>`, and `<tfoot>`. It enables better styling and accessibility for summary rows. It's a clear next step after the core structure is solid.

### **Tier 3: Advanced Styling & Interactivity**

These features provide powerful customization options and add dynamic client-side behaviors that elevate the user experience.

**8. Table & Row Attributes**
*   **Concept:** Attach HTML attributes (like `class` or `id`) directly to the `<table>` element or to individual `<tr>` elements.
*   **Syntax:** Use curly braces `{...}`. Place on the separator line for table attributes; place at the end of a row for row attributes.
*   **Example:**
    ```markdown
    | Header 1 | Header 2 | {.header-class}
    |:---------|:---------| {.table-striped #my-table}
    | Value A  | Value B  |
    | Value C  | Value D  | {.highlight-row}
    ```
*   **Why it's useful:** Enables powerful custom styling via CSS and allows JavaScript to target specific tables or rows for manipulation.
*   **Priority Rationale:** **MEDIUM**. This is the gateway to custom styling and scripting. Allowing users to add classes like `.table-striped` or `.borderless` is a massive win for visual customization. It's a powerful, generic feature that unlocks many of the more specific styling features below (like Border Control).

**9. Cell-Specific Attributes**
*   **Concept:** Apply HTML attributes directly to an individual cell (`<th>` or `<td>`).
*   **Syntax:** Place curly braces `{...}` immediately after a cell's content.
*   **Example:**
    ```markdown
    | Normal Cell | A Red Cell {.text-red style="background: #fee;"} |
    |-------------|--------------------------------------------------|
    | Spans two columns {.colspan=2}                                 |
    ```
*   **Why it's useful:** Provides the ultimate level of control for styling, alignment, or even overriding structure (like colspan) on a per-cell basis.
*   **Priority Rationale:** **MEDIUM**. Provides the ultimate level of granular control. This could be an alternative way to implement `colspan` (`{.colspan=2}`) and would be essential for unique, one-off cell styles. This is a "power-user" feature that follows logically from table/row attributes.

**10. Responsive Table Behavior**
*   **Concept:** Define how a wide table should adapt to small screens to avoid breaking the page layout.
*   **Syntax:** A table-level attribute specifying the responsive mode, e.g., `{.responsive-scroll}` or `{.responsive-stack}`.
*   **Example:**
    ```markdown
    // Scroll mode: adds a horizontal scrollbar
    | Header 1 | Header 2 | Header 3 | Header 4 |
    |:---------|:---------|:---------|:---------| {.responsive-scroll}
    | Data...  | Data...  | Data...  | Data...  |

    // Stack mode: reflows cells into key-value blocks
    | Name  | Email          | Phone     |
    |:------|:---------------|:----------| {.responsive-stack}
    | Alice | alice@email.com| 555-1111  |
    ```
*   **Why it's useful:** This is critical for modern web design. It ensures that data tables are accessible and usable on any device, from desktops to mobile phones.
*   **Priority Rationale:** **MEDIUM**. In modern web development, responsiveness is not optional. Providing a simple switch for this behavior is a huge usability feature. The implementation would be primarily CSS/JS, triggered by the class added during the `mdToHtml` conversion.

**11. Sortable Tables**
*   **Concept:** Automatically add client-side sorting functionality to the table headers.
*   **Syntax:** A single table-level attribute, such as `{.sortable}`.
*   **Example:**
    ```markdown
    | Name      | Age | City      |
    |:----------|:----|:----------| {.sortable}
    | John      | 34  | New York  |
    | Alice     | 29  | London    |
    | Bob       | 41  | Paris     |
    ```
*   **Why it's useful:** A huge usability improvement for data-heavy tables, allowing users to reorder data to find patterns or specific entries without a page reload.
*   **Priority Rationale:** **MEDIUM-LOW**. A massive quality-of-life improvement for any data-heavy table. Like responsiveness, this is a JS-driven enhancement activated by a simple Markdown attribute, fitting well with the app's interactive nature.

**12. Vertical Alignment**
*   **Concept:** Control the vertical alignment of content within entire columns.
*   **Syntax:** Add a modifier to the separator line's colon syntax: `^` for top, `~` for middle, `_` for bottom.
*   **Example:**
    ```markdown
    | Top-Aligned   | Middle-Aligned | Bottom-Aligned  |
    |:--------------^|:--------------~:|:---------------_|
    | Text at top   | This text is   | Text at bottom  |
    |               | vertically     |                 |
    |               | centered.      |                 |
    ```
*   **Why it's useful:** Ensures a clean and professional layout, especially in tables where rows have different heights due to multi-line content or images.
*   **Priority Rationale:** **LOW**. A useful styling refinement, especially once "Block-Level Content" is implemented and row heights become variable. It's less critical than the structural features but important for a polished final look.

### **Tier 4: Niche & "Nice-to-Have" Features**

These are powerful but cater to more specific use cases or can be accomplished through other means. They should be considered after all higher-tier features are stable.

**13. Explicit Multi-line Content**
*   **Concept:** Provide a simple, explicit way to add line breaks (`<br>`) within a cell's content.
*   **Syntax:** Use a double backslash `\\` to signify a hard line break.
*   **Example:**
    ```markdown
    | Contact Info        | Address                       |
    |:--------------------|:------------------------------|
    | John Doe            | 123 Maple Street \\ Anytown, USA |
    ```
*   **Why it's useful:** A simple and intuitive solution to a very common formatting need, making it easy to format addresses, multiple contact points, or short lists within a cell.
*   **Priority Rationale:** **LOW**. Useful, but largely superseded by the much more powerful "Block-Level Content" feature. This is a simpler, non-structural alternative for quick line breaks.

**14. Fixed/Sticky Header**
*   **Concept:** Make the table header (`<thead>`) remain visible at the top of the screen as the user scrolls through a long table.
*   **Syntax:** A table-level attribute like `{.fixed-header}`.
*   **Example:**
    ```markdown
    | ID | Name | Status | ... (many more columns) |
    |:---|:-----|:-------|:------------------------| {.fixed-header}
    | 1  | Foo  | Active | ...                     |
    ... (hundreds of rows) ...
    ```
*   **Why it's useful:** Prevents the user from losing the context of the data columns when scrolling through large datasets, improving readability significantly.
*   **Priority Rationale:** **LOW**. A valuable UI enhancement for very large tables, but it's a niche requirement compared to core structure and responsiveness.

**15. Automatic Row Numbering**
*   **Concept:** Automatically generate a numbered first column for the table rows.
*   **Syntax:** Use a reserved, special header for the first column, like `| # |` or `| No. |`.
*   **Example:**
    ```markdown
    | # | Task          | Status      |
    |:-:|:--------------|:------------|
    |   | Write Docs    | In Progress |
    |   | Fix Bug #123  | Done        |
    ```
*   **Why it's useful:** Saves the author from manual counting and automatically handles renumbering when rows are added, removed, or sorted.
*   **Priority Rationale:** **VERY LOW**. A convenient automation, but not a feature that unlocks new capabilities. It saves authoring time but isn't a structural or presentational necessity.

**16. Data-driven Generation (from CSV/JSON)**
*   **Concept:** Generate an entire HTML table from a structured data block like CSV or JSON.
*   **Syntax:** Use a fenced code block-like container to wrap the raw data.
*   **Example:**
    ```
    ::table{.from-csv .has-header}
    Name,Age,City
    John,34,New York
    Alice,29,London
    Bob,41,Paris
    ::
    ```
*   **Why it's useful:** A huge time-saver. It allows users to copy-paste data directly from spreadsheets or other data sources without having to manually format it with Markdown pipe syntax.
*   **Priority Rationale:** **VERY LOW**. This is essentially an *importer* or an alternative syntax, not an enhancement to the existing pipe-table functionality. While extremely useful for certain workflows, it's outside the scope of improving the core table editor experience.

**19. Calculated Columns / Totals**
*   **Concept:** Perform simple calculations (sum, average, count) on a column of numeric data.
*   **Syntax:** Use a special formula syntax in a cell, such as `|=SUM|`, `|=AVG|`, or `|=COUNT|`, typically placed in a footer.
*   **Example:**
    ```markdown
    | Item      | Price  | Quantity | Subtotal |
    |:----------|:------:|:--------:|:--------:|
    | Apples    | 1.00   | 5        | 5.00     |
    | Oranges   | 1.50   | 3        | 4.50     |
    |===========|========|==========|==========|
    | **Total** | |=AVG| |=SUM|     |=SUM|     |
    ```
*   **Why it's useful:** Transforms the table into a mini-spreadsheet, enabling automatic calculations that are always up-to-date with the data. Incredibly powerful for reports and summaries.
*   **Priority Rationale:** **VERY LOW**. This feature moves the editor from a content tool to a data-processing tool (a mini-spreadsheet). This is a massive increase in complexity for a very specialized use case.

**The following features are effectively covered by the higher-priority "Attributes" features and can be considered redundant as separate items:**

**Column Groups (`<colgroup>`)** Can be implemented via attributes on separator cells.
*   **Concept:** Define attributes for entire columns using the semantic `<colgroup>` and `<col>` HTML elements.
*   **Syntax:** Use curly braces `{...}` on each corresponding cell of the separator line.
*   **Example:**
    ```markdown
    | Item        | SKU         | In Stock |
    |:------------{.item-col}|:------------{.sku-col style="width: 150px;"}|:--------:{.numeric-col}
    | Gadget      | G-123       | 500      |
    ```
*   **Why it's useful:** Creates cleaner, more semantic HTML and is the browser-preferred method for applying styles like width to entire table columns efficiently.

**Border Control** Can be implemented via classes added with the table attributes feature.
*   **Concept:** Apply pre-defined border styles to the table for different visual presentations.
*   **Syntax:** A keyword added to the table-level attributes, like `{.borderless}` or `{.rows-only}`.
*   **Example:**
    ```markdown
    | A | B |
    |---|---| {.borderless}
    | 1 | 2 |

    | A | B |
    |---|---| {.rows-only}
    | 1 | 2 |
    ```
*   **Why it's useful:** Allows authors to easily switch between a standard data grid, a row-separated list, or a completely invisible table used for layout.

**Client-Side Filtering** Can be implemented with a table attribute and corresponding JS.
*   **Concept:** Add an interactive search box that dynamically filters table rows based on user input.
*   **Syntax:** A table-level attribute, like `{.filterable}`, with an optional placeholder `{.filterable placeholder="Filter employees..."}`.
*   **Example:**
    ```markdown
    | Name      | Department  | Status  |
    |:----------|:------------|:--------| {.filterable}
    | John      | Sales       | Active  |
    | Alice     | Engineering | Active  |
    | Charlie   | Sales       | Inactive|
    ```
*   **Why it's useful:** Empowers users to quickly find the information they need in large tables, dramatically improving the user experience.

**Column Templating / Auto-Linking** Can be implemented via a special attribute on a header cell.
*   **Concept:** Define a URL or display template for an entire column, where each cell's content is used as a variable.
*   **Syntax:** Use a special attribute in the header cell, where `$1` represents the cell's content: `{link:/users/$1}`.
*   **Example:**
    ```markdown
    | User Profile {link:/users/$1} | GitHub Repo {link:https://github.com/$1} |
    |:------------------------------|:-----------------------------------------|
    | jdoe                          | hgmd-engine                              |
    | alice_dev                     | awesome-project                          |
    ```
*   **Why it's useful:** Drastically reduces repetition (DRY principle). Perfect for automatically generating large lists of links to profiles, issues, or product pages from a simple list of IDs.