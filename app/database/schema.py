"""
schema.py - Schema creation and migration helpers
Single responsibility: define and apply database schema.
"""
import logging
from app.database.connection import get_connection

logger = logging.getLogger(__name__)


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS issues (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    body       TEXT    DEFAULT '',
    status     TEXT    NOT NULL DEFAULT 'OPEN',
    created_by TEXT    NOT NULL,
    assignee   TEXT    DEFAULT '',
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id   INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    body       TEXT    NOT NULL,
    created_by TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_reactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    reacted_by  TEXT    NOT NULL,
    reaction    TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    UNIQUE(issue_id, reacted_by, reaction)
);

CREATE TABLE IF NOT EXISTS comment_reactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reacted_by  TEXT    NOT NULL,
    reaction    TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    UNIQUE(comment_id, reacted_by, reaction)
);

CREATE INDEX IF NOT EXISTS idx_issues_status
    ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_created_at
    ON issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_issue_id
    ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_reactions_issue_id
    ON issue_reactions(issue_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id
    ON comment_reactions(comment_id);

CREATE TABLE IF NOT EXISTS labels (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_labels_issue_id
    ON issue_labels(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_labels_label_id
    ON issue_labels(label_id);

-- Milestones (new)
CREATE TABLE IF NOT EXISTS milestones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    start_date  TEXT,
    due_date    TEXT,
    status      TEXT NOT NULL DEFAULT 'planned',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_status
    ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date
    ON milestones(due_date);
"""


def initialize_schema() -> None:
    """Create tables and indexes if missing."""
    try:
        with get_connection() as conn:
            conn.executescript(SCHEMA_SQL)
            # Add milestone_id column if missing (compatible with older SQLite)
            columns = conn.execute("PRAGMA table_info(issues)").fetchall()
            has_milestone = any(col[1] == "milestone_id" for col in columns)
            if not has_milestone:
                conn.execute(
                    "ALTER TABLE issues ADD COLUMN milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL"
                )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_issues_milestone_id ON issues(milestone_id)")
    except Exception as e:
        logger.error("Failed to initialize database schema: %s", e)
        raise
