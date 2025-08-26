import re

class HGMDParser:
    """
    A dedicated parser for the Holy Grail Markdown (hgmd) format.
    This version finds formatting patterns and returns their locations,
    distinguishing between syntax and content.
    """
    def __init__(self):
        # Define regex patterns for each format, ensuring content is in a capturing group
        self.patterns = {
            'bold': re.compile(r'(\*\*)(.*?)(\*\*)'),
            'italic': re.compile(r'(\*)(.*?)(\*)'),
            'underline': re.compile(r'(__)(.*?)(__)'),
            'header': re.compile(r'^(# )(.*)'),
            'widget': re.compile(r'(%%widget:)(.*?)(%%)')
        }

    def get_format_spans(self, text):
        """
        Finds all formatting spans, separating syntax from content.
        Returns a list of (type, start, length).
        """
        spans = []

        # Process inline styles first
        for span_type, pattern in self.patterns.items():
            # Headers are block-level and handled separately
            if span_type == 'header':
                continue

            for match in pattern.finditer(text):
                # Special handling to prevent italic '*' from matching bold's '**'
                if span_type == 'italic' and (text[match.start():match.start()+2] == '**' or text[match.end()-2:match.end()] == '**'):
                    continue

                # The regex now has 3 groups: open_syntax, content, close_syntax
                # Span for the opening syntax
                spans.append(('syntax', match.start(1), match.end(1) - match.start(1)))
                # Span for the actual content
                spans.append((span_type, match.start(2), match.end(2) - match.start(2)))
                # Span for the closing syntax
                spans.append(('syntax', match.start(3), match.end(3) - match.start(3)))

        # Process block styles like headers
        header_match = self.patterns['header'].match(text)
        if header_match:
            # Span for the opening syntax (e.g., "# ")
            spans.append(('syntax', header_match.start(1), header_match.end(1) - header_match.start(1)))
            # Span for the header content
            spans.append(('header', header_match.start(2), header_match.end(2) - header_match.start(2)))

        return spans