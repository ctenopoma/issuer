"""
issue_service.py - Issue service layer
Single responsibility: orchestrate issue operations and enforce policies.
"""
from app.database.repositories import issues as issue_repo
from app.database.repositories import comments as comment_repo
from app.domain.filters import IssueFilter
from app.domain.models import Issue
from app.domain.reactions import REACTION_OPTIONS
from app.utils.time import now_iso


def list_issues(filter: IssueFilter):
    return issue_repo.list_issues(filter)


def get_issue(issue_id: int):
    return issue_repo.get_issue(issue_id)


def create_issue(title: str, body: str, created_by: str, assignee: str | None = "", labels=None, milestone_id=None) -> int:
    issue = Issue(
        title=title,
        body=body,
        created_by=created_by,
        assignee=assignee or "",
        milestone_id=milestone_id,
        created_at=now_iso(),
        updated_at=now_iso(),
    )
    return issue_repo.create_issue(issue, labels)


def update_issue(issue_id: int, title: str, body: str, assignee: str | None = "", labels=None, milestone_id=None) -> None:
    issue_repo.update_issue(issue_id, title, body, assignee, labels, milestone_id)


def toggle_status(issue_id: int) -> str:
    return issue_repo.toggle_status(issue_id)


def delete_issue(issue_id: int) -> None:
    # comments/labels are cascade; call delete to trigger
    issue_repo.delete_issue(issue_id)


def list_comments(issue_id: int):
    return comment_repo.list_by_issue(issue_id)


def add_comment(issue_id: int, body: str, created_by: str) -> int:
    return comment_repo.add_comment(issue_id, body, created_by)


def delete_comment(comment_id: int, current_user: str) -> bool:
    return comment_repo.delete_comment(comment_id, current_user)


def update_comment(comment_id: int, body: str, current_user: str) -> bool:
    return comment_repo.update_comment(comment_id, body, current_user)


def get_labels(issue_id: int) -> list[str]:
    return issue_repo.get_labels(issue_id)


def get_labels_map(issue_ids: list[int]):
    return issue_repo.get_labels_map(issue_ids)


def _ensure_reaction_allowed(reaction: str) -> None:
    if reaction not in REACTION_OPTIONS:
        raise ValueError(f"Unsupported reaction: {reaction}")


def get_issue_reactions(issue_id: int, current_user: str):
    return issue_repo.get_reactions(issue_id, current_user)


def toggle_issue_reaction(issue_id: int, reaction: str, current_user: str) -> None:
    _ensure_reaction_allowed(reaction)
    issue_repo.toggle_reaction(issue_id, reaction, current_user)


def get_comment_reactions(issue_id: int, current_user: str):
    return comment_repo.get_reactions_map(issue_id, current_user)


def toggle_comment_reaction(comment_id: int, reaction: str, current_user: str) -> bool:
    _ensure_reaction_allowed(reaction)
    return comment_repo.toggle_reaction(comment_id, reaction, current_user)
