"""
ui_state.py - UI state container
"""

class AppState:
    def __init__(self):
        self.mode: str = "edit"  # "edit" | "readonly"
        self.locked_by: str | None = None
        self.current_tab: str = "OPEN"  # "OPEN" | "CLOSED" | "ALL"
        self.keyword: str = ""
        self.selected_issue_id: int | None = None
        self.filter_assignee: str = ""
        self.filter_tags_text: str = ""
        self.filter_milestone_id: int | None = None
