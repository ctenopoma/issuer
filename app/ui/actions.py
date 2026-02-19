"""
actions.py - UI-side actions and dialogs
Single responsibility: handle modal flows that mutate issues.
"""

from datetime import date

import flet as ft

from app.config import (
    COLOR_BORDER,
    COLOR_PRIMARY,
    BORDER_RADIUS_BTN,
    BORDER_RADIUS_CARD,
    COLOR_DANGER,
)
from app.services import issue_service, milestone_service
from app.ui.helpers import parse_labels
from app.utils.attachments import save_clipboard_image


def _set_due_date_value(e: ft.ControlEvent, field: ft.TextField, page: ft.Page) -> None:
    """Sync DatePicker value into the read-only text field (YYYY-MM-DD)."""
    val = getattr(e.control, "value", "")
    if val:
        try:
            field.value = (
                val.strftime("%Y-%m-%d") if hasattr(val, "strftime") else str(val)
            )
        except Exception:
            field.value = str(val)
    else:
        field.value = ""
    page.update()


def _open_date_picker(dp: ft.DatePicker, page: ft.Page) -> None:
    """Open DatePicker for environments where pick_date is unavailable."""
    dp.open = True
    page.update()


def show_new_issue_dialog(page: ft.Page, state, user: str, on_created):
    """Open a dialog to create a new issue and refresh the list on success."""
    milestones = milestone_service.list_all()

    def insert_clipboard_image(
        target_field, on_fail_msg="クリップボードに画像がありません"
    ):
        path = save_clipboard_image()
        if not path:
            page.snack_bar = ft.SnackBar(ft.Text(on_fail_msg), bgcolor=COLOR_DANGER)
            page.snack_bar.open = True
            page.update()
            return

        current = target_field.value or ""
        sep = "\n\n" if current.strip() else ""
        target_field.value = f"{current.rstrip()}{sep}![image]({path})"
        page.update()

    title_field = ft.TextField(
        label="タイトル *",
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
    )
    assignee_field = ft.TextField(
        label="担当者",
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
    )
    milestone_field = ft.Dropdown(
        label="マイルストーン",
        options=[ft.dropdown.Option(key="", text="(なし)")]
        + [ft.dropdown.Option(key=str(m["id"]), text=m["title"]) for m in milestones],
        value="",
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
    )
    labels_field = ft.TextField(
        label="ラベル（カンマ区切り）",
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
    )
    body_field = ft.TextField(
        height=500,
        width=500,
        label="本文（Markdown 対応）",
        multiline=True,
        min_lines=6,
        max_lines=14,
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
        suffix=ft.IconButton(
            icon=ft.Icons.IMAGE,
            icon_color=COLOR_PRIMARY,
            tooltip="クリップボード画像を貼り付け",
            on_click=lambda _e: insert_clipboard_image(body_field),
        ),
    )
    error_text = ft.Text("", color=COLOR_DANGER, size=12)

    def on_paste_image_into_body(_e=None):
        insert_clipboard_image(body_field)

    def on_save(_e=None):
        title = (title_field.value or "").strip()
        if not title:
            error_text.value = "⚠  タイトルは必須です"
            page.update()
            return
        milestone_val = milestone_field.value or ""
        milestone_id = int(milestone_val) if milestone_val else None
        issue_id = issue_service.create_issue(
            title=title,
            body=(body_field.value or "").strip(),
            created_by=user,
            assignee=(assignee_field.value or "").strip(),
            labels=parse_labels(labels_field.value),
            milestone_id=milestone_id,
        )
        state.selected_issue_id = issue_id
        dialog.open = False
        on_created()
        page.update()

    def on_cancel(_e=None):
        dialog.open = False
        page.update()

    dialog = ft.AlertDialog(
        modal=True,
        title=ft.Text("新しい Issue を作成", weight=ft.FontWeight.BOLD),
        content=ft.Container(
            content=ft.Column(
                controls=[
                    title_field,
                    assignee_field,
                    milestone_field,
                    labels_field,
                    body_field,
                    error_text,
                ],
                spacing=16,
                tight=True,
            ),
            width=600,
        ),
        actions=[
            ft.TextButton("キャンセル", on_click=on_cancel),
            ft.FilledButton(
                "作成",
                style=ft.ButtonStyle(bgcolor=COLOR_PRIMARY, color="white"),
                on_click=on_save,
            ),
        ],
        actions_alignment=ft.MainAxisAlignment.END,
        shape=ft.RoundedRectangleBorder(radius=BORDER_RADIUS_CARD),
    )
    page.overlay.append(dialog)
    dialog.open = True
    page.update()


