import sys
import re
from PySide6.QtWidgets import ( QApplication, QMainWindow, QVBoxLayout, QWidget, 
                               QFileDialog, QToolBar, QPlainTextEdit )
from PySide6.QtGui import ( QAction, QIcon, QTextCharFormat, QFont, QColor,
                            QSyntaxHighlighter, QTextDocument )
from PySide6.QtCore import Qt
from app.text_editor import CustomTextEditor

class MarkdownEditor(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Custom HGMD Editor")
        self.setGeometry(100, 100, 1000, 600)

        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)

        self.layout = QVBoxLayout(self.central_widget)

        # Use our new custom editor
        self.editor = CustomTextEditor()
        self.editor.setPlaceholderText("Enter your hgmd text here...")
        self.layout.addWidget(self.editor)

        self.editor.cursorPositionChanged.connect(self.update_format_buttons)

        self.create_menu()
        self.create_toolbar()

    def create_menu(self):
        menu_bar = self.menuBar()
        file_menu = menu_bar.addMenu("File")

        open_action = QAction("Open", self)
        open_action.triggered.connect(self.open_file)
        file_menu.addAction(open_action)

        save_action = QAction("Save", self)
        save_action.triggered.connect(self.save_file)
        file_menu.addAction(save_action)

    def create_toolbar(self):
        toolbar = QToolBar("Main Toolbar")
        self.addToolBar(toolbar)

        self.bold_action = QAction(QIcon.fromTheme("format-text-bold"), "Bold", self)
        self.bold_action.setCheckable(True)
        self.bold_action.triggered.connect(self.editor.toggle_bold)
        toolbar.addAction(self.bold_action)

        self.italic_action = QAction(QIcon.fromTheme("format-text-italic"), "Italic", self)
        self.italic_action.setCheckable(True)
        self.italic_action.triggered.connect(self.editor.toggle_italic)
        toolbar.addAction(self.italic_action)

        self.underline_action = QAction(QIcon.fromTheme("format-text-underline"), "Underline", self)
        self.underline_action.setCheckable(True)
        self.underline_action.triggered.connect(self.editor.toggle_underline)
        toolbar.addAction(self.underline_action)

    def update_format_buttons(self):
        formats = self.editor.get_formatting_at_cursor()
        self.bold_action.setChecked('bold' in formats)
        self.italic_action.setChecked('italic' in formats)
        self.underline_action.setChecked('underline' in formats)

    def open_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Open File", "", "Holy Grail Markdown (*.hgmd);;All Files (*)"
        )
        if file_path:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                self.editor.setPlainText(content)

    def save_file(self):
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Save File", "", "Holy Grail Markdown (*.hgmd);;All Files (*)"
        )
        if file_path:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(self.editor.toPlainText())


if __name__ == "__main__":
    app = QApplication(sys.argv)
    editor = MarkdownEditor()
    editor.show()
    sys.exit(app.exec())