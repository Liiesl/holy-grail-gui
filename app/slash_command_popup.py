from PySide6.QtWidgets import QListWidget, QListWidgetItem, QWidget, QVBoxLayout
from PySide6.QtCore import Qt, Signal

class SlashCommandPopup(QWidget):
    """
    A popup widget that displays a list of slash commands.
    """
    command_selected = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowFlags(Qt.WindowType.ToolTip | Qt.WindowType.FramelessWindowHint)
        self.setLayout(QVBoxLayout())
        
        self.list_widget = QListWidget()
        self.layout().addWidget(self.list_widget)
        
        self.populate_commands()
        
        self.list_widget.itemClicked.connect(self.on_item_clicked)

    def populate_commands(self):
        """Adds the available slash commands to the list."""
        commands = ["Heading", "Bold", "Italic", "Underline", "Widget"]
        for command in commands:
            self.list_widget.addItem(QListWidgetItem(command))

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