def show_new_milestone_dialog(page: ft.Page, on_created):
    """Open a dialog to create a new milestone and refresh the view on success."""
    title_field = ft.TextField(
        label="タイトル *",
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
    )
    description_field = ft.TextField(
        label="説明",
        multiline=True,
        min_lines=2,
        max_lines=6,
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
    )
    start_date_field = ft.TextField(
        label="開始日",
        hint_text="日付を選択",
        read_only=True,
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
    )
    start_date_picker = ft.DatePicker(
        first_date=date(2000, 1, 1),
        last_date=date(2100, 12, 31),
        on_change=lambda e: _set_due_date_value(e, start_date_field, page),
    )
    page.overlay.append(start_date_picker)
    start_date_field.suffix = ft.IconButton(
        icon=ft.Icons.CALENDAR_MONTH,
        tooltip="日付を選択",
        on_click=lambda _e: _open_date_picker(start_date_picker, page),
    )
    due_date_field = ft.TextField(
        label="期限",
        hint_text="日付を選択",
        read_only=True,
        border_color=COLOR_BORDER,
        focused_border_color=COLOR_PRIMARY,
        border_radius=BORDER_RADIUS_BTN,
        suffix=ft.IconButton(
            icon=ft.Icons.CALENDAR_MONTH,
            tooltip="日付を選択",
            on_click=lambda _e: _open_date_picker(due_date_picker, page),
        ),
    )
    due_date_picker = ft.DatePicker(
        first_date=date(2000, 1, 1),
        last_date=date(2100, 12, 31),
        on_change=lambda e: _set_due_date_value(e, due_date_field, page),
    )
    page.overlay.append(due_date_picker)
    error_text = ft.Text("", color=COLOR_DANGER, size=12)

    def on_save(_e=None):
        title = (title_field.value or "").strip()
        if not title:
            error_text.value = "⚠  タイトルは必須です"
            page.update()
            return

        milestone_service.create(
            title=title,
            description=(description_field.value or "").strip(),
            start_date=(start_date_field.value or "").strip() or None,
            due_date=(due_date_field.value or "").strip() or None,
        )
        dialog.open = False
        on_created()
        page.update()

    def on_cancel(_e=None):
        dialog.open = False
        page.update()

    dialog = ft.AlertDialog(
        modal=True,
        title=ft.Text("マイルストーンを追加", weight=ft.FontWeight.BOLD),
        content=ft.Container(
            content=ft.Column(
                controls=[
                    title_field,
                    description_field,
                    start_date_field,
                    due_date_field,
                    error_text,
                ],
                spacing=14,
                tight=True,
            ),
            width=520,
        ),
        actions=[
            ft.TextButton("キャンセル", on_click=on_cancel),
            ft.FilledButton(
                "作成",
                style=ft.ButtonStyle(bgcolor=COLOR_PRIMARY, color="white"),
                on_click=on_save,
            ),
        ],
        actions_alignment=ft.MainAxisAlignment.END,
        shape=ft.RoundedRectangleBorder(radius=BORDER_RADIUS_CARD),
    )
    page.overlay.append(dialog)
    dialog.open = True
    page.update()


