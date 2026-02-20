"""
connection.py - DB connection helpers
Single responsibility: manage SQLite connections and pragmas.
"""

import logging
import sqlite3
from app.config import DB_PATH

logger = logging.getLogger(__name__)


def get_connection() -> sqlite3.Connection:
    """Open SQLite connection with shared defaults."""
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn
    except sqlite3.Error as e:
        logger.error("Failed to connect to database at %s: %s", DB_PATH, e)
        raise
