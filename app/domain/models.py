"""
models.py - Domain models
Single responsibility: typed containers for core entities.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class Issue:
    title: str
    body: str
    created_by: str
    status: str = "OPEN"
    assignee: str | None = ""
    created_at: str | None = None
    updated_at: str | None = None
    milestone_id: Optional[int] = None
    id: Optional[int] = None

    def __getitem__(self, key):
        return getattr(self, key)


@dataclass
class Comment:
    issue_id: int
    body: str
    created_by: str
    created_at: str | None = None
    id: Optional[int] = None

    def __getitem__(self, key):
        return getattr(self, key)


@dataclass
class Milestone:
    title: str
    description: str = ""
    start_date: str | None = None
    due_date: str | None = None
    status: str = "planned"
    created_at: str | None = None
    updated_at: str | None = None
    id: Optional[int] = None

    def __getitem__(self, key):
        return getattr(self, key)
