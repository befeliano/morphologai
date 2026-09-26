import sys
from PyQt6.QtWidgets import QApplication
from src.ui.main_window import AppWindow

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AppWindow()
    window.show()
    sys.exit(app.exec())