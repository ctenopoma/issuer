"""
helpers.py - UI helper functions
Single responsibility: small formatting and parsing helpers used across UI.
"""
import getpass
from datetime import datetime

from app.config import COLOR_OPEN, COLOR_CLOSED


def current_user() -> str:
    return getpass.getuser()


def format_datetime(iso_str: str) -> str:
    """ISO 8601 string to "YYYY-MM-DD HH:MM"; fallback to raw on error."""
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return iso_str or ""


def status_color(status: str) -> str:
    return COLOR_OPEN if status == "OPEN" else COLOR_CLOSED


def status_icon(status: str) -> str:
    return "🟢" if status == "OPEN" else "🟣"


def parse_labels(text: str | None) -> list[str]:
    """Normalize comma/newline-separated labels into a unique list."""
    if not text:
        return []
    labels = []
    seen = set()
    raw = text.replace("\n", ",").replace("、", ",")
    for part in raw.split(","):
        name = part.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        labels.append(name)
    return labels
