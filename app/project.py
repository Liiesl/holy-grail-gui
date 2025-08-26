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
        self.load_config()

    def load_config(self):
        """Loads the project configuration from project.json."""
        if os.path.exists(self.config_path):
            with open(self.config_path, "r") as f:
                config = json.load(f)
                self.name = config.get("name", self.name)
                self.page_structure = config.get("pages", {})
        else:
            # Default structure for a new project
            self.page_structure = {"Welcome.hgmd": {}}
            self.save_config()


    def save_config(self):
        """Saves the project configuration to project.json."""
        config_dir = os.path.join(self.path, ".hgconfig")
        if not os.path.exists(config_dir):
            os.makedirs(config_dir)

        config = {
            "name": self.name,
            "pages": self.page_structure
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

        # Create a default page
        with open(os.path.join(project_path, "Welcome.hgmd"), "w") as f:
            f.write("# Welcome to Your New Project!\n")

        # Create and return a new Project instance
        return Project(project_path)