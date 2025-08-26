import sys
import os
from PySide6.QtWidgets import ( QApplication, QMainWindow, QVBoxLayout, QWidget,
                               QFileDialog, QToolBar, QSplitter, QInputDialog, QMessageBox )
from PySide6.QtGui import QAction, QIcon, QKeySequence
from PySide6.QtCore import Qt, QSettings
from app.text_editor import CustomTextEditor
from app.sidebar import Sidebar
from app.project import Project
from app.version_control import VersionControl

class MarkdownEditor(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Custom HGMD Editor")
        self.setGeometry(100, 100, 1200, 800)

        # Use QSettings to store application settings
        self.settings = QSettings("MyCompany", "MarkdownEditor")

        self.current_project = None
        self.current_file_path = None
        self.version_control = None

        self.central_widget = QSplitter(Qt.Horizontal)
        self.setCentralWidget(self.central_widget)

        # Sidebar
        self.sidebar = Sidebar()
        self.central_widget.addWidget(self.sidebar)

        # Editor layout
        editor_widget = QWidget()
        self.layout = QVBoxLayout(editor_widget)
        self.editor = CustomTextEditor()
        self.editor.setPlaceholderText("Create or open a project to start editing.")
        self.layout.addWidget(self.editor)
        self.central_widget.addWidget(editor_widget)

        self.central_widget.setSizes([250, 950])

        self.editor.cursorPositionChanged.connect(self.update_format_buttons)
        self.sidebar.project_selector.currentIndexChanged.connect(self.switch_project)
        self.sidebar.page_tree.doubleClicked.connect(self.on_page_selected)
        self.sidebar.add_page_action.triggered.connect(self.add_page)
        self.sidebar.rename_page_action.triggered.connect(self.rename_page)
        self.sidebar.delete_page_action.triggered.connect(self.delete_page)

        self.create_menu()
        self.create_toolbar()
        self.load_projects()
        
        self.editor.setReadOnly(True)

    def create_menu(self):
        menu_bar = self.menuBar()
        file_menu = menu_bar.addMenu("File")

        new_project_action = QAction("New Project", self)
        new_project_action.triggered.connect(self.new_project)
        file_menu.addAction(new_project_action)
        
        open_project_action = QAction("Open Project", self)
        open_project_action.triggered.connect(self.open_project)
        file_menu.addAction(open_project_action)

        file_menu.addSeparator()

        save_action = QAction("Save Page", self)
        # Add keyboard shortcut for saving
        save_action.setShortcut(QKeySequence.Save)
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

    def new_project(self):
        """Creates a new project in a user-selected directory."""
        project_name, ok = QInputDialog.getText(self, "New Project", "Enter project name:")
        if ok and project_name:
            parent_dir = QFileDialog.getExistingDirectory(self, "Select Project Location")
            if parent_dir:
                try:
                    project = Project.create(parent_dir, project_name)
                    self._add_project_to_settings(project.path)
                    self.load_projects()
                    self.sidebar.project_selector.setCurrentText(project.name)
                except FileExistsError as e:
                    print(e) # In a real app, show a QMessageBox

    def open_project(self):
        """Opens an existing project from the filesystem."""
        project_dir = QFileDialog.getExistingDirectory(self, "Select Project Directory")
        if project_dir and os.path.exists(os.path.join(project_dir, ".hgconfig")):
            self._add_project_to_settings(project_dir)
            self.load_projects()
            self.sidebar.project_selector.setCurrentText(os.path.basename(project_dir))

    def _add_project_to_settings(self, path):
        """Adds a project path to QSettings, avoiding duplicates."""
        paths = self.settings.value("projects/paths", [])
        if path not in paths:
            paths.append(path)
            self.settings.setValue("projects/paths", paths)

    def load_projects(self):
        """Loads all project paths stored in QSettings."""
        self.sidebar.project_selector.clear()
        paths = self.settings.value("projects/paths", [])
        for path in paths:
            if os.path.exists(path):
                project_name = os.path.basename(path)
                self.sidebar.add_project(project_name, path)

    def switch_project(self, index):
        """Switches the active project."""
        if index == -1:
            self.current_project = None
            self.version_control = None
            self.sidebar.update_page_tree({}) # Clear the tree
            self.editor.setPlainText("")
            self.editor.setReadOnly(True)
            self.setWindowTitle("Custom HGMD Editor")
            return

        project_path = self.sidebar.project_selector.itemData(index)
        self.current_project = Project(project_path)
        self.version_control = VersionControl(project_path)
        # Update sidebar using the JSON structure
        self.sidebar.update_page_tree(self.current_project.page_structure)
        self.editor.setPlainText("Select a page from the sidebar to begin editing.")
        self.editor.setReadOnly(True)
        self.setWindowTitle(f"Custom HGMD Editor - {self.current_project.name}")

    def on_page_selected(self, index):
        """Handles opening a page from the tree view."""
        item = self.sidebar.page_model.itemFromIndex(index)
        file_name = item.data(Qt.UserRole)
        
        # A simple check to only open files, not "folders"
        if file_name and file_name.endswith(".hgmd"):
            path = os.path.join(self.current_project.path, file_name)
            if os.path.isfile(path):
                self.open_file(path)

    def open_file(self, file_path):
        """Opens a file and loads its content into the editor."""
        self.current_file_path = file_path
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            self.editor.setPlainText(content)
            self.editor.setReadOnly(False)

    def save_file(self):
        """Saves the current file within the project."""
        if self.current_file_path and self.current_project and self.version_control:
            self.version_control.create_snapshot(self.current_file_path)
            with open(self.current_file_path, "w", encoding="utf-8") as f:
                f.write(self.editor.toPlainText())
            print(f"Saved: {self.current_file_path}")

    def add_page(self):
        if not self.current_project:
            return
        page_name, ok = QInputDialog.getText(self, "Add Page", "Enter new page name:")
        if ok and page_name:
            # Ensure the name ends with .hgmd
            if not page_name.endswith(".hgmd"):
                page_name += ".hgmd"
            self.current_project.add_page(page_name)
            self.sidebar.update_page_tree(self.current_project.page_structure)

    def rename_page(self):
        if not self.current_project:
            return
        
        index = self.sidebar.page_tree.currentIndex()
        if not index.isValid():
            return
            
        item = self.sidebar.page_model.itemFromIndex(index)
        old_name = item.data(Qt.UserRole)

        new_name, ok = QInputDialog.getText(self, "Rename Page", "Enter new name:", text=old_name)
        if ok and new_name and new_name != old_name:
            # Ensure the name ends with .hgmd
            if not new_name.endswith(".hgmd"):
                new_name += ".hgmd"
            
            self.current_project.rename_page(old_name, new_name)
            self.sidebar.update_page_tree(self.current_project.page_structure)

    def delete_page(self):
        if not self.current_project:
            return

        index = self.sidebar.page_tree.currentIndex()
        if not index.isValid():
            return

        item = self.sidebar.page_model.itemFromIndex(index)
        page_name = item.data(Qt.UserRole)

        reply = QMessageBox.question(self, "Delete Page", f"Are you sure you want to delete {page_name}?",
                                     QMessageBox.Yes | QMessageBox.No, QMessageBox.No)

        if reply == QMessageBox.Yes:
            self.current_project.delete_page(page_name)
            self.sidebar.update_page_tree(self.current_project.page_structure)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    editor = MarkdownEditor()
    editor.show()
    sys.exit(app.exec())