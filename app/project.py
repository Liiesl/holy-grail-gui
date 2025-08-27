# app/project.py

import os
import json
from PySide6.QtCore import QObject, Signal

class Project(QObject):
    """
    Manages a project, including its configuration and page structure.
    """
    structure_changed = Signal()

    def __init__(self, path):
        super().__init__()
        self.path = path
        self.name = os.path.basename(path)
        self.config_path = os.path.join(self.path, ".hgconfig", "project.json")
        self.page_structure = {}
        self.last_opened_file = None
        self.load_config()

    def load_config(self):
        """Loads the project configuration from project.json."""
        if os.path.exists(self.config_path):
            with open(self.config_path, "r") as f:
                config = json.load(f)
                self.name = config.get("name", self.name)
                self.page_structure = config.get("pages", {})
                self.last_opened_file = config.get("last_opened_file", None)
        else:
            self.page_structure = {"Welcome.hgmd": {}}
            self.save_config()


    def save_config(self):
        """Saves the project configuration to project.json."""
        config_dir = os.path.join(self.path, ".hgconfig")
        if not os.path.exists(config_dir):
            os.makedirs(config_dir)

        config = {
            "name": self.name,
            "pages": self.page_structure,
            "last_opened_file": self.last_opened_file
        }
        with open(self.config_path, "w") as f:
            json.dump(config, f, indent=4)
        self.structure_changed.emit()

    @staticmethod
    def create(path, name):
        """Creates a new project directory and configuration."""
        if not os.path.exists(path):
            os.makedirs(path)

        project_path = os.path.join(path, name)
        if os.path.exists(project_path):
            raise FileExistsError("A project with this name already exists.")

        os.makedirs(os.path.join(project_path, ".hgconfig", "versions"))

        with open(os.path.join(project_path, "Welcome.hgmd"), "w") as f:
            f.write("# Welcome to Your New Project!\n")

        return Project(project_path)

    def add_page(self, name):
        """Adds a new page to the project."""
        if name not in self.page_structure:
            self.page_structure[name] = {}
            with open(os.path.join(self.path, name), "w") as f:
                f.write(f"# {name.replace('.hgmd', '')}\n")
            self.save_config()

    def rename_page(self, old_name, new_name):
        """Renames a page in the project."""
        if old_name in self.page_structure:
            self.page_structure[new_name] = self.page_structure.pop(old_name)
            
            os.rename(os.path.join(self.path, old_name), os.path.join(self.path, new_name))
            
            # Update last_opened_file if it was the renamed file
            if self.last_opened_file == old_name:
                self.last_opened_file = new_name
            
            self.save_config()

    def delete_page(self, name):
        """Deletes a page from the project."""
        if name in self.page_structure:
            del self.page_structure[name]
            os.remove(os.path.join(self.path, name))
            
            # Clear last_opened_file if it was the deleted file
            if self.last_opened_file == name:
                self.last_opened_file = None
            
            self.save_config()