"""
db.py - データベース操作モジュール
Issue Manager v1.0
"""
import sqlite3
from datetime import datetime

from app.config import DB_PATH


# ---------------------------------------------------------------------------
# 接続
# ---------------------------------------------------------------------------

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row          # カラム名でアクセス可能
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")  # 共有フォルダ越しの競合を軽減
    return conn
"""
db.py - Compatibility façade to the refactored data/service layers.
Single responsibility: provide the legacy API used by ui.py while delegating
to repository/service modules that follow single-responsibility design.
"""
from app.database.connection import get_connection
from app.database.schema import initialize_schema
from app.domain.filters import IssueFilter
from app.services import issue_service, filter_service, milestone_service
from app.database.repositories import labels as label_repo


# ---------------------------------------------------------------------------
# 初期化
# ---------------------------------------------------------------------------

def initialize_db() -> None:
    initialize_schema()


# ---------------------------------------------------------------------------
# Issues CRUD (delegates to service layer)
# ---------------------------------------------------------------------------

def get_issues(status: str = "ALL", keyword: str = "", assignee: str | None = None):
    flt = filter_service.build_filter(keyword=keyword, status=status, assignee=assignee)
    return issue_service.list_issues(flt)


def get_issue(issue_id: int):
    return issue_service.get_issue(issue_id)


def create_issue(title: str, body: str, created_by: str) -> int:
    return create_issue_with_meta(title, body, created_by, assignee="", labels=None)


def create_issue_with_meta(
    title: str,
    body: str,
    created_by: str,
    assignee: str | None = "",
    labels: list[str] | None = None,
    milestone_id=None,
) -> int:
    return issue_service.create_issue(title, body, created_by, assignee, labels, milestone_id)


def update_issue(
    issue_id: int,
    title: str,
    body: str,
    assignee: str | None = "",
    labels: list[str] | None = None,
    milestone_id=None,
) -> None:
    issue_service.update_issue(issue_id, title, body, assignee, labels, milestone_id)


def toggle_issue_status(issue_id: int) -> str:
    return issue_service.toggle_status(issue_id)


def delete_issue(issue_id: int) -> None:
    issue_service.delete_issue(issue_id)


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------

def get_labels(issue_id: int) -> list[str]:
    return issue_service.get_labels(issue_id)


def get_labels_map(issue_ids: list[int]) -> dict[int, list[str]]:
    return issue_service.get_labels_map(issue_ids)


def list_all_labels() -> list[str]:
    return label_repo.list_all()


# ---------------------------------------------------------------------------
# Comments CRUD
# ---------------------------------------------------------------------------

def get_comments(issue_id: int):
    return issue_service.list_comments(issue_id)


def add_comment(issue_id: int, body: str, created_by: str) -> int:
    return issue_service.add_comment(issue_id, body, created_by)


def delete_comment(comment_id: int, current_user: str) -> bool:
    return issue_service.delete_comment(comment_id, current_user)


# ---------------------------------------------------------------------------
# Milestones (new API surface, used by future UI updates)
# ---------------------------------------------------------------------------

def list_milestones():
    return milestone_service.list_all()


def create_milestone(title: str, description: str = "", start_date: str | None = None, due_date: str | None = None):
    return milestone_service.create(title, description, start_date, due_date)


def update_milestone(milestone_id: int, **kwargs):
    return milestone_service.update(milestone_id, **kwargs)


def delete_milestone(milestone_id: int):
    return milestone_service.delete(milestone_id)
    query = "SELECT * FROM issues WHERE (title LIKE ? OR body LIKE ?)"
