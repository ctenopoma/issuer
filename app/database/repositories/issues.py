"""
issues.py - Issue repository
Single responsibility: persistence for issues and label relations.
"""
from app.database.connection import get_connection
from app.database.repositories import labels as label_repo
from app.database.repositories.labels import normalize_labels
from app.database.repositories.labels import ensure_labels
from app.database.schema import initialize_schema
from app.domain.filters import IssueFilter
from app.domain.models import Issue
from app.utils.time import now_iso


# Ensure schema exists on import to keep old behavior
initialize_schema()


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
    clauses = ["(title LIKE ? OR body LIKE ?)"]
    params: list = [f"%{filter.keyword}%", f"%{filter.keyword}%"]

    if filter.status and filter.status != "ALL":
        clauses.append("status = ?")
        params.append(filter.status)

    if filter.assignee:
        clauses.append("assignee = ?")
        params.append(filter.assignee)

    if filter.milestone_id is not None:
        clauses.append("milestone_id = ?")
        params.append(filter.milestone_id)

    if filter.tags:
        placeholders = ",".join(["?"] * len(filter.tags))
        clauses.append(
            f"id IN (SELECT issue_id FROM issue_labels il JOIN labels l ON l.id = il.label_id WHERE l.name IN ({placeholders}))"
        )
        params.extend(filter.tags)

    where_clause = " AND ".join(clauses)
    order_clause = "ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(f"SELECT * FROM issues WHERE {where_clause} {order_clause}", params).fetchall()
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
        if labels is not None:
            _set_issue_labels(conn, iid, labels)
        return iid


def update_issue(issue_id: int, title: str, body: str, assignee: str | None = "", labels: list[str] | None = None, milestone_id: int | None = None) -> None:
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
        row = conn.execute("SELECT status FROM issues WHERE id = ?", (issue_id,)).fetchone()
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
