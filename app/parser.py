import re

class HGMDParser:
    """
    A dedicated parser for the Holy Grail Markdown (hgmd) format.
    This version finds formatting patterns and returns their locations,
    distinguishing between syntax and content. It correctly handles
    escaped characters and resolves formatting ambiguities.
    """
    def __init__(self):
        # Define regex patterns for each format, ensuring content is in a capturing group
        self.patterns = {
            'escape': re.compile(r'\\([*#_%])'),  # New: Pattern for escaped characters
            'bold': re.compile(r'(\*\*)(.*?)(\*\*)'),
            'italic': re.compile(r'(\*)(.*?)(\*)'),
            'underline': re.compile(r'(__)(.*?)(__)'),
            'header': re.compile(r'^(#{1,5} )(.*)'),
            'widget': re.compile(r'(%%widget:)(.*?)(%%)')
        }

    def get_format_spans(self, text):
        """
        Finds all formatting spans, separating syntax from content.
        This method uses a multi-pass approach to ensure correctness.
        1. Escaped characters are handled first.
        2. Block-level formats (headers) are handled next.
        3. Inline formats are handled last.
        Returns a list of (type, start, length).
        """
        spans = []
        # A boolean array to mark characters that have been consumed by a formatting rule.
        covered = [False] * len(text)

        # Pass 1: Handle escaped characters. These have the highest priority.
        for match in self.patterns['escape'].finditer(text):
            if covered[match.start()]:
                continue
            # Hide the backslash. The character itself will be rendered normally.
            spans.append(('syntax', match.start(), 1))
            # Mark both the backslash and the escaped character as covered
            # so they aren't used in other patterns.
            covered[match.start()] = True
            covered[match.start() + 1] = True

        # Pass 2: Process block styles like headers.
        header_match = self.patterns['header'].match(text)
        if header_match and not covered[header_match.start(1)]:
            level = header_match.group(1).count('#')
            span_type = f'header{level}'
            
            # Span for the opening syntax (e.g., "### ")
            spans.append(('syntax', header_match.start(1), header_match.end(1) - header_match.start(1)))
            # Span for the header content
            spans.append((span_type, header_match.start(2), header_match.end(2) - header_match.start(2)))
            
            # Mark the entire header as covered
            for i in range(header_match.start(), header_match.end()):
                covered[i] = True

        # Pass 3: Process inline styles.
        # The order matters to resolve ambiguities (e.g., bold before italic).
        inline_order = ['widget', 'bold', 'underline', 'italic']
        for span_type in inline_order:
            pattern = self.patterns[span_type]
            for match in pattern.finditer(text):
                # If the syntax markers of this match are already covered, skip it.
                if covered[match.start(1)] or covered[match.start(3)]:
                    continue

                # Span for the opening syntax
                spans.append(('syntax', match.start(1), match.end(1) - match.start(1)))
                # Span for the actual content
                spans.append((span_type, match.start(2), match.end(2) - match.start(2)))
                # Span for the closing syntax
                spans.append(('syntax', match.start(3), match.end(3) - match.start(3)))

                # FIX: Mark only the syntax markers as covered, allowing for nesting.
                for i in range(match.start(1), match.end(1)):
                    covered[i] = True
                for i in range(match.start(3), match.end(3)):
                    covered[i] = True

        return spans