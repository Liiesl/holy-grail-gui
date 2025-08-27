from PySide6.QtWidgets import QListWidget, QListWidgetItem, QWidget, QVBoxLayout
from PySide6.QtCore import Qt, Signal

class SlashCommandPopup(QWidget):
    """
    A popup widget that displays a list of slash commands for inserting
    new elements like headers or widgets.
    """
    command_selected = Signal(str)

    def __init__(self, editor):
        super().__init__(editor)
        self.editor = editor
        
        self.setWindowFlags(Qt.WindowType.ToolTip | Qt.WindowType.FramelessWindowHint)
        self.setLayout(QVBoxLayout())
        
        self.list_widget = QListWidget()
        self.layout().addWidget(self.list_widget)
        
        self.list_widget.itemClicked.connect(self.on_item_clicked)

    def show_contextual_menu(self):
        """
        Checks if the cursor is in a position to insert a new element
        and shows the command list if appropriate.
        Returns True if the initiating key press ('/') should be suppressed.
        """
        cursor = self.editor.textCursor()
        
        # This menu should only appear for insertion, not for styling a selection.
        if cursor.hasSelection():
            return False

        # Condition: Show insertion commands if on a new line or surrounded by spaces.
        pos_in_block = cursor.positionInBlock()
        block_text = cursor.block().text()
        is_on_new_line = (len(block_text) == 0)
        char_before_is_space = (pos_in_block == 0 or block_text[pos_in_block - 1].isspace())
        char_after_is_space = (pos_in_block == len(block_text) or (pos_in_block < len(block_text) and block_text[pos_in_block].isspace()))
        is_surrounded_by_space = char_before_is_space and char_after_is_space

        if is_on_new_line or is_surrounded_by_space:
            commands = [
                "Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5",
                "Widget"
            ]
            self.display(commands, self.editor.textCursor())
            # Do not suppress the key; let the editor type '/'
            return False

        # If no conditions are met, do nothing.
        return False

    def display(self, commands, cursor):
        """
        Helper function to populate, position, and show the popup.
        """
        self.list_widget.clear()
        for command in commands:
            self.list_widget.addItem(QListWidgetItem(command))

        cursor_rect = self.editor.cursorRect(cursor)
        popup_pos = self.editor.mapToGlobal(cursor_rect.bottomLeft())
        self.move(popup_pos)
        self.show()
        self.setFocus()
        self.list_widget.setCurrentRow(0)

    def on_item_clicked(self, item):
        self.command_selected.emit(item.text())
        self.hide()

    def keyPressEvent(self, event):
        """Handle key presses for navigation and selection."""
        if event.key() == Qt.Key.Key_Return or event.key() == Qt.Key.Key_Enter:
            if self.list_widget.currentItem():
                self.command_selected.emit(self.list_widget.currentItem().text())
                self.hide()
        elif event.key() == Qt.Key.Key_Escape:
            self.hide()
        elif event.key() == Qt.Key.Key_Up:
            current_row = self.list_widget.currentRow()
            if current_row > 0:
                self.list_widget.setCurrentRow(current_row - 1)
        elif event.key() == Qt.Key.Key_Down:
            current_row = self.list_widget.currentRow()
            if current_row < self.list_widget.count() - 1:
                self.list_widget.setCurrentRow(current_row + 1)
        else:
            super().keyPressEvent(event)