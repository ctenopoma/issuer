"""
milestone_service.py - Milestone logic
Single responsibility: milestone CRUD and progress calculation.
"""
from app.database.repositories import milestones as milestone_repo
from app.database.repositories import issues as issue_repo
from app.domain.models import Milestone
from app.utils.time import now_iso


def create(title: str, description: str = "", start_date: str | None = None, due_date: str | None = None, status: str = "planned") -> int:
    m = Milestone(
        title=title,
        description=description,
        start_date=start_date,
        due_date=due_date,
        status=status,
        created_at=now_iso(),
        updated_at=now_iso(),
    )
    return milestone_repo.create(m)


def update(milestone_id: int, **kwargs) -> None:
    current = milestone_repo.get(milestone_id)
    if not current:
        raise ValueError("Milestone not found")
    # id やタイムスタンプ系フィールドの不正更新を防止
    protected_fields = {"id", "created_at"}
    for k, v in kwargs.items():
        if k in protected_fields:
            continue
        if hasattr(current, k):
            setattr(current, k, v)
    current.updated_at = now_iso()
    milestone_repo.update(current)


def list_all():
    return milestone_repo.list_all()


def delete(milestone_id: int) -> None:
    milestone_repo.delete(milestone_id)


def progress(milestone_id: int) -> tuple[int, int, int]:
    """Return (total, closed, percent)."""
    total, closed = milestone_repo.count_issue_progress(milestone_id)
    if total == 0:
        return 0, 0, 0
    pct = int((closed / total) * 100)
    return total, closed, pct


def auto_status(milestone_id: int) -> str:
    total, closed, pct = progress(milestone_id)
    if total == 0:
        return "planned"
    if pct >= 100:
        return "closed"
    return "active"
