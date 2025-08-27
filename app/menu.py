from PySide6.QtGui import QAction, QKeySequence

def create_menu(main_window):
    """
    Creates the main menu bar for the application.

    Args:
        main_window (QMainWindow): The main window instance to which the menu will be added.
    """
    menu_bar = main_window.menuBar()
    file_menu = menu_bar.addMenu("File")

    # --- File Menu Actions ---

    # New Project
    new_project_action = QAction("New Project", main_window)
    new_project_action.triggered.connect(main_window.new_project)
    file_menu.addAction(new_project_action)
    
    # Open Project
    open_project_action = QAction("Open Project", main_window)
    open_project_action.triggered.connect(main_window.open_project)
    file_menu.addAction(open_project_action)

    file_menu.addSeparator()

    # Save Page
    save_action = QAction("Save Page", main_window)
    save_action.setShortcut(QKeySequence.Save)  # Set standard keyboard shortcut (Ctrl+S or Cmd+S)
    save_action.triggered.connect(main_window.save_file)
    file_menu.addAction(save_action)