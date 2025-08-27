from PySide6.QtWidgets import QWidget, QHBoxLayout, QToolButton
from PySide6.QtGui import QIcon, QFont
from PySide6.QtCore import Qt, QSize

class FloatingStyleBar(QWidget):
    """
    A floating toolbar that appears when text is selected in the editor,
    providing buttons for common text styling.
    """
    def __init__(self, editor):
        super().__init__(editor)
        self.editor = editor

        # Configure the widget to look like a floating toolbar
        self.setWindowFlags(Qt.WindowType.ToolTip | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        
        # Main layout
        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(4, 4, 4, 4)
        self.layout.setSpacing(2)

        # Container for the buttons with a proper background
        self.button_container = QWidget()
        self.button_container.setObjectName("floating-bar")
        self.button_container.setLayout(QHBoxLayout())
        self.button_container.layout().setContentsMargins(0, 0, 0, 0)
        self.button_container.layout().setSpacing(2)
        
        # Styling for the toolbar
        self.button_container.setStyleSheet("""
            #floating-bar {
                background-color: #333;
                border-radius: 6px;
                border: 1px solid #555;
            }
            QToolButton {
                background-color: transparent;
                color: white;
                border: none;
                padding: 4px;
                border-radius: 4px;
            }
            QToolButton:hover {
                background-color: #555;
            }
            QToolButton:checked {
                background-color: #0078d4;
            }
        """)
        
        self.layout.addWidget(self.button_container)

        # Create and add styling buttons
        self.bold_button = self._create_button("format-text-bold", self.editor.toggle_bold)
        self.italic_button = self._create_button("format-text-italic", self.editor.toggle_italic)
        self.underline_button = self._create_button("format-text-underline", self.editor.toggle_underline)

        self.hide()

    def _create_button(self, icon_name, on_click):
        """Helper to create a QToolButton."""
        button = QToolButton()
        button.setIcon(QIcon.fromTheme(icon_name))
        button.setCheckable(True)
        button.setIconSize(QSize(18, 18))
        button.clicked.connect(on_click)
        self.button_container.layout().addWidget(button)
        return button

    def update_button_states(self):
        """
        Checks the formatting of the current selection and updates the toggle
        state of the toolbar buttons accordingly.
        """
        # This implementation checks the format at the start of the selection.
        cursor = self.editor.textCursor()
        if not cursor.hasSelection():
            return
        
        # Create a temporary cursor to check the format at the beginning of the selection
        # without moving the actual cursor's caret.
        temp_cursor = self.editor.textCursor()
        temp_cursor.setPosition(cursor.selectionStart())
        char_format = temp_cursor.charFormat()
        
        self.bold_button.setChecked(char_format.fontWeight() >= QFont.Weight.Bold)
        self.italic_button.setChecked(char_format.fontItalic())
        self.underline_button.setChecked(char_format.fontUnderline())

    def show_at_cursor(self):
        """
        Positions the floating bar just above the current text selection
        and makes it visible.
        """
        cursor = self.editor.textCursor()
        if not cursor.hasSelection():
            self.hide()
            return

        self.update_button_states()

        # Get the rectangle for the start of the selection
        start_pos = cursor.selectionStart()
        temp_cursor = self.editor.textCursor()
        temp_cursor.setPosition(start_pos)
        cursor_rect = self.editor.cursorRect(temp_cursor)

        # Position the bar above the selection
        popup_pos = self.editor.mapToGlobal(cursor_rect.topLeft())
        # Adjust so it's centered above and doesn't overlap the text
        popup_pos.setX(popup_pos.x() - self.width() // 2 + cursor_rect.width() // 2)
        popup_pos.setY(popup_pos.y() - self.height() - 5)

        self.move(popup_pos)
        self.show()