"""
labels.py - Label repository
Single responsibility: CRUD and lookup for labels.
"""
from app.database.connection import get_connection


def normalize_labels(labels: list[str] | None) -> list[str]:
    if not labels:
        return []
    seen = set()
    normalized: list[str] = []
    for raw in labels:
        name = raw.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        normalized.append(name)
    return normalized


def ensure_labels(conn, labels: list[str]) -> list[int]:
    label_ids: list[int] = []
    for name in labels:
        conn.execute("INSERT OR IGNORE INTO labels (name) VALUES (?)", (name,))
        row = conn.execute("SELECT id FROM labels WHERE name = ?", (name,)).fetchone()
        if row:
            label_ids.append(row["id"])
    return label_ids


def list_all() -> list[str]:
    with get_connection() as conn:
        rows = conn.execute("SELECT name FROM labels ORDER BY name").fetchall()
        return [r["name"] for r in rows]
