"""
filter_service.py - Filter helpers and presets
Single responsibility: build IssueFilter with priority rules.
"""
from app.domain.filters import IssueFilter


def build_filter(keyword: str = "", status: str = "ALL", assignee: str | None = None, tags: list[str] | None = None, milestone_id=None) -> IssueFilter:
    tags = tags or []
    # Priority: assignee -> status -> tags already reflected by ordering when building WHERE in repository
    return IssueFilter(
        status=status or "ALL",
        keyword=keyword or "",
        assignee=assignee or None,
        tags=tags,
        milestone_id=milestone_id,
    )


# Preset placeholder (extendable)
_last_filter: IssueFilter | None = None


def save_last(filter: IssueFilter) -> None:
    global _last_filter
    _last_filter = filter


def load_last(default: IssueFilter | None = None) -> IssueFilter:
    return _last_filter or default or IssueFilter()
