"""
connection.py - DB connection helpers
Single responsibility: manage SQLite connections and pragmas.
"""
import sqlite3
from app.config import DB_PATH


def get_connection() -> sqlite3.Connection:
    """Open SQLite connection with shared defaults."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn
