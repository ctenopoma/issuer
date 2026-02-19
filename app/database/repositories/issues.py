"""
issues.py - Issue repository
Single responsibility: persistence for issues and label relations.
"""

import re

from app.database.connection import get_connection
from app.database.repositories import labels as label_repo
from app.database.repositories.labels import normalize_labels
from app.database.repositories.labels import ensure_labels
from app.domain.filters import IssueFilter
from app.domain.models import Issue
from app.utils.time import now_iso


def _set_issue_labels(conn, issue_id: int, labels: list[str]) -> None:
    labels = normalize_labels(labels)
    conn.execute("DELETE FROM issue_labels WHERE issue_id = ?", (issue_id,))
    if not labels:
        return
    ids = ensure_labels(conn, labels)
    for lid in ids:
        conn.execute(
            "INSERT OR IGNORE INTO issue_labels (issue_id, label_id) VALUES (?, ?)",
            (issue_id, lid),
        )


def list_issues(filter: IssueFilter) -> list[Issue]:
    clauses: list[str] = []
    params: list = []

    # Split keyword by whitespace (half-width and full-width) for AND partial matching
    keywords = [w for w in re.split(r"[\s\u3000]+", filter.keyword) if w]
    for kw in keywords:
        clauses.append("(title LIKE ? OR body LIKE ?)")
        params.extend([f"%{kw}%", f"%{kw}%"])

    if filter.status and filter.status != "ALL":
        clauses.append("status = ?")
        params.append(filter.status)

    if filter.assignee:
        clauses.append("assignee LIKE ?")
        params.append(f"%{filter.assignee}%")

    if filter.milestone_id is not None:
        clauses.append("milestone_id = ?")
        params.append(filter.milestone_id)

    if filter.tags:
        tag_like_parts = []
        for tag in filter.tags:
            tag_like_parts.append("l.name LIKE ?")
            params.append(f"%{tag}%")
        tag_where = " OR ".join(tag_like_parts)
        clauses.append(
            f"id IN (SELECT issue_id FROM issue_labels il JOIN labels l ON l.id = il.label_id WHERE {tag_where})"
        )

    where_clause = (" AND ".join(clauses)) if clauses else "1=1"
    order_clause = "ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM issues WHERE {where_clause} {order_clause}", params
        ).fetchall()
        result: list[Issue] = []
        for r in rows:
            result.append(
                Issue(
                    id=r["id"],
                    title=r["title"],
                    body=r["body"],
                    status=r["status"],
                    created_by=r["created_by"],
                    assignee=r["assignee"],
                    created_at=r["created_at"],
                    updated_at=r["updated_at"],
                    milestone_id=r["milestone_id"],
                )
            )
        return result


def get_issue(issue_id: int) -> Issue | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
        if not row:
            return None
        return Issue(
            id=row["id"],
            title=row["title"],
            body=row["body"],
            status=row["status"],
            created_by=row["created_by"],
            assignee=row["assignee"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            milestone_id=row["milestone_id"],
        )


def create_issue(issue: Issue, labels: list[str] | None = None) -> int:
    labels = normalize_labels(labels)
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO issues (title, body, status, created_by, assignee, milestone_id, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                issue.title,
                issue.body,
                issue.status,
                issue.created_by,
                issue.assignee or "",
                issue.milestone_id,
                issue.created_at or now_iso(),
                issue.updated_at or now_iso(),
            ),
        )
        iid = cur.lastrowid
        if iid is None:
            raise RuntimeError("Failed to insert issue")
        if labels is not None:
            _set_issue_labels(conn, iid, labels)
        return iid


def update_issue(
    issue_id: int,
    title: str,
    body: str,
    assignee: str | None = "",
    labels: list[str] | None = None,
    milestone_id: int | None = None,
) -> None:
    labels = normalize_labels(labels)
    with get_connection() as conn:
        conn.execute(
            "UPDATE issues SET title = ?, body = ?, assignee = ?, milestone_id = ?, updated_at = ? WHERE id = ?",
            (title, body, assignee or "", milestone_id, now_iso(), issue_id),
        )
        if labels is not None:
            _set_issue_labels(conn, issue_id, labels)


def toggle_status(issue_id: int) -> str:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT status FROM issues WHERE id = ?", (issue_id,)
        ).fetchone()
        if row is None:
            raise ValueError(f"Issue {issue_id} not found")
        new_status = "CLOSED" if row["status"] == "OPEN" else "OPEN"
        conn.execute(
            "UPDATE issues SET status = ?, updated_at = ? WHERE id = ?",
            (new_status, now_iso(), issue_id),
        )
        return new_status


def delete_issue(issue_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM issues WHERE id = ?", (issue_id,))


def get_labels(issue_id: int) -> list[str]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT l.name
            FROM labels l
            JOIN issue_labels il ON il.label_id = l.id
            WHERE il.issue_id = ?
            ORDER BY l.name
            """,
            (issue_id,),
        ).fetchall()
        return [r["name"] for r in rows]


def get_labels_map(issue_ids: list[int]) -> dict[int, list[str]]:
    if not issue_ids:
        return {}
    placeholders = ",".join(["?"] * len(issue_ids))
    query = f"""
        SELECT il.issue_id, l.name
        FROM issue_labels il
        JOIN labels l ON l.id = il.label_id
        WHERE il.issue_id IN ({placeholders})
        ORDER BY l.name
    """
    result: dict[int, list[str]] = {iid: [] for iid in issue_ids}
    with get_connection() as conn:
        for row in conn.execute(query, issue_ids).fetchall():
            result.setdefault(row["issue_id"], []).append(row["name"])
    return result


def get_reactions(issue_id: int, current_user: str) -> dict[str, dict[str, int | bool]]:
    summary: dict[str, dict[str, int | bool | list[str]]] = {}
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT reaction,
                   COUNT(*) AS cnt,
                   SUM(CASE WHEN reacted_by = ? THEN 1 ELSE 0 END) AS mine,
                   GROUP_CONCAT(reacted_by, ',') AS users
            FROM issue_reactions
            WHERE issue_id = ?
            GROUP BY reaction
            """,
            (current_user, issue_id),
        ).fetchall()
        for row in rows:
            users = row["users"].split(",") if row["users"] else []
            summary[row["reaction"]] = {
                "count": row["cnt"],
                "reacted": (row["mine"] or 0) > 0,
                "users": users,
            }
    return summary


def toggle_reaction(issue_id: int, reaction: str, current_user: str) -> None:
    with get_connection() as conn:
        exists = conn.execute(
            "SELECT id FROM issue_reactions WHERE issue_id = ? AND reacted_by = ? AND reaction = ?",
            (issue_id, current_user, reaction),
        ).fetchone()
        if exists:
            conn.execute("DELETE FROM issue_reactions WHERE id = ?", (exists["id"],))
        else:
            conn.execute(
                "INSERT INTO issue_reactions (issue_id, reacted_by, reaction, created_at) VALUES (?, ?, ?, ?)",
                (issue_id, current_user, reaction, now_iso()),
            )
        conn.execute(
            "UPDATE issues SET updated_at = ? WHERE id = ?", (now_iso(), issue_id)
        )
