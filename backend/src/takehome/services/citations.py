from __future__ import annotations

import re
from bisect import bisect_right

# upload_document() prefixes every non-empty page with this line, using the real PDF page number.
_PAGE_MARKER = re.compile(r"^--- Page (\d+) ---$", re.MULTILINE)


def split_blocks(text: str) -> list[tuple[int, str]]:
    """Split extracted text into its (offset, line) blocks, leaving out page markers and blank lines."""
    blocks: list[tuple[int, str]] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        if line.strip() and not _PAGE_MARKER.match(line):
            blocks.append((offset, line))
        offset += len(line)
    return blocks


def page_boundaries(text: str) -> list[tuple[int, int]]:
    """Return (offset, page_number) for every page marker in extracted text, in document order."""
    return [(m.start(), int(m.group(1))) for m in _PAGE_MARKER.finditer(text)]


def page_for_offset(boundaries: list[tuple[int, int]], offset: int) -> int | None:
    """Return the PDF page containing a character offset, or None if it precedes every marker.

    Citations come back from the API as character ranges into the exact text we sent, which is
    the stored extracted_text. So the page is whichever marker was last seen before the offset.
    """
    starts = [start for start, _ in boundaries]
    i = bisect_right(starts, offset) - 1
    if i < 0:
        return None
    return boundaries[i][1]
