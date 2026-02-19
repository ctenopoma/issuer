import flet as ft
from app.config import (
    COLOR_BORDER,
    COLOR_PRIMARY,
    COLOR_DANGER,
    BORDER_RADIUS_BTN,
)
from app.utils.attachments import save_clipboard_image


class CommentForm(ft.Container):
    def __init__(self, user_initial: str, on_submit, disabled: bool = False):
        super().__init__()
        self.user_initial = user_initial
        self.on_submit = on_submit
        self.disabled = disabled

        self.comment_input = ft.TextField(
            hint_text="コメントを入力... ",
            multiline=True,
            min_lines=3,
            max_lines=6,
            border_color="transparent",
            bgcolor="white",
            border_radius=BORDER_RADIUS_BTN,
            disabled=self.disabled,
            width=900,
            content_padding=ft.Padding.all(12),
        )

        self.content = self._build_content()

    def _build_content(self):
        return ft.Row(
            controls=[
                ft.CircleAvatar(
                    content=ft.Text(self.user_initial),
                    radius=16,
                    bgcolor=COLOR_PRIMARY,
                    color="white",
                ),
                self.comment_input,
                ft.IconButton(
                    icon=ft.Icons.IMAGE,
                    icon_color=COLOR_PRIMARY,
                    tooltip="クリップボードの画像を貼り付け",
                    on_click=self._on_paste_image,
                    disabled=self.disabled,
                ),
                ft.IconButton(
                    icon=ft.Icons.SEND,
                    icon_color=COLOR_PRIMARY,
                    tooltip="送信",
                    on_click=self._on_submit,
                    disabled=self.disabled,
                ),
            ],
            vertical_alignment=ft.CrossAxisAlignment.START,
        )

    def _on_paste_image(self, e):
        path = save_clipboard_image()
        if not path:
            if self.page:
                self.page.snack_bar = ft.SnackBar(
                    ft.Text("クリップボードに画像がありません"), bgcolor=COLOR_DANGER
                )
                self.page.snack_bar.open = True
                self.page.update()
            return

        current = self.comment_input.value or ""
        sep = "\n\n" if current.strip() else ""
        self.comment_input.value = f"{current.rstrip()}{sep}![image]({path})"
        self.comment_input.update()

    def _on_submit(self, e):
        body = self.comment_input.value.strip()
        if not body:
            return

        # Call the callback
        self.on_submit(body)

        # Clear input after submit
        self.comment_input.value = ""
        self.comment_input.update()
