from PySide6.QtGui import (QSyntaxHighlighter, QTextCharFormat, QFont, QColor, QTextDocument)
from app.parser import HGMDParser

class HGMDSyntaxFormatter(QSyntaxHighlighter):
    """
    A syntax formatter that uses the HGMDParser to apply rich text formats
    to the editor in real-time. It renders the syntax markers invisible.
    """
    def __init__(self, parent: QTextDocument):
        super().__init__(parent)
        self.parser = HGMDParser()
        
        # Define the character formats
        self.formats = {}
        
        bold_format = QTextCharFormat()
        bold_format.setFontWeight(QFont.Weight.Bold)
        self.formats['bold'] = bold_format
        
        italic_format = QTextCharFormat()
        italic_format.setFontItalic(True)
        self.formats['italic'] = italic_format

        underline_format = QTextCharFormat()
        underline_format.setFontUnderline(True)
        self.formats['underline'] = underline_format
        
        header_format = QTextCharFormat()
        header_format.setFontPointSize(20)
        header_format.setFontWeight(QFont.Weight.Bold)
        self.formats['header'] = header_format
        
        widget_format = QTextCharFormat()
        widget_format.setBackground(QColor("#e0e0e0"))
        widget_format.setFontFamily("monospace")
        self.formats['widget'] = widget_format

        # New format to "hide" ahe syntax characters (e.g., **, #, __)
        syntax_format = QTextCharFormat()
        syntax_format.setFontPointSize(1) # Makes the font extremely small
        self.formats['syntax'] = syntax_format


    def highlightBlock(self, text: str):
        """This method is called by Qt for each block of text to be highlighted."""
        # Get all formatting spans from the parser (including syntax markers)
        spans = self.parser.get_format_spans(text)
        
        for span_type, start, length in spans:
            # Check if a format exists for the span type and apply it
            if span_type in self.formats:
                self.setFormat(start, length, self.formats[span_type])