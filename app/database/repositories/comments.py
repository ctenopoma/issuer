"""
comments.py - Comment repository
Single responsibility: persistence for comments.
"""
from app.database.connection import get_connection
from app.utils.time import now_iso


def list_by_issue(issue_id: int):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at ASC",
            (issue_id,),
        ).fetchall()


def add_comment(issue_id: int, body: str, created_by: str) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO comments (issue_id, body, created_by, created_at) VALUES (?, ?, ?, ?)",
            (issue_id, body, created_by, now_iso()),
        )
        conn.execute(
            "UPDATE issues SET updated_at = ? WHERE id = ?",
            (now_iso(), issue_id),
        )
        return cur.lastrowid


def delete_comment(comment_id: int, current_user: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT created_by, issue_id FROM comments WHERE id = ?",
            (comment_id,),
        ).fetchone()
        if row is None or row["created_by"] != current_user:
            return False
        conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
        conn.execute(
            "UPDATE issues SET updated_at = ? WHERE id = ?",
            (now_iso(), row["issue_id"]),
        )
        return True