def show_manage_milestones(page: ft.Page, on_changed):
    """Open a dialog to edit/delete milestones and refresh caller on change."""

    list_column = ft.Column(
        spacing=10, tight=True, scroll=ft.ScrollMode.AUTO, height=380
    )

    def refresh_list():
        milestones = milestone_service.list_all()
        rows = []
        for m in milestones:
            try:
                total, closed, pct = milestone_service.progress(m["id"])
            except Exception:
                total, closed, pct = 0, 0, 0

            def open_edit_dialog(_e=None, milestone=m):
                title_field = ft.TextField(
                    label="タイトル *",
                    value=milestone["title"],
                    border_color=COLOR_BORDER,
                    focused_border_color=COLOR_PRIMARY,
                    border_radius=BORDER_RADIUS_BTN,
                )
                description_field = ft.TextField(
                    label="説明",
                    value=milestone["description"] or "",
                    multiline=True,
                    min_lines=2,
                    max_lines=6,
                    border_color=COLOR_BORDER,
                    focused_border_color=COLOR_PRIMARY,
                    border_radius=BORDER_RADIUS_BTN,
                )
                start_date_field = ft.TextField(
                    label="開始日",
                    value=milestone["start_date"] or "",
                    hint_text="日付を選択",
                    read_only=True,
                    border_color=COLOR_BORDER,
                    focused_border_color=COLOR_PRIMARY,
                    border_radius=BORDER_RADIUS_BTN,
                )
                start_date_picker = ft.DatePicker(
                    first_date=date(2000, 1, 1),
                    last_date=date(2100, 12, 31),
                    on_change=lambda e, fld=start_date_field: _set_due_date_value(
                        e, fld, page
                    ),
                )
                page.overlay.append(start_date_picker)
                start_date_field.suffix = ft.IconButton(
                    icon=ft.Icons.CALENDAR_MONTH,
                    tooltip="日付を選択",
                    on_click=lambda _e, dp=start_date_picker: _open_date_picker(
                        dp, page
                    ),
                )
                due_date_field = ft.TextField(
                    label="期限",
                    value=milestone["due_date"] or "",
                    hint_text="日付を選択",
                    read_only=True,
                    border_color=COLOR_BORDER,
                    focused_border_color=COLOR_PRIMARY,
                    border_radius=BORDER_RADIUS_BTN,
                )
                due_date_picker = ft.DatePicker(
                    first_date=date(2000, 1, 1),
                    last_date=date(2100, 12, 31),
                    on_change=lambda e, fld=due_date_field: _set_due_date_value(
                        e, fld, page
                    ),
                )
                page.overlay.append(due_date_picker)
                due_date_field.suffix = ft.IconButton(
                    icon=ft.Icons.CALENDAR_MONTH,
                    tooltip="日付を選択",
                    on_click=lambda _e, dp=due_date_picker: _open_date_picker(dp, page),
                )
                status_field = ft.Dropdown(
                    label="ステータス",
                    options=[
                        ft.dropdown.Option("planned", "planned"),
                        ft.dropdown.Option("active", "active"),
                        ft.dropdown.Option("closed", "closed"),
                    ],
                    value=milestone["status"] or "planned",
                    border_color=COLOR_BORDER,
                    focused_border_color=COLOR_PRIMARY,
                    border_radius=BORDER_RADIUS_BTN,
                )
                error_text = ft.Text("", color=COLOR_DANGER, size=12)

                def on_save(_ev=None):
                    title_val = (title_field.value or "").strip()
                    if not title_val:
                        error_text.value = "⚠  タイトルは必須です"
                        page.update()
                        return
                    milestone_service.update(
                        milestone["id"],
                        title=title_val,
                        description=(description_field.value or "").strip(),
                        start_date=(start_date_field.value or "").strip() or None,
                        due_date=(due_date_field.value or "").strip() or None,
                        status=status_field.value or "planned",
                    )
                    edit_dlg.open = False
                    page.update()
                    refresh_list()
                    on_changed()

                def on_cancel(_ev=None):
                    edit_dlg.open = False
                    page.update()

                edit_dlg = ft.AlertDialog(
                    modal=True,
                    title=ft.Text("マイルストーンを編集", weight=ft.FontWeight.BOLD),
                    content=ft.Container(
                        width=540,
                        content=ft.Column(
                            controls=[
                                title_field,
                                description_field,
                                start_date_field,
                                due_date_field,
                                status_field,
                                error_text,
                            ],
                            spacing=14,
                            tight=True,
                        ),
                    ),
                    actions=[
                        ft.TextButton("キャンセル", on_click=on_cancel),
                        ft.FilledButton(
                            "保存",
                            style=ft.ButtonStyle(bgcolor=COLOR_PRIMARY, color="white"),
                            on_click=on_save,
                        ),
                    ],
                    actions_alignment=ft.MainAxisAlignment.END,
                    shape=ft.RoundedRectangleBorder(radius=BORDER_RADIUS_CARD),
                )
                page.overlay.append(edit_dlg)
                edit_dlg.open = True
                page.update()

            def confirm_delete(
                _e=None, milestone_id=m["id"], milestone_title=m["title"]
            ):
                def do_delete(_ev=None):
                    milestone_service.delete(milestone_id)
                    delete_dlg.open = False
                    page.update()
                    refresh_list()
                    on_changed()

                def cancel_delete(_ev=None):
                    delete_dlg.open = False
                    page.update()

                delete_dlg = ft.AlertDialog(
                    modal=True,
                    title=ft.Text("マイルストーンを削除", weight=ft.FontWeight.BOLD),
                    content=ft.Text(
                        f"'{milestone_title}' を削除しますか？ この操作は元に戻せません。",
                        color=COLOR_DANGER,
                    ),
                    actions=[
                        ft.TextButton("キャンセル", on_click=cancel_delete),
                        ft.FilledButton(
                            "削除",
                            bgcolor=COLOR_DANGER,
                            color="white",
                            on_click=do_delete,
                        ),
                    ],
                    actions_alignment=ft.MainAxisAlignment.END,
                )
                page.overlay.append(delete_dlg)
                delete_dlg.open = True
                page.update()

            rows.append(
                ft.Container(
                    padding=ft.Padding.all(12),
                    bgcolor=ft.Colors.WHITE,
                    border_radius=BORDER_RADIUS_CARD,
                    shadow=ft.BoxShadow(
                        blur_radius=2,
                        color=ft.Colors.BLACK12,
                        offset=ft.Offset(0, 1),
                    ),
                    content=ft.Row(
                        controls=[
                            ft.Column(
                                controls=[
                                    ft.Text(
                                        m["title"], weight=ft.FontWeight.BOLD, size=15
                                    ),
                                    ft.Text(
                                        f"開始: {m['start_date'] or '未設定'}  ・  期限: {m['due_date'] or '未設定'}  ・  ステータス: {m['status']}  ・  進捗 {pct}% ({closed}/{total})",
                                        size=12,
                                        color=COLOR_BORDER,
                                    ),
                                ],
                                spacing=4,
                                expand=True,
                            ),
                            ft.Row(
                                controls=[
                                    ft.IconButton(
                                        icon=ft.Icons.EDIT_NOTE,
                                        tooltip="編集",
                                        on_click=open_edit_dialog,
                                    ),
                                    ft.IconButton(
                                        icon=ft.Icons.DELETE_OUTLINE,
                                        icon_color=COLOR_DANGER,
                                        tooltip="削除",
                                        on_click=confirm_delete,
                                    ),
                                ],
                                spacing=4,
                            ),
                        ],
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                )
            )

        list_column.controls = rows or [
            ft.Text("マイルストーンがありません", color=COLOR_BORDER)
        ]
        page.update()

    refresh_list()

    def on_close(_e=None):
        dialog.open = False
        page.update()

    dialog = ft.AlertDialog(
        modal=True,
        title=ft.Text("マイルストーンを管理", weight=ft.FontWeight.BOLD),
        content=ft.Container(
            width=760,
            content=list_column,
        ),
        actions=[ft.TextButton("閉じる", on_click=on_close)],
        actions_alignment=ft.MainAxisAlignment.END,
        shape=ft.RoundedRectangleBorder(radius=BORDER_RADIUS_CARD),
    )
    page.overlay.append(dialog)
    dialog.open = True
    page.update()
