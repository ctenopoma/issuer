import flet as ft
from app.config import (
    COLOR_OPEN,
    COLOR_CLOSED,
    COLOR_CARD,
    COLOR_TEXT_MUTED,
    COLOR_TEXT_MAIN,
    COLOR_PRIMARY,
    BORDER_RADIUS_CARD,
)
from app.ui.helpers import format_datetime


class IssueListCard(ft.Container):
    def __init__(
        self,
        issue: dict,
        labels_map: dict[int, list[str]],
        milestone_map: dict[int, str],
        on_click_callback,
    ):
        super().__init__()
        self.issue = issue
        self.labels_map = labels_map
        self.milestone_map = milestone_map
        self.on_click_callback = on_click_callback

        self.padding = ft.Padding.all(16)
        self.bgcolor = COLOR_CARD
        self.border_radius = BORDER_RADIUS_CARD
        self.border = ft.border.all(1, "transparent")
        self.shadow = ft.BoxShadow(
            blur_radius=2,
            color=ft.Colors.BLACK12,
            offset=ft.Offset(0, 1),
        )
        self.on_click = self._handle_click
        self.ink = True
        self.margin = ft.margin.only(bottom=12)

        self.content = self._build_content()

    def _handle_click(self, e):
        if self.on_click_callback:
            self.on_click_callback(self.issue["id"])

    def _build_content(self):
        issue = self.issue
        created_fmt = format_datetime(issue["created_at"])
        assignee = issue["assignee"] or "未割り当て"
        labels = self.labels_map.get(issue["id"], [])
        milestone_text = None
        if getattr(issue, "milestone_id", None):
            milestone_text = self.milestone_map.get(issue["milestone_id"], None)

        accent_color = COLOR_OPEN if issue["status"] == "OPEN" else COLOR_CLOSED
        status_icon = (
            ft.Icons.ADJUST if issue["status"] == "OPEN" else ft.Icons.CHECK_CIRCLE
        )

        meta_row = [
            ft.Text(f"#{issue['id']}", size=12, color=COLOR_TEXT_MUTED),
            ft.Text(
                f"{issue['created_by']} が {created_fmt} に作成",
                size=12,
                color=COLOR_TEXT_MUTED,
            ),
            ft.Text(f"・  担当: {assignee}", size=12, color=COLOR_TEXT_MUTED),
        ]
        if milestone_text:
            meta_row.append(
                ft.Text(
                    f"・  マイルストーン: {milestone_text}",
                    size=12,
                    color=COLOR_TEXT_MUTED,
                )
            )

        return ft.Row(
            controls=[
                ft.Icon(status_icon, size=24, color=accent_color),
                ft.Column(
                    controls=[
                        ft.Text(
                            issue["title"],
                            weight=ft.FontWeight.BOLD,
                            size=16,
                            color=COLOR_TEXT_MAIN,
                            max_lines=1,
                            overflow=ft.TextOverflow.ELLIPSIS,
                        ),
                        ft.Row(controls=meta_row, spacing=8, wrap=True),
                        *(
                            [
                                ft.Row(
                                    controls=[
                                        ft.Container(
                                            content=ft.Text(
                                                lbl,
                                                size=11,
                                                color=COLOR_PRIMARY,
                                                weight=ft.FontWeight.W_500,
                                            ),
                                            bgcolor="#E6F2FF",
                                            padding=ft.Padding.symmetric(
                                                horizontal=8, vertical=2
                                            ),
                                            border_radius=10,
                                        )
                                        for lbl in labels
                                    ],
                                    spacing=4,
                                    run_spacing=4,
                                    wrap=True,
                                )
                            ]
                            if labels
                            else []
                        ),
                    ],
                    spacing=4,
                    expand=True,
                ),
                ft.Container(
                    content=ft.Text(
                        issue["status"],
                        size=11,
                        color="white",
                        weight=ft.FontWeight.BOLD,
                    ),
                    bgcolor=accent_color,
                    border_radius=12,
                    padding=ft.Padding.symmetric(horizontal=10, vertical=2),
                ),
            ],
            spacing=16,
            alignment=ft.MainAxisAlignment.START,
            vertical_alignment=ft.CrossAxisAlignment.START,
        )
