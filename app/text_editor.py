from PySide6.QtWidgets import QTextEdit
from PySide6.QtGui import QTextCursor
from PySide6.QtCore import Qt
from app.syntax_formatter import HGMDSyntaxFormatter
from app.slash_command_popup import SlashCommandPopup
import re

class CustomTextEditor(QTextEdit):
    """
    A custom text editor that uses a syntax formatter for rendering
    and manipulates rich text directly.
    """
    def __init__(self):
        super().__init__()
        self.formatter = HGMDSyntaxFormatter(self.document())
        # The popup now receives a reference to the editor to query its state.
        self.slash_command_popup = SlashCommandPopup(self)
        self.slash_command_popup.command_selected.connect(self.execute_slash_command)

        # Attributes for managing cursor movement over syntax
        self._last_cursor_pos = 0
        self._is_programmatically_moving_cursor = False
        self.cursorPositionChanged.connect(self.handle_cursor_position_change)

    def handle_cursor_position_change(self):
        """
        Prevents the cursor from stopping inside a syntax-only span.
        If the cursor enters a syntax span, it will be "bumped" to the other
        side, based on the direction of movement.
        """
        if self._is_programmatically_moving_cursor:
            return

        cursor = self.textCursor()
        current_pos = cursor.position()
        
        # Determine direction of movement (forward or backward)
        moved_forward = current_pos >= self._last_cursor_pos

        block = cursor.block()
        block_text = block.text()
        spans = self.formatter.parser.get_format_spans(block_text)
        
        pos_in_block = cursor.positionInBlock()

        for span_type, start, length in spans:
            if span_type == 'syntax':
                end = start + length
                # Check if the cursor is within the bounds of this syntax span
                if start < pos_in_block < end:
                    # It's inside. Move it out.
                    new_pos_in_block = end if moved_forward else start
                    
                    new_cursor = self.textCursor()
                    new_cursor.setPosition(block.position() + new_pos_in_block)

                    # Use a flag to prevent infinite recursion
                    self._is_programmatically_moving_cursor = True
                    self.setTextCursor(new_cursor)
                    self._last_cursor_pos = new_cursor.position()
                    self._is_programmatically_moving_cursor = False
                    return  # Exit after handling the jump

        # If no jump occurred, just update the last position for the next event.
        self._last_cursor_pos = current_pos

    def keyPressEvent(self, event):
        """
        Override to handle slash commands.
        FIX: All slash command logic is now delegated to the SlashCommandPopup.
        The popup decides if and how to show itself, and whether to suppress
        the original key press.
        """
        # If the popup is visible, give it priority to handle navigation keys.
        if self.slash_command_popup.isVisible():
            if event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return, Qt.Key.Key_Up, Qt.Key.Key_Down, Qt.Key.Key_Escape]:
                 self.slash_command_popup.keyPressEvent(event)
                 return

        # On a '/' press, ask the popup to handle it.
        if event.text() == '/':
            # The popup will return True if it showed a menu for a selection,
            # which means we should not type the '/' character.
            should_suppress_key = self.slash_command_popup.show_contextual_menu()
            if should_suppress_key:
                return
            # If it returns False, it means the '/' should be typed, and the
            # popup will appear after.
        
        # If the popup is visible and another key is typed, hide it.
        if self.slash_command_popup.isVisible() and event.text() != "/":
            self.slash_command_popup.hide()
            
        super().keyPressEvent(event)

    def execute_slash_command(self, command, trigger_mode):
        """
        Executes the selected slash command.
        FIX: Now receives the `trigger_mode` from the popup to determine
        if the typed '/' needs to be removed.
        """
        cursor = self.textCursor()
        
        # If the command was for insertion, a '/' was typed that now needs to be removed.
        if trigger_mode == 'insertion':
            cursor.deletePreviousChar()

        command_lower = command.lower()
        if command_lower.startswith("heading"):
            self.set_heading_level(int(command_lower.split()[-1]))
        elif command_lower == "bold":
            self.toggle_bold()
        elif command_lower == "italic":
            self.toggle_italic()
        elif command_lower == "underline":
            self.toggle_underline()
        elif command_lower == "widget":
            self.insert_widget()

    def insert_widget(self):
        """Inserts a widget placeholder."""
        cursor = self.textCursor()
        cursor.insertText("%%widget:new_widget%%")

    def set_heading_level(self, level):
        """Toggles a heading format for the current line."""
        cursor = self.textCursor()
        cursor.beginEditBlock()
        
        cursor.movePosition(QTextCursor.MoveOperation.StartOfLine)
        cursor.movePosition(QTextCursor.MoveOperation.EndOfLine, QTextCursor.MoveMode.KeepAnchor)
        line_text = cursor.selectedText()

        target_syntax = "#" * level + " "
        content_text = line_text.lstrip("# ").lstrip()

        if line_text.startswith(target_syntax):
            cursor.removeSelectedText()
            cursor.insertText(content_text)
        else:
            cursor.removeSelectedText()
            cursor.insertText(f"{target_syntax}{content_text}")
        
        cursor.endEditBlock()

    def toggle_format(self, syntax):
        """
        Generic function to toggle formatting. Now works correctly with selections
        preserved by the slash command logic.
        """
        cursor = self.textCursor()
        
        if not cursor.hasSelection():
            cursor.insertText(f"{syntax}{syntax}")
            cursor.movePosition(QTextCursor.MoveOperation.PreviousCharacter, QTextCursor.MoveMode.MoveAnchor, len(syntax))
            self.setTextCursor(cursor)
            return

        cursor.beginEditBlock()

        block = cursor.block()
        block_text = block.text()
        sel_start_in_block = cursor.selectionStart() - block.position()
        sel_end_in_block = cursor.selectionEnd() - block.position()

        preceding = block_text[max(0, sel_start_in_block - len(syntax)):sel_start_in_block]
        following = block_text[sel_end_in_block:sel_end_in_block + len(syntax)]

        new_sel_start = 0
        new_sel_end = 0

        if preceding == syntax and following == syntax:
            # UN-FORMAT
            start_part = block_text[:sel_start_in_block - len(syntax)]
            middle_part = block_text[sel_start_in_block:sel_end_in_block]
            end_part = block_text[sel_end_in_block + len(syntax):]
            new_block_text = start_part + middle_part + end_part
            new_sel_start = sel_start_in_block - len(syntax)
            new_sel_end = sel_end_in_block - len(syntax)
        else:
            # FORMAT
            start_part = block_text[:sel_start_in_block]
            middle_part = block_text[sel_start_in_block:sel_end_in_block]
            end_part = block_text[sel_end_in_block:]
            new_block_text = f"{start_part}{syntax}{middle_part}{syntax}{end_part}"
            new_sel_start = sel_start_in_block + len(syntax)
            new_sel_end = sel_end_in_block + len(syntax)

        cursor.movePosition(QTextCursor.MoveOperation.StartOfBlock)
        cursor.movePosition(QTextCursor.MoveOperation.EndOfBlock, QTextCursor.MoveMode.KeepAnchor)
        cursor.insertText(new_block_text)

        new_cursor = self.textCursor()
        block_start_pos = block.position()
        new_cursor.setPosition(block_start_pos + new_sel_start)
        new_cursor.setPosition(block_start_pos + new_sel_end, QTextCursor.MoveMode.KeepAnchor)
        self.setTextCursor(new_cursor)
        
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
