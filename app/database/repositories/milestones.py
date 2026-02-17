"""
milestones.py - Milestone repository
Single responsibility: persistence for milestones and progress queries.
"""
from app.database.connection import get_connection
from app.domain.models import Milestone
from app.utils.time import now_iso


def create(m: Milestone) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO milestones (title, description, start_date, due_date, status, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                m.title,
                m.description or "",
                m.start_date,
                m.due_date,
                m.status,
                m.created_at or now_iso(),
                m.updated_at or now_iso(),
            ),
        )
        return cur.lastrowid


def update(m: Milestone) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE milestones SET title = ?, description = ?, start_date = ?, due_date = ?, status = ?, updated_at = ? WHERE id = ?",
            (
                m.title,
                m.description or "",
                m.start_date,
                m.due_date,
                m.status,
                now_iso(),
                m.id,
            ),
        )


def get(milestone_id: int) -> Milestone | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM milestones WHERE id = ?", (milestone_id,)).fetchone()
        if not row:
            return None
        return Milestone(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            start_date=row["start_date"],
            due_date=row["due_date"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


def list_all() -> list[Milestone]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM milestones ORDER BY COALESCE(due_date, '9999-12-31'), id DESC"
        ).fetchall()
        return [
            Milestone(
                id=r["id"],
                title=r["title"],
                description=r["description"],
                start_date=r["start_date"],
                due_date=r["due_date"],
                status=r["status"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
            )
            for r in rows
        ]


def delete(milestone_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM milestones WHERE id = ?", (milestone_id,))


def count_issue_progress(milestone_id: int) -> tuple[int, int]:
    """Return (total, closed) for issues in milestone."""
    with get_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM issues WHERE milestone_id = ?",
            (milestone_id,),
        ).fetchone()[0]
        closed = conn.execute(
            "SELECT COUNT(*) FROM issues WHERE milestone_id = ? AND status = 'CLOSED'",
            (milestone_id,),
        ).fetchone()[0]
        return total, closed
