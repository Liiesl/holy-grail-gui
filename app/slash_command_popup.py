    
from PySide6.QtWidgets import QListWidget, QListWidgetItem, QWidget, QVBoxLayout
from PySide6.QtCore import Qt, Signal

class SlashCommandPopup(QWidget):
    """
    A popup widget that displays a list of slash commands.
    FIX: This class now contains the primary logic for when and how to
    display slash commands based on the editor's context.
    """
    # The signal now also emits the "trigger mode" ('selection' or 'insertion')
    command_selected = Signal(str, str)

    def __init__(self, editor):
        super().__init__(editor)
        self.editor = editor
        self.trigger_mode = None # Can be 'selection' or 'insertion'
        
        self.setWindowFlags(Qt.WindowType.ToolTip | Qt.WindowType.FramelessWindowHint)
        self.setLayout(QVBoxLayout())
        
        self.list_widget = QListWidget()
        self.layout().addWidget(self.list_widget)
        
        self.list_widget.itemClicked.connect(self.on_item_clicked)

    def show_contextual_menu(self):
        """
        Checks the editor's context and shows the appropriate command list.
        Returns True if the initiating key press ('/') should be suppressed.
        """
        cursor = self.editor.textCursor()
        commands = []

        # Condition 1: A selection exists. Show styling commands.
        if cursor.hasSelection():
            self.trigger_mode = 'selection'
            commands = ["Bold", "Italic", "Underline"]
            self.display(commands, cursor)
            # Suppress the '/' key to preserve the selection
            return True

        # Condition 2: No selection. Check if we should show insertion commands.
        pos_in_block = cursor.positionInBlock()
        block_text = cursor.block().text()
        is_on_new_line = (len(block_text) == 0)
        char_before_is_space = (pos_in_block == 0 or block_text[pos_in_block - 1].isspace())
        char_after_is_space = (pos_in_block == len(block_text) or (pos_in_block < len(block_text) and block_text[pos_in_block].isspace()))
        is_surrounded_by_space = char_before_is_space and char_after_is_space

        if is_on_new_line or is_surrounded_by_space:
            self.trigger_mode = 'insertion'
            commands = [
                "Heading 1", "Heading 2", "Heading 3", "Heading 4", "Heading 5",
                "Widget"
            ]
            # We need the editor to type the '/' before we show the popup
            # so we use the editor's current cursor for positioning.
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
        self.command_selected.emit(item.text(), self.trigger_mode)
        self.hide()

    def keyPressEvent(self, event):
        """Handle key presses for navigation and selection."""
        if event.key() == Qt.Key.Key_Return or event.key() == Qt.Key.Key_Enter:
            if self.list_widget.currentItem():
                self.command_selected.emit(self.list_widget.currentItem().text(), self.trigger_mode)
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