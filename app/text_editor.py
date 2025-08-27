from PySide6.QtWidgets import QTextEdit
from PySide6.QtGui import QTextCursor, QIcon, QFont
from PySide6.QtCore import Qt
from app.syntax_formatter import HGMDSyntaxFormatter
from app.slash_command_popup import SlashCommandPopup
from app.floating_style_bar import FloatingStyleBar
import re

class CustomTextEditor(QTextEdit):
    """
    A custom text editor that uses a syntax formatter for rendering,
    a slash command popup for insertions, and a floating bar for styling.
    """
    def __init__(self):
        super().__init__()
        self.formatter = HGMDSyntaxFormatter(self.document())
        self.slash_command_popup = SlashCommandPopup(self)
        self.floating_style_bar = FloatingStyleBar(self)

        self.slash_command_popup.command_selected.connect(self.execute_slash_command)
        self.selectionChanged.connect(self.handle_selection_change)

        # Attributes for managing cursor movement over syntax
        self._last_cursor_pos = 0
        self._is_programmatically_moving_cursor = False
        self.cursorPositionChanged.connect(self.handle_cursor_position_change)

    def handle_selection_change(self):
        """Shows or hides the floating style bar based on text selection."""
        if self.textCursor().hasSelection():
            self.floating_style_bar.show_at_cursor()
        else:
            self.floating_style_bar.hide()

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
                if start < pos_in_block < end:
                    new_pos_in_block = end if moved_forward else start
                    
                    new_cursor = self.textCursor()
                    new_cursor.setPosition(block.position() + new_pos_in_block)

                    self._is_programmatically_moving_cursor = True
                    self.setTextCursor(new_cursor)
                    self._last_cursor_pos = new_cursor.position()
                    self._is_programmatically_moving_cursor = False
                    return

        self._last_cursor_pos = current_pos

    def keyPressEvent(self, event):
        """
        Override to handle slash commands and other interactions.
        """
        # If the popup is visible, give it priority to handle navigation keys.
        if self.slash_command_popup.isVisible():
            if event.key() in [Qt.Key.Key_Enter, Qt.Key.Key_Return, Qt.Key.Key_Up, Qt.Key.Key_Down, Qt.Key.Key_Escape]:
                 self.slash_command_popup.keyPressEvent(event)
                 return

        # On a '/' press, ask the popup to handle it.
        if event.text() == '/':
            should_suppress_key = self.slash_command_popup.show_contextual_menu()
            if should_suppress_key:
                return
        
        if self.slash_command_popup.isVisible() and event.text() != "/":
            self.slash_command_popup.hide()
            
        super().keyPressEvent(event)

    def execute_slash_command(self, command):
        """
        Executes the selected slash command for insertions.
        """
        cursor = self.textCursor()
        cursor.deletePreviousChar() # Remove the typed '/'

        command_lower = command.lower()
        if command_lower.startswith("heading"):
            self.set_heading_level(int(command_lower.split()[-1]))
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
        Generic function to toggle formatting around a selection.
        """
        cursor = self.textCursor()
        
        if not cursor.hasSelection():
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
        cursor = self.textCursor()
        if not cursor.hasSelection():
             # If no selection, check formatting at the single cursor position
             char_format = cursor.charFormat()
        else:
             # For a selection, it's more reliable to check the start
             temp_cursor = QTextCursor(cursor)
             temp_cursor.setPosition(cursor.selectionStart())
             char_format = temp_cursor.charFormat()

        formats = set()
        if char_format.fontWeight() > QFont.Weight.Normal:
             formats.add('bold')
        if char_format.fontItalic():
             formats.add('italic')
        if char_format.fontUnderline():
             formats.add('underline')
        return formats