import flet as ft
from app.config import (
    COLOR_PRIMARY,
    COLOR_TEXT_MAIN,
    COLOR_TEXT_MUTED,
    COLOR_CARD,
    COLOR_BORDER,
    BORDER_RADIUS_CARD,
)


class MilestoneFilterBanner(ft.Container):
    def __init__(
        self,
        milestone: dict,
        progress: tuple[int, int, int] | None,
        on_clear_callback,
    ):
        super().__init__()
        self.milestone = milestone
        self.progress = progress
        self.on_clear_callback = on_clear_callback

        self.padding = ft.Padding.symmetric(horizontal=14, vertical=10)
        self.bgcolor = COLOR_CARD
        self.border_radius = BORDER_RADIUS_CARD
        self.border = ft.border.all(1, COLOR_BORDER)
        self.shadow = ft.BoxShadow(
            blur_radius=2,
            color=ft.Colors.BLACK12,
            offset=ft.Offset(0, 1),
        )
        self.content = self._build_content()

    def _build_content(self):
        total, closed, pct = self.progress or (0, 0, 0)
        return ft.Row(
            controls=[
                ft.Icon(ft.Icons.FLAG, color=COLOR_PRIMARY, size=16),
                ft.Column(
                    controls=[
                        ft.Text(
                            f"マイルストーンで絞り込み中: {self.milestone['title']}",
                            size=13,
                            weight=ft.FontWeight.W_600,
                            color=COLOR_TEXT_MAIN,
                        ),
                        ft.Text(
                            f"進捗 {pct}% ({closed}/{total})  ・  期限: {self.milestone['due_date'] or '未設定'}",
                            size=12,
                            color=COLOR_TEXT_MUTED,
                        ),
                    ],
                    spacing=2,
                ),
                ft.Container(expand=True),
                ft.IconButton(
                    icon=ft.Icons.CLOSE,
                    tooltip="マイルストーンフィルタを解除",
                    on_click=lambda e: self.on_clear_callback(),
                ),
            ],
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
        )
