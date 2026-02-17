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


def update_comment(comment_id: int, body: str, current_user: str) -> bool:
    body = body.strip()
    if not body:
        return False

    with get_connection() as conn:
        row = conn.execute(
            "SELECT created_by, issue_id FROM comments WHERE id = ?",
            (comment_id,),
        ).fetchone()
        if row is None or row["created_by"] != current_user:
            return False

        conn.execute(
            "UPDATE comments SET body = ? WHERE id = ?",
            (body, comment_id),
        )
        conn.execute(
            "UPDATE issues SET updated_at = ? WHERE id = ?",
            (now_iso(), row["issue_id"]),
        )
        return True


def get_reactions_map(issue_id: int, current_user: str) -> dict[int, dict[str, dict[str, int | bool]]]:
    summary: dict[int, dict[str, dict[str, int | bool | list[str]]]] = {}
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT cr.comment_id, cr.reaction, COUNT(*) AS cnt,
                   SUM(CASE WHEN cr.reacted_by = ? THEN 1 ELSE 0 END) AS mine,
                   GROUP_CONCAT(cr.reacted_by, ',') AS users
            FROM comment_reactions cr
            JOIN comments c ON c.id = cr.comment_id
            WHERE c.issue_id = ?
            GROUP BY cr.comment_id, cr.reaction
            """,
            (current_user, issue_id),
        ).fetchall()
        for row in rows:
            reactions = summary.setdefault(row["comment_id"], {})
            users = row["users"].split(",") if row["users"] else []
            reactions[row["reaction"]] = {
                "count": row["cnt"],
                "reacted": (row["mine"] or 0) > 0,
                "users": users,
            }
    return summary


def toggle_reaction(comment_id: int, reaction: str, current_user: str) -> bool:
    with get_connection() as conn:
        comment_row = conn.execute(
            "SELECT issue_id FROM comments WHERE id = ?",
            (comment_id,),
        ).fetchone()
        if comment_row is None:
            return False

        exists = conn.execute(
            "SELECT id FROM comment_reactions WHERE comment_id = ? AND reacted_by = ? AND reaction = ?",
            (comment_id, current_user, reaction),
        ).fetchone()

        if exists:
            conn.execute("DELETE FROM comment_reactions WHERE id = ?", (exists["id"],))
        else:
            conn.execute(
                "INSERT INTO comment_reactions (comment_id, reacted_by, reaction, created_at) VALUES (?, ?, ?, ?)",
                (comment_id, current_user, reaction, now_iso()),
            )

        conn.execute(
            "UPDATE issues SET updated_at = ? WHERE id = ?",
            (now_iso(), comment_row["issue_id"]),
        )
        return True
