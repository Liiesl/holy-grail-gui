# --- START OF FILE sidebar.py ---

from PySide6.QtWidgets import (QWidget, QVBoxLayout, QTreeView,
                               QGroupBox, QComboBox)
from PySide6.QtGui import QStandardItemModel, QStandardItem
from PySide6.QtCore import Qt

class Sidebar(QWidget):
    """
    A sidebar for project navigation and page hierarchy.
    The page hierarchy is built from a dictionary (JSON structure).
    """
    def __init__(self):
        super().__init__()
        self.setLayout(QVBoxLayout())

        # Project Selector
        project_group = QGroupBox("Projects")
        project_layout = QVBoxLayout()
        self.project_selector = QComboBox()
        project_layout.addWidget(self.project_selector)
        project_group.setLayout(project_layout)

        # Page Hierarchy
        pages_group = QGroupBox("Pages")
        pages_layout = QVBoxLayout()
        self.page_tree = QTreeView()
        self.page_model = QStandardItemModel()
        self.page_tree.setModel(self.page_model)
        self.page_tree.setHeaderHidden(True)
        pages_layout.addWidget(self.page_tree)
        pages_group.setLayout(pages_layout)

        self.layout().addWidget(project_group)
        self.layout().addWidget(pages_group)

    def _populate_tree(self, parent_item, structure):
        """Recursively populates the tree view from a dictionary."""
        for name, children in structure.items():
            item = QStandardItem(name)
            # Store the filename in the item's data role
            item.setData(name, Qt.UserRole)
            parent_item.appendRow(item)
            if children:
                self._populate_tree(item, children)

    def update_page_tree(self, structure):
        """Clears and populates the page tree with the given structure."""
        self.page_model.clear()
        root_item = self.page_model.invisibleRootItem()
        self._populate_tree(root_item, structure)

    def add_project(self, name, path):
        """Adds a project to the project selector dropdown."""
        self.project_selector.addItem(name, userData=path)

# --- END OF FILE sidebar.py ---