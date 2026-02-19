"""
linkify.py - Convert file paths in text to clickable Markdown links.
"""

import re
from urllib.parse import quote


def _path_to_file_url(path: str) -> str:
    """Convert a Windows file path to a file:/// URL."""
    # UNC path: \\server\share -> file://server/share
    if path.startswith("\\\\"):
        return "file:" + quote(path.replace("\\", "/"), safe="/:")
    # Drive letter path: C:\foo -> file:///C:/foo
    return "file:///" + quote(path.replace("\\", "/"), safe="/:")


# Matches Windows absolute paths:
#   Drive letter:  C:\folder\file.txt
#   UNC:           \\server\share\folder
# Stops at whitespace or characters unlikely to be in paths.
# Drive letter path:  C:\folder\file.txt  (backslash-separated segments)
# UNC path:           \\server\share\folder
_DRIVE_PATH_RE = re.compile(
    r"(?<!\()(?<!\]\()"  # not inside markdown link target
    r"([A-Za-z]:\\(?:[^\s　*?\"<>|]+))"  # C:\ followed by path chars (incl. \)
)
_UNC_PATH_RE = re.compile(
    r"(?<!\()(?<!\]\()"
    r"(\\\\[^\s　*?\"<>|\\]+(?:\\[^\s　*?\"<>|]+)+)"  # \\server\share[\path...]
)

# Detects existing Markdown links / images so we can skip them.
_MD_LINK_RE = re.compile(r"!?\[[^\]]*\]\([^)]*\)")


def linkify_file_paths(text: str) -> str:
    """Replace bare file paths with Markdown links.

    Paths already inside ``[text](url)`` or ``![alt](url)`` are left intact.
    """
    if not text:
        return text

    # Collect spans that are already inside markdown links.
    protected: list[tuple[int, int]] = []
    for m in _MD_LINK_RE.finditer(text):
        protected.append((m.start(), m.end()))

    def _in_protected(start: int, end: int) -> bool:
        for ps, pe in protected:
            if start >= ps and end <= pe:
                return True
        return False

    parts: list[str] = []
    last = 0

    # Gather matches from both patterns and sort by position.
    all_matches = list(_DRIVE_PATH_RE.finditer(text)) + list(
        _UNC_PATH_RE.finditer(text)
    )
    all_matches.sort(key=lambda m: m.start())

    for m in all_matches:
        path = m.group(0).rstrip(".,;:)、。）」』")
        if _in_protected(m.start(), m.start() + len(path)):
            continue
        url = _path_to_file_url(path)
        parts.append(text[last : m.start()])
        parts.append(f"[{path}]({url})")
        last = m.start() + len(path)
    parts.append(text[last:])
    return "".join(parts)


def linkify_issues(text: str) -> str:
    """Replace #123 style issue references with Markdown links.

    Matches #123 and converts to [#123](issue://123).
    Existing links are protected.
    """
    if not text:
        return text

    # Matches #123
    # Lookbehind ensures it's not part of another word (e.g. Issue#123 is ok, but not inside a url)
    # But for simplicity, we just look for word boundary or start of line.
    issue_re = re.compile(r"(?<!\w)#(\d+)")

    # Collect spans that are already inside markdown links.
    protected: list[tuple[int, int]] = []
    for m in _MD_LINK_RE.finditer(text):
        protected.append((m.start(), m.end()))

    def _in_protected(start: int, end: int) -> bool:
        for ps, pe in protected:
            if start >= ps and end <= pe:
                return True
        return False

    parts: list[str] = []
    last = 0

    for m in issue_re.finditer(text):
        if _in_protected(m.start(), m.end()):
            continue

        issue_id = m.group(1)
        # Avoid linking if it looks like a color hex code (though #123 is valid hex, usually 3 or 6 chars)
        # We assume #<digits> is an issue link.

        parts.append(text[last : m.start()])
        parts.append(f"[#{issue_id}](issue://{issue_id})")
        last = m.end()

    parts.append(text[last:])
    return "".join(parts)
