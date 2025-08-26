from PySide6.QtWidgets import QTextEdit
from PySide6.QtGui import QTextCursor  # This import is essential
from PySide6.QtCore import Qt
from app.syntax_formatter import HGMDSyntaxFormatter
from app.slash_command_popup import SlashCommandPopup

class CustomTextEditor(QTextEdit):
    """
    A custom text editor that uses a syntax formatter for rendering
    and manipulates rich text directly.
    """
    def __init__(self):
        super().__init__()
        self.formatter = HGMDSyntaxFormatter(self.document())
        self.slash_command_popup = SlashCommandPopup(self)
        self.slash_command_popup.hide()
        self.slash_command_popup.command_selected.connect(self.execute_slash_command)

    def keyPressEvent(self, event):
        """Override to handle slash commands and escape special characters."""
        if self.slash_command_popup.isVisible():
            if event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return, Qt.Key.Key_Up, Qt.Key.Key_Down, Qt.Key.Key_Escape]:
                 self.slash_command_popup.keyPressEvent(event)
                 return

        if event.text() == '/':
            cursor = self.textCursor()
            pos_in_block = cursor.positionInBlock()
            block_text = cursor.block().text()

            # Condition 1: The slash is being typed on a new, empty line.
            is_on_new_line = (len(block_text) == 0)

            # Condition 2: The slash is surrounded by spaces or block boundaries.
            char_before_is_space = (pos_in_block == 0 or block_text[pos_in_block - 1].isspace())
            char_after_is_space = (pos_in_block == len(block_text) or (pos_in_block < len(block_text) and block_text[pos_in_block].isspace()))
            is_surrounded_by_space = char_before_is_space and char_after_is_space

            if is_on_new_line or is_surrounded_by_space:
                cursor_rect = self.cursorRect(cursor)
                popup_pos = self.mapToGlobal(cursor_rect.bottomLeft())
                self.slash_command_popup.move(popup_pos)
                self.slash_command_popup.show()
                self.slash_command_popup.setFocus()
                self.slash_command_popup.list_widget.setCurrentRow(0)
                # We will still insert the slash, and remove it upon command execution
                super().keyPressEvent(event)
                return
        
        if self.slash_command_popup.isVisible() and event.text() != "/":
            self.slash_command_popup.hide()

        if event.text() in ['*', '_', '#']:
            self.insertPlainText(f'\\{event.text()}')
            return
            
        super().keyPressEvent(event)

    def execute_slash_command(self, command):
        """Executes the selected slash command."""
        cursor = self.textCursor()
        
        # Remove the triggering '/' character
        cursor.deletePreviousChar()

        command = command.lower()
        if command == "bold":
            self.toggle_bold()
        elif command == "italic":
            self.toggle_italic()
        elif command == "underline":
            self.toggle_underline()
        elif command == "heading":
            self.toggle_heading()
        elif command == "widget":
            self.insert_widget()

    def insert_widget(self):
        """Inserts a widget placeholder."""
        cursor = self.textCursor()
        cursor.insertText("%%widget:new_widget%%")

    def toggle_heading(self):
        """Toggles the current line as a header."""
        cursor = self.textCursor()
        cursor.beginEditBlock()
        
        # CORRECTED: Use QTextCursor.StartOfLine directly for the operation
        cursor.movePosition(QTextCursor.StartOfLine)
        
        # CORRECTED: Use QTextCursor.EndOfLine for operation, and QTextCursor.KeepAnchor for mode
        cursor.movePosition(QTextCursor.EndOfLine, QTextCursor.KeepAnchor)
        line_text = cursor.selectedText()

        if line_text.startswith("# "):
            cursor.removeSelectedText()
            cursor.insertText(line_text[2:])
        else:
            cursor.removeSelectedText()
            cursor.insertText(f"# {line_text}")
        
        cursor.endEditBlock()

    def toggle_format(self, syntax):
        """Generic function to toggle formatting like **text** or *text*."""
        cursor = self.textCursor()
        if not cursor.hasSelection():
            return

        start = cursor.selectionStart()
        end = cursor.selectionEnd()
        selected_text = cursor.selectedText()
        
        full_text = self.toPlainText()
        preceding = full_text[max(0, start - len(syntax)) : start]
        following = full_text[end : end + len(syntax)]

        cursor.beginEditBlock()
        if preceding == syntax and following == syntax:
            # Un-format
            new_cursor = self.textCursor()
            new_cursor.setPosition(start - len(syntax))
            # This line was correct, it uses the MoveMode enum for the setPosition method
            new_cursor.setPosition(end + len(syntax), QTextCursor.KeepAnchor)
            new_cursor.removeSelectedText()
            new_cursor.insertText(selected_text)
        else:
            # Format
            new_text = f"{syntax}{selected_text}{syntax}"
            cursor.insertText(new_text)
        cursor.endEditBlock()


    def toggle_bold(self):
        self.toggle_format("**")

    def toggle_italic(self):
        self.toggle_format("*")

    def toggle_underline(self):
        self.toggle_format("__")
        
    def get_formatting_at_cursor(self):
        """Checks the formatting at the current cursor position."""
        cursor_pos = self.textCursor().position()
        block_text = self.textCursor().block().text()
        
        formats = set()
        spans = self.formatter.parser.get_format_spans(block_text)
        
        block_start_pos = self.textCursor().block().position()
        relative_cursor_pos = cursor_pos - block_start_pos
        
        for span_type, start, length in spans:
            if start < relative_cursor_pos < start + length:
                 formats.add(span_type)
        return formats