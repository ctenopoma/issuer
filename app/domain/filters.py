"""
filters.py - Filter DTOs
Single responsibility: carry filter inputs for queries.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class IssueFilter:
    status: str = "ALL"
    keyword: str = ""
    assignee: str | None = None
    milestone_id: Optional[int] = None
    tags: list[str] = field(default_factory=list)
