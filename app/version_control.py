# --- START OF FILE app/version_control.py ---

import os
import shutil
import time
from pathlib import Path

class VersionControl:
    """
    Manages creating and retrieving snapshots of files within a project.
    """
    def __init__(self, project_path: str):
        """
        Initializes the VersionControl system for a given project path.
        """
        self.project_root = Path(project_path)
        self.versions_dir = self.project_root / ".hgconfig" / "versions"
        
        # Ensure the base versions directory exists
        if not self.versions_dir.exists():
            self.versions_dir.mkdir(parents=True)

    def create_snapshot(self, file_path: str):
        """
        Creates a timestamped snapshot of a file. The snapshot is stored in a
        directory structure that mirrors the project's structure.
        """
        target_path = Path(file_path)
        if not target_path.exists():
            return

        # Determine the file's path relative to the project root
        try:
            relative_path = target_path.relative_to(self.project_root)
        except ValueError:
            # The file is not within the project directory, so we can't version it.
            print(f"Error: File {file_path} is not part of the project at {self.project_root}")
            return

        # The snapshot directory will mirror the project structure
        snapshot_dir = self.versions_dir / relative_path.parent
        if not snapshot_dir.exists():
            snapshot_dir.mkdir(parents=True)

        # Create a unique, timestamped filename for the snapshot
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        snapshot_filename = f"{target_path.stem}_{timestamp}{target_path.suffix}"
        snapshot_path = snapshot_dir / snapshot_filename

        # Copy the file to create the snapshot
        shutil.copy2(target_path, snapshot_path)
        print(f"Created snapshot: {snapshot_path}")

    def get_versions(self, file_path: str) -> list:
        """
        Retrieves a list of available version paths for a given file,
        sorted from newest to oldest.
        """
        target_path = Path(file_path)
        if not self.project_root in target_path.parents:
            return []

        relative_path = target_path.relative_to(self.project_root)
        snapshot_dir = self.versions_dir / relative_path.parent
        
        if not snapshot_dir.exists():
            return []
            
        versions = []
        for f in snapshot_dir.iterdir():
            # Check if the file is a version of the target file
            if f.name.startswith(f"{target_path.stem}_"):
                versions.append(str(f))

        # Sort by filename, which works because of the YYYYMMDD-HHMMSS timestamp
        versions.sort(reverse=True)
        return versions