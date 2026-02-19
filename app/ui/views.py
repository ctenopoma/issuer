"""
views.py - UI view builders (list/detail)
Single responsibility: build flet Views using provided callbacks/state.
"""

import asyncio
import os
from datetime import date

import flet as ft

from app.config import (
    APP_TITLE,
    COLOR_OPEN,
    COLOR_CLOSED,
    COLOR_BG,
    COLOR_CARD,
    COLOR_BORDER,
    COLOR_TEXT_MUTED,
    COLOR_TEXT_MAIN,
    COLOR_PRIMARY,
    COLOR_DANGER,
    COLOR_APPBAR_BG,
    COLOR_APPBAR_FG,
    BORDER_RADIUS_CARD,
    BORDER_RADIUS_BTN,
    SHADOW_ELEVATION,
    DEFAULT_PAGE_SIZE,
)
from app.domain.reactions import REACTION_OPTIONS
from app.services import issue_service, filter_service, milestone_service
from app.ui.helpers import (
    format_datetime,
    status_color,
    parse_labels,
)
from app.utils.attachments import save_clipboard_image
from app.utils.linkify import linkify_file_paths, linkify_issues
from app.utils.outlook import create_issue_email_draft


def _parse_iso_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except Exception:
        return None


def _remaining_days_text(due_date_str: str | None):
    d = _parse_iso_date(due_date_str)
    if not d:
        return "期限未設定", COLOR_TEXT_MUTED
    delta = (d - date.today()).days
    if delta > 0:
        return f"残り{delta}日", COLOR_TEXT_MAIN
    if delta == 0:
        return "今日が期限", COLOR_DANGER
    return f"{abs(delta)}日超過", COLOR_DANGER


def build_appbar(state_mode: str, locked_by: str | None, user: str) -> ft.AppBar:
    if state_mode == "edit":
        lock_text = f"🟢  {user}"
        lock_color = COLOR_OPEN
    else:
        lock_text = f"🔒  閲覧専用（編集中: {locked_by}）"
        lock_color = COLOR_DANGER

    return ft.AppBar(
        title=ft.Text(
            APP_TITLE,
            color=COLOR_APPBAR_FG,
            weight=ft.FontWeight.BOLD,
            size=20,
        ),
        bgcolor=COLOR_APPBAR_BG,
        center_title=False,
        elevation=SHADOW_ELEVATION,
        shadow_color=ft.Colors.BLACK12,
        automatically_imply_leading=False,
        actions=[
            ft.Container(
                content=ft.Text(
                    lock_text, color=lock_color, size=14, weight=ft.FontWeight.W_500
                ),
                padding=ft.Padding.only(right=24),
                alignment=ft.Alignment.CENTER_LEFT,
            ),
        ],
    )


def build_issue_list_view(
    page: ft.Page,
    state,
    user: str,
    on_new_issue,
    on_new_milestone,
    on_manage_milestones,
    on_show_milestone_progress,
    on_clear_milestone_filter,
    on_select_issue,
    on_save_filter,
    on_save_preset,
    on_load_preset,
    on_clear_filter,
):
    search_task: asyncio.Task | None = None

    # --- Initial data loading for first render ---
    issue_filter = filter_service.build_filter(
        keyword=state.keyword,
        status=state.current_tab,
        assignee=state.filter_assignee or None,
        tags=parse_labels(state.filter_tags_text),
        milestone_id=state.filter_milestone_id,
    )
    issues = issue_service.list_issues(issue_filter)
    issues = issues[:DEFAULT_PAGE_SIZE]
    milestones = milestone_service.list_all()
    milestone_map = {m["id"]: m["title"] for m in milestones}
    active_milestone = next(
        (m for m in milestones if m["id"] == state.filter_milestone_id), None
    )
    active_milestone_progress: tuple[int, int, int] | None = None
    if active_milestone:
        try:
            active_milestone_progress = milestone_service.progress(
                active_milestone["id"]
            )
        except Exception:
            active_milestone_progress = None
    labels_map = issue_service.get_labels_map([issue["id"] for issue in issues])

    # Reference to the issue list column for in-place updates during search
    list_column_ref = ft.Ref[ft.Column]()

    def save_filter_and_refresh():
        """Full view rebuild — used by tab/assignee/tag filters."""
        filt = filter_service.build_filter(
            keyword=state.keyword,
            status=state.current_tab,
            assignee=state.filter_assignee or None,
            tags=parse_labels(state.filter_tags_text),
            milestone_id=state.filter_milestone_id,
        )
        filter_service.save_last(filt)
        on_save_filter()

    def _update_list_content_inplace():
        """Update only the issue list controls without rebuilding the whole view."""
        nonlocal labels_map
        filt = filter_service.build_filter(
            keyword=state.keyword,
            status=state.current_tab,
            assignee=state.filter_assignee or None,
            tags=parse_labels(state.filter_tags_text),
            milestone_id=state.filter_milestone_id,
        )
        filter_service.save_last(filt)
        new_issues = issue_service.list_issues(filt)[:DEFAULT_PAGE_SIZE]
        labels_map = issue_service.get_labels_map([i["id"] for i in new_issues])
        cards = [build_issue_card(issue) for issue in new_issues]

        col = list_column_ref.current
        if col is None:
            # Fallback: full refresh if ref is not available
            on_save_filter()
            return
        if not cards:
            col.controls = [
                ft.Container(
                    content=ft.Column(
                        [
                            ft.Icon(ft.Icons.INBOX, size=64, color="#d0d7de"),
                            ft.Text(
                                "そのステータスの Issue はありません",
                                color=COLOR_TEXT_MUTED,
                                size=16,
                            ),
                        ],
                        horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                    alignment=ft.Alignment.CENTER,
                    padding=60,
                    expand=True,
                )
            ]
        else:
            col.controls = cards
        col.update()

    async def _debounced_search(term_snapshot: str):
        # Debounce to avoid rebuilding the list on every keystroke
        try:
            await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            return
        if term_snapshot == state.keyword:
            _update_list_content_inplace()

    def on_search(e):
        nonlocal search_task
        state.keyword = e.control.value or ""
        if search_task and not search_task.done():
            search_task.cancel()

        # Wrap to ensure we always pass a coroutine function (no pre-created coroutine objects)
        async def runner(term: str):
            await _debounced_search(term)

        # Use Flet's event loop runner to ensure the task runs even in sync apps
        search_task = page.run_task(runner, state.keyword)

    assignee_task: asyncio.Task | None = None
    tags_task: asyncio.Task | None = None

    def on_assignee_change(e):
        nonlocal assignee_task
        state.filter_assignee = e.control.value.strip()
        if assignee_task and not assignee_task.done():
            assignee_task.cancel()

        async def runner(snapshot: str):
            try:
                await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                return
            if snapshot == state.filter_assignee:
                _update_list_content_inplace()

        assignee_task = page.run_task(runner, state.filter_assignee)

    def on_tags_change(e):
        nonlocal tags_task
        state.filter_tags_text = e.control.value
        if tags_task and not tags_task.done():
            tags_task.cancel()

        async def runner(snapshot: str):
            try:
                await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                return
            if snapshot == state.filter_tags_text:
                _update_list_content_inplace()

        tags_task = page.run_task(runner, state.filter_tags_text)

    def on_tab_click(tab_key):
        state.current_tab = tab_key
        state.keyword = search_field.value or ""
        save_filter_and_refresh()

    def build_tab_btn(label, icon, tab_key):
        selected = state.current_tab == tab_key
        color = COLOR_PRIMARY if selected else COLOR_TEXT_MUTED
        return ft.Container(
            content=ft.Row(
                [
                    ft.Icon(icon, color=color, size=18),
                    ft.Text(
                        label,
                        color=color,
                        weight=ft.FontWeight.BOLD if selected else ft.FontWeight.NORMAL,
                    ),
                ],
                alignment=ft.MainAxisAlignment.CENTER,
                spacing=8,
            ),
            padding=ft.Padding.symmetric(vertical=12, horizontal=24),
            border=ft.border.only(
                bottom=ft.BorderSide(2, COLOR_PRIMARY if selected else "transparent")
            ),
            on_click=lambda _: on_tab_click(tab_key),
            ink=True,
            animate=ft.Animation(200, "easeOut"),
            border_radius=ft.border_radius.only(top_left=6, top_right=6),
        )

    tabs = ft.Row(
        controls=[
            build_tab_btn("Open", ft.Icons.ADJUST, "OPEN"),
            build_tab_btn("Closed", ft.Icons.CHECK_CIRCLE, "CLOSED"),
            build_tab_btn("All", ft.Icons.LIST, "ALL"),
        ],
        spacing=0,
        alignment=ft.MainAxisAlignment.START,
    )

    search_field = ft.TextField(
        prefix_icon=ft.Icons.SEARCH,
        hint_text="キーワードで検索...",
        value=state.keyword,
        on_change=on_search,
        border_radius=BORDER_RADIUS_BTN,
        border_color="transparent",
        bgcolor=COLOR_CARD,
        content_padding=ft.Padding.symmetric(horizontal=12, vertical=12),
        text_size=14,
    )

    assignee_field = ft.TextField(
        prefix_icon=ft.Icons.PERSON_SEARCH,
        hint_text="担当者で絞り込み",
        value=state.filter_assignee,
        on_change=on_assignee_change,
        border_radius=BORDER_RADIUS_BTN,
        border_color="transparent",
        bgcolor=COLOR_CARD,
        content_padding=ft.Padding.symmetric(horizontal=12, vertical=12),
        text_size=14,
    )

    tags_field = ft.TextField(
        prefix_icon=ft.Icons.LABEL_OUTLINE,
        hint_text="タグ（カンマ区切り）",
        value=state.filter_tags_text,
        on_change=on_tags_change,
        border_radius=BORDER_RADIUS_BTN,
        border_color="transparent",
        bgcolor=COLOR_CARD,
        content_padding=ft.Padding.symmetric(horizontal=12, vertical=12),
        text_size=14,
    )

    def build_issue_card(issue) -> ft.Container:
        created_fmt = format_datetime(issue["created_at"])
        assignee = issue["assignee"] or "未割り当て"
        labels = labels_map.get(issue["id"], [])
        milestone_text = None
        if getattr(issue, "milestone_id", None):
            milestone_text = milestone_map.get(issue["milestone_id"], None)

        def on_tap(_e, iid=issue["id"]):
            on_select_issue(iid)

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

        return ft.Container(
            content=ft.Row(
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
            ),
            padding=ft.Padding.all(16),
            bgcolor=COLOR_CARD,
            border_radius=BORDER_RADIUS_CARD,
            border=ft.border.all(1, "transparent"),
            shadow=ft.BoxShadow(
                blur_radius=2,
                color=ft.Colors.BLACK12,
                offset=ft.Offset(0, 1),
            ),
            on_click=on_tap,
            ink=True,
            margin=ft.margin.only(bottom=12),
        )

    issue_cards = [build_issue_card(issue) for issue in issues]

    actions_row = ft.Row(
        controls=[
            ft.FilledButton(
                "新規作成",
                icon=ft.Icons.ADD,
                style=ft.ButtonStyle(
                    bgcolor=COLOR_OPEN,
                    color="white",
                    shape=ft.RoundedRectangleBorder(radius=BORDER_RADIUS_BTN),
                ),
                on_click=lambda e: on_new_issue(),
            ),
            *(
                [
                    ft.OutlinedButton(
                        "マイルストーン進捗",
                        icon=ft.Icons.FLAG_CIRCLE,
                        on_click=lambda e: on_show_milestone_progress(),
                    ),
                    ft.OutlinedButton(
                        "マイルストーン管理",
                        icon=ft.Icons.MANAGE_ACCOUNTS,
                        on_click=lambda e: on_manage_milestones(),
                    ),
                    ft.OutlinedButton(
                        "マイルストーン追加",
                        icon=ft.Icons.FLAG,
                        on_click=lambda e: on_new_milestone(),
                    ),
                ]
                if state.mode == "edit"
                else []
            ),
            ft.OutlinedButton(
                "フィルタ保存",
                icon=ft.Icons.SAVE,
                on_click=lambda e: on_save_preset(),
            ),
            ft.OutlinedButton(
                "前回を読み込み",
                icon=ft.Icons.DOWNLOAD,
                on_click=lambda e: on_load_preset(),
            ),
            ft.TextButton(
                "クリア",
                icon=ft.Icons.CLEAR,
                on_click=lambda e: on_clear_filter(),
            ),
        ],
        spacing=8,
        wrap=True,
        run_spacing=8,
        alignment=ft.MainAxisAlignment.END,
    )

    header_row = ft.ResponsiveRow(
        controls=[
            ft.Container(content=tabs, col={"xs": 12, "md": 7, "lg": 8}),
            ft.Container(
                content=actions_row,
                col={"xs": 12, "md": 5, "lg": 4},
                alignment=ft.alignment.Alignment(1, 0),
            ),
        ],
        spacing=12,
        run_spacing=12,
        vertical_alignment=ft.CrossAxisAlignment.START,
    )

    filters_row = ft.ResponsiveRow(
        controls=[
            ft.Container(content=search_field, col={"xs": 12, "md": 4}),
            ft.Container(content=assignee_field, col={"xs": 12, "md": 4}),
            ft.Container(content=tags_field, col={"xs": 12, "md": 4}),
        ],
        spacing=12,
        run_spacing=12,
    )

    milestone_filter_banner = None
    if active_milestone:
        total, closed, pct = active_milestone_progress or (0, 0, 0)
        milestone_filter_banner = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(ft.Icons.FLAG, color=COLOR_PRIMARY, size=16),
                    ft.Column(
                        controls=[
                            ft.Text(
                                f"マイルストーンで絞り込み中: {active_milestone['title']}",
                                size=13,
                                weight=ft.FontWeight.W_600,
                                color=COLOR_TEXT_MAIN,
                            ),
                            ft.Text(
                                f"進捗 {pct}% ({closed}/{total})  ・  期限: {active_milestone['due_date'] or '未設定'}",
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
                        on_click=lambda e: on_clear_milestone_filter(),
                    ),
                ],
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            padding=ft.Padding.symmetric(horizontal=14, vertical=10),
            bgcolor=COLOR_CARD,
            border_radius=BORDER_RADIUS_CARD,
            border=ft.border.all(1, COLOR_BORDER),
            shadow=ft.BoxShadow(
                blur_radius=2,
                color=ft.Colors.BLACK12,
                offset=ft.Offset(0, 1),
            ),
        )

    if not issue_cards:
        initial_controls = [
            ft.Container(
                content=ft.Column(
                    [
                        ft.Icon(ft.Icons.INBOX, size=64, color="#d0d7de"),
                        ft.Text(
                            "そのステータスの Issue はありません",
                            color=COLOR_TEXT_MUTED,
                            size=16,
                        ),
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                ),
                alignment=ft.Alignment.CENTER,
                padding=60,
                expand=True,
            )
        ]
    else:
        initial_controls = issue_cards

    list_content = ft.Column(
        ref=list_column_ref,
        controls=initial_controls,
        scroll=ft.ScrollMode.AUTO,
        expand=True,
        spacing=0,
    )

    return ft.View(
        route="/",
        appbar=build_appbar(state.mode, state.locked_by, user),
        bgcolor=COLOR_BG,
        padding=ft.Padding.symmetric(horizontal=24, vertical=16),
        controls=[
            header_row,
            ft.Container(height=16),
            filters_row,
            *(
                [ft.Container(height=10), milestone_filter_banner]
                if milestone_filter_banner
                else []
            ),
            ft.Container(height=16),
            list_content,
        ],
    )


def build_milestone_progress_view(
    page: ft.Page,
    state,
    user: str,
    on_back,
    on_select_milestone,
):
    milestones = milestone_service.list_all()
    status_color_map = {
        "planned": COLOR_TEXT_MUTED,
        "active": COLOR_PRIMARY,
        "closed": COLOR_CLOSED,
    }

    summary_counts = {"planned": 0, "active": 0, "closed": 0}
    cards: list[ft.Control] = []

    for m in milestones:
        status = m["status"] or "planned"
        summary_counts[status] = summary_counts.get(status, 0) + 1
        try:
            total, closed, pct = milestone_service.progress(m["id"])
        except Exception:
            total, closed, pct = 0, 0, 0
        open_cnt = max(total - closed, 0)
        selected = state.filter_milestone_id == m["id"]
        remaining_text, remaining_color = _remaining_days_text(m["due_date"])

        cards.append(
            ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Row(
                            controls=[
                                ft.Text(
                                    m["title"],
                                    size=16,
                                    weight=ft.FontWeight.BOLD,
                                    expand=True,
                                    color=COLOR_TEXT_MAIN,
                                    max_lines=1,
                                    overflow=ft.TextOverflow.ELLIPSIS,
                                ),
                                ft.Container(
                                    content=ft.Text(
                                        m["status"],
                                        size=11,
                                        weight=ft.FontWeight.W_600,
                                        color="white",
                                    ),
                                    bgcolor=status_color_map.get(
                                        status, COLOR_TEXT_MUTED
                                    ),
                                    padding=ft.Padding.symmetric(
                                        horizontal=10, vertical=4
                                    ),
                                    border_radius=12,
                                ),
                            ],
                            vertical_alignment=ft.CrossAxisAlignment.CENTER,
                        ),
                        ft.Text(
                            m["description"] or "説明なし",
                            size=12,
                            color=COLOR_TEXT_MUTED,
                            max_lines=3,
                            overflow=ft.TextOverflow.ELLIPSIS,
                        ),
                        ft.Row(
                            controls=[
                                ft.Text(
                                    f"期限: {m['due_date'] or '未設定'}",
                                    size=12,
                                    color=COLOR_TEXT_MUTED,
                                ),
                                ft.Text("・", color=COLOR_TEXT_MUTED),
                                ft.Text(
                                    f"開始: {m['start_date'] or '未設定'}",
                                    size=12,
                                    color=COLOR_TEXT_MUTED,
                                ),
                                ft.Text("・", color=COLOR_TEXT_MUTED),
                                ft.Text(
                                    remaining_text,
                                    size=12,
                                    color=remaining_color,
                                ),
                            ],
                            spacing=6,
                        ),
                        ft.ProgressBar(value=pct / 100 if pct else 0, height=8),
                        ft.Row(
                            controls=[
                                ft.Text(f"進捗 {pct}%", size=12, color=COLOR_TEXT_MAIN),
                                ft.Container(expand=True),
                                ft.Text(
                                    f"Open {open_cnt}", size=12, color=COLOR_TEXT_MUTED
                                ),
                                ft.Text("/", size=12, color=COLOR_TEXT_MUTED),
                                ft.Text(
                                    f"Closed {closed}", size=12, color=COLOR_TEXT_MUTED
                                ),
                                ft.Text("・", size=12, color=COLOR_TEXT_MUTED),
                                ft.Text(
                                    f"Total {total}", size=12, color=COLOR_TEXT_MUTED
                                ),
                            ],
                        ),
                        ft.Row(
                            controls=[
                                ft.FilledButton(
                                    "このマイルストーンで一覧表示",
                                    icon=ft.Icons.FILTER_LIST,
                                    style=ft.ButtonStyle(
                                        bgcolor=COLOR_PRIMARY, color="white"
                                    ),
                                    on_click=lambda _e, mid=m["id"]: (
                                        on_select_milestone(mid)
                                    ),
                                ),
                            ],
                            alignment=ft.MainAxisAlignment.START,
                        ),
                    ],
                    spacing=10,
                ),
                padding=ft.Padding.all(16),
                bgcolor=COLOR_CARD,
                border_radius=BORDER_RADIUS_CARD,
                border=ft.border.all(1, COLOR_PRIMARY if selected else "transparent"),
                shadow=ft.BoxShadow(
                    blur_radius=2,
                    color=ft.Colors.BLACK12,
                    offset=ft.Offset(0, 1),
                ),
            )
        )

    if not cards:
        cards = [
            ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Icon(ft.Icons.FLAG_OUTLINED, size=48, color=COLOR_BORDER),
                        ft.Text("マイルストーンがありません", color=COLOR_TEXT_MUTED),
                    ],
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    spacing=12,
                ),
                alignment=ft.Alignment.CENTER,
                padding=ft.Padding.all(60),
                bgcolor=COLOR_CARD,
                border_radius=BORDER_RADIUS_CARD,
                border=ft.border.all(1, COLOR_BORDER),
            )
        ]

    summary_row = ft.ResponsiveRow(
        controls=[
            ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Text("アクティブ", size=12, color=COLOR_TEXT_MUTED),
                        ft.Text(
                            str(summary_counts.get("active", 0)),
                            size=20,
                            weight=ft.FontWeight.BOLD,
                        ),
                    ],
                    spacing=2,
                ),
                padding=ft.Padding.all(14),
                bgcolor=COLOR_CARD,
                border_radius=BORDER_RADIUS_CARD,
                border=ft.border.all(1, COLOR_BORDER),
                col={"xs": 4, "md": 3, "lg": 2},
            ),
            ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Text("予定", size=12, color=COLOR_TEXT_MUTED),
                        ft.Text(
                            str(summary_counts.get("planned", 0)),
                            size=20,
                            weight=ft.FontWeight.BOLD,
                        ),
                    ],
                    spacing=2,
                ),
                padding=ft.Padding.all(14),
                bgcolor=COLOR_CARD,
                border_radius=BORDER_RADIUS_CARD,
                border=ft.border.all(1, COLOR_BORDER),
                col={"xs": 4, "md": 3, "lg": 2},
            ),
            ft.Container(
                content=ft.Column(
                    controls=[
                        ft.Text("完了", size=12, color=COLOR_TEXT_MUTED),
                        ft.Text(
                            str(summary_counts.get("closed", 0)),
                            size=20,
                            weight=ft.FontWeight.BOLD,
                        ),
                    ],
                    spacing=2,
                ),
                padding=ft.Padding.all(14),
                bgcolor=COLOR_CARD,
                border_radius=BORDER_RADIUS_CARD,
                border=ft.border.all(1, COLOR_BORDER),
                col={"xs": 4, "md": 3, "lg": 2},
            ),
        ],
        spacing=12,
        run_spacing=12,
    )

    cards_grid = ft.ResponsiveRow(
        controls=[
            ft.Container(content=card, col={"xs": 12, "md": 6, "lg": 4})
            for card in cards
        ],
        spacing=12,
        run_spacing=12,
    )

    header = ft.Row(
        controls=[
            ft.IconButton(
                icon=ft.Icons.ARROW_BACK,
                tooltip="一覧に戻る",
                on_click=lambda _e: on_back(),
            ),
            ft.Text(
                "マイルストーン進捗",
                size=22,
                weight=ft.FontWeight.BOLD,
                color=COLOR_TEXT_MAIN,
                expand=True,
            ),
            ft.TextButton(
                "一覧へ",
                icon=ft.Icons.LIST,
                on_click=lambda _e: on_back(),
            ),
        ],
        spacing=8,
    )

    return ft.View(
        route="/milestones",
        appbar=build_appbar(state.mode, state.locked_by, user),
        bgcolor=COLOR_BG,
        padding=ft.Padding.symmetric(horizontal=24, vertical=16),
        controls=[
            header,
            ft.Container(height=12),
            summary_row,
            ft.Container(height=18),
            cards_grid,
        ],
    )


def build_detail_view(
    page: ft.Page,
    state,
    user: str,
    issue_id: int,
    on_back,
    on_deleted,
    on_navigate_to_issue,
):
    issue = issue_service.get_issue(issue_id)
    if issue is None:
        return ft.View(route="/detail", controls=[ft.Text("Issue が見つかりません")])

    comments = issue_service.list_comments(issue_id)
    labels = issue_service.get_labels(issue_id)
    issue_reactions = issue_service.get_issue_reactions(issue_id, user)
    comment_reactions_map = issue_service.get_comment_reactions(issue_id, user)
    assignee = issue["assignee"] or "未割り当て"
    milestone = None
    milestone_stats: tuple[int, int, int] | None = None
    if getattr(issue, "milestone_id", None):
        milestone = next(
            (
                m
                for m in milestone_service.list_all()
                if m["id"] == issue["milestone_id"]
            ),
            None,
        )
        try:
            milestone_stats = milestone_service.progress(issue["milestone_id"])
        except Exception:
            milestone_stats = None

    def refresh_view():
        page.views.pop()
        page.views.append(
            build_detail_view(
                page,
                state,
                user,
                issue_id,
                on_back=on_back,
                on_deleted=on_deleted,
                on_navigate_to_issue=on_navigate_to_issue,
            )
        )
        page.update()

    def close_dialog(dialog: ft.AlertDialog):
        dialog.open = False
        page.update()

    def on_delete_issue(_e=None):
        def confirm_delete(ev=None):
            delete_dlg.open = False
            on_deleted()

        delete_dlg = ft.AlertDialog(
            modal=True,
            title=ft.Text("Issue を削除しますか？", weight=ft.FontWeight.BOLD),
            content=ft.Text(
                "この操作は元に戻せません。コメントやラベルも削除されます。",
                color=COLOR_TEXT_MUTED,
            ),
            actions=[
                ft.TextButton(
                    "キャンセル", on_click=lambda e: close_dialog(delete_dlg)
                ),
                ft.FilledButton(
                    "削除", bgcolor=COLOR_DANGER, color="white", on_click=confirm_delete
                ),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        page.overlay.append(delete_dlg)
        delete_dlg.open = True
        page.update()

    comment_input = ft.TextField(
        hint_text="コメントを入力... ",
        multiline=True,
        min_lines=3,
        max_lines=6,
        border_color="transparent",
        bgcolor="white",
        border_radius=BORDER_RADIUS_BTN,
        disabled=state.mode != "edit",
        width=900,
        content_padding=ft.Padding.all(12),
    )

    def on_submit_comment(e):
        body = comment_input.value.strip()
        if not body:
            return
        issue_service.add_comment(issue_id, body, user)
        comment_input.value = ""
        refresh_view()

    def on_toggle_status(e):
        issue_service.toggle_status(issue_id)
        refresh_view()

    def on_delete_comment(cid: int):
        issue_service.delete_comment(cid, user)
        refresh_view()

    def on_toggle_issue_reaction(reaction: str):
        if state.mode != "edit":
            return
        issue_service.toggle_issue_reaction(issue_id, reaction, user)
        refresh_view()

    def on_toggle_comment_reaction(comment_id: int, reaction: str):
        if state.mode != "edit":
            return
        issue_service.toggle_comment_reaction(comment_id, reaction, user)
        refresh_view()

    def build_reaction_bar(
        summary: dict,
        on_toggle,
        on_add,
        disabled: bool = False,
    ) -> ft.Row:
        chips: list[ft.Control] = []

        # Show only reactions that exist
        if summary:
            for emoji in REACTION_OPTIONS:
                data = summary.get(emoji)
                if not data:
                    continue
                count = int(data.get("count", 0) or 0)
                reacted = bool(data.get("reacted", False))
                users_list = data.get("users") or []
                tooltip = ", ".join(users_list) if users_list else None
                chips.append(
                    ft.Container(
                        content=ft.Row(
                            controls=[
                                ft.Text(emoji, size=16),
                                ft.Text(str(count), size=12, color=COLOR_TEXT_MUTED),
                            ],
                            spacing=6,
                            vertical_alignment=ft.CrossAxisAlignment.CENTER,
                        ),
                        padding=ft.Padding.symmetric(horizontal=10, vertical=6),
                        bgcolor="#EAF2FF" if reacted else COLOR_CARD,
                        border=ft.border.all(
                            1, COLOR_PRIMARY if reacted else COLOR_BORDER
                        ),
                        border_radius=12,
                        ink=True,
                        tooltip=tooltip,
                        on_click=None
                        if disabled
                        else (lambda _e, r=emoji: on_toggle(r)),
                    )
                )

        add_button = None
        if not disabled:
            add_button = ft.PopupMenuButton(
                icon=ft.Icons.ADD,
                tooltip="リアクションを追加",
                items=[
                    ft.PopupMenuItem(
                        content=ft.Text(emoji),
                        on_click=(lambda _e, r=emoji: on_add(r)),
                    )
                    for emoji in REACTION_OPTIONS
                ],
            )

        controls = chips + ([add_button] if add_button else [])
        return ft.Row(
            controls=controls,
            spacing=8,
            run_spacing=8,
            wrap=True,
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
        )

    def show_edit_comment_dialog(comment):
        edit_field = ft.TextField(
            width=900,
            height=520,
            label="コメントを編集",
            value=comment["body"],
            multiline=True,
            min_lines=6,
            max_lines=18,
            border_color=COLOR_BORDER,
            focused_border_color=COLOR_PRIMARY,
            border_radius=BORDER_RADIUS_BTN,
            suffix=ft.IconButton(
                icon=ft.Icons.IMAGE,
                icon_color=COLOR_PRIMARY,
                tooltip="クリップボード画像を貼り付け",
                on_click=lambda _e: insert_clipboard_image(edit_field),
            ),
        )
        error_text = ft.Text("", color=COLOR_DANGER, size=12)

        def on_save(_e=None):
            new_body = (edit_field.value or "").strip()
            if not new_body:
                error_text.value = "⚠ コメントを入力してください"
                page.update()
                return
            issue_service.update_comment(comment["id"], new_body, user)
            dlg.open = False
            refresh_view()

        def on_cancel(_e=None):
            dlg.open = False
            page.update()

        dlg = ft.AlertDialog(
            modal=True,
            title=ft.Text("コメントを編集", weight=ft.FontWeight.BOLD),
            content=ft.Container(
                width=940,
                height=680,
                content=ft.Column(
                    controls=[edit_field, error_text],
                    spacing=12,
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
        page.overlay.append(dlg)
        dlg.open = True
        page.update()

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

    def on_paste_image_to_comment(_e=None):
        insert_clipboard_image(comment_input)

    def show_edit_dialog(e=None):
        milestones = milestone_service.list_all()
        title_field = ft.TextField(
            label="タイトル *",
            value=issue["title"],
            border_color=COLOR_BORDER,
            focused_border_color=COLOR_PRIMARY,
            border_radius=BORDER_RADIUS_BTN,
        )
        assignee_field = ft.TextField(
            label="担当者",
            value=issue["assignee"] or "",
            border_color=COLOR_BORDER,
            focused_border_color=COLOR_PRIMARY,
            border_radius=BORDER_RADIUS_BTN,
        )
        milestone_field = ft.Dropdown(
            label="マイルストーン",
            options=[ft.dropdown.Option(key="", text="(なし)")]
            + [
                ft.dropdown.Option(key=str(m["id"]), text=m["title"])
                for m in milestones
            ],
            value=str(getattr(issue, "milestone_id", None) or ""),
            border_color=COLOR_BORDER,
            focused_border_color=COLOR_PRIMARY,
            border_radius=BORDER_RADIUS_BTN,
        )
        labels_field = ft.TextField(
            label="ラベル（カンマ区切り）",
            value=", ".join(labels),
            border_color=COLOR_BORDER,
            focused_border_color=COLOR_PRIMARY,
            border_radius=BORDER_RADIUS_BTN,
        )
        body_field = ft.TextField(
            label="本文（Markdown 対応）",
            value=issue["body"],
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

        def on_save(ev):
            title = title_field.value.strip()
            if not title:
                error_text.value = "⚠  タイトルは必須です"
                page.update()
                return
            milestone_val = milestone_field.value or ""
            milestone_id = int(milestone_val) if milestone_val else None
            issue_service.update_issue(
                issue_id,
                title,
                body_field.value.strip(),
                assignee_field.value.strip(),
                parse_labels(labels_field.value),
                milestone_id,
            )
            edit_dlg.open = False
            refresh_view()

        def on_cancel(ev):
            edit_dlg.open = False
            page.update()

        edit_dlg = ft.AlertDialog(
            modal=True,
            title=ft.Text("Issue を編集", weight=ft.FontWeight.BOLD),
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

    status_badge = ft.Container(
        content=ft.Text(
            issue["status"],
            color="white",
            size=12,
            weight=ft.FontWeight.W_500,
        ),
        bgcolor=status_color(issue["status"]),
        border_radius=14,
        padding=ft.Padding.symmetric(horizontal=14, vertical=4),
    )

    toggle_label = "Close Issue" if issue["status"] == "OPEN" else "Reopen Issue"
    toggle_color = COLOR_DANGER if issue["status"] == "OPEN" else COLOR_OPEN
    toggle_icon = (
        ft.Icons.CHECK_CIRCLE_OUTLINE if issue["status"] == "OPEN" else ft.Icons.ADJUST
    )

    toggle_button = ft.FilledButton(
        toggle_label,
        icon=toggle_icon,
        style=ft.ButtonStyle(
            bgcolor=toggle_color,
            color="white",
            shape=ft.RoundedRectangleBorder(radius=BORDER_RADIUS_BTN),
        ),
        on_click=on_toggle_status,
        disabled=state.mode != "edit",
    )

    header_actions = []
    if state.mode == "edit":
        header_actions.extend(
            [
                ft.IconButton(
                    icon=ft.Icons.DELETE_OUTLINE,
                    tooltip="Issue を削除",
                    icon_color=COLOR_DANGER,
                    on_click=on_delete_issue,
                ),
                ft.IconButton(
                    icon=ft.Icons.EDIT_NOTE,
                    tooltip="Issue を編集",
                    on_click=show_edit_dialog,
                ),
            ]
        )

    def on_share_click(e):
        try:
            create_issue_email_draft(issue)
        except Exception as ex:
            err_dlg = ft.AlertDialog(
                title=ft.Text("メール作成エラー"),
                content=ft.Text(f"Outlook の起動に失敗しました。\n\n{str(ex)}"),
            )
            page.overlay.append(err_dlg)
            err_dlg.open = True
            page.update()

    header_actions.extend(
        [
            ft.IconButton(
                icon=ft.Icons.SHARE,
                tooltip="Outlookで共有",
                on_click=on_share_click,
            ),
            toggle_button,
            status_badge,
        ]
    )

    header = ft.Row(
        controls=[
            ft.IconButton(
                icon=ft.Icons.ARROW_BACK,
                on_click=lambda e: on_back(),
                tooltip="一覧に戻る",
            ),
            ft.Text(
                f"#{issue['id']}  {issue['title']}",
                size=24,
                weight=ft.FontWeight.BOLD,
                expand=True,
                color=COLOR_TEXT_MAIN,
            ),
            *header_actions,
        ],
        spacing=8,
    )

    meta = ft.Row(
        controls=[
            ft.Text(
                f"{issue['created_by']} が {format_datetime(issue['created_at'])} に作成",
                size=13,
                color=COLOR_TEXT_MUTED,
            ),
            ft.Text("・", color=COLOR_TEXT_MUTED),
            ft.Text(f"担当: {assignee}", size=13, color=COLOR_TEXT_MUTED),
        ],
        spacing=6,
    )

    milestone_block = None
    if milestone:
        total, closed, pct = milestone_stats or (0, 0, 0)
        milestone_block = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.Icon(ft.Icons.FLAG, size=16, color=COLOR_TEXT_MUTED),
                            ft.Text(
                                f"マイルストーン: {milestone['title']}",
                                size=13,
                                color=COLOR_TEXT_MAIN,
                                weight=ft.FontWeight.W_500,
                            ),
                            ft.Text(
                                f"進捗 {pct}% ({closed}/{total})",
                                size=12,
                                color=COLOR_TEXT_MUTED,
                            ),
                        ],
                        spacing=8,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                    ft.ProgressBar(value=pct / 100 if pct else 0, height=6),
                ],
                spacing=6,
            ),
            padding=ft.Padding.all(12),
            bgcolor=COLOR_CARD,
            border_radius=BORDER_RADIUS_CARD,
            shadow=ft.BoxShadow(
                blur_radius=2,
                color=ft.Colors.BLACK12,
                offset=ft.Offset(0, 1),
            ),
            width=980,
        )

    label_controls = [
        ft.Container(
            content=ft.Text(
                lbl,
                size=12,
                color=COLOR_PRIMARY,
                weight=ft.FontWeight.W_500,
            ),
            bgcolor="#E6F2FF",
            padding=ft.Padding.symmetric(horizontal=10, vertical=4),
            border_radius=10,
        )
        for lbl in labels
    ] or [ft.Text("ラベルなし", size=13, color=COLOR_TEXT_MUTED)]

    label_block = ft.Row(
        controls=[
            ft.Icon(ft.Icons.LABEL_OUTLINE, size=16, color=COLOR_TEXT_MUTED),
            ft.Row(
                controls=label_controls,
                spacing=8,
                run_spacing=8,
                wrap=True,
                expand=True,
            ),
        ],
        spacing=8,
        vertical_alignment=ft.CrossAxisAlignment.START,
    )

    def _handle_link_tap(e):
        """Open file:/// links with OS default handler; others in browser."""
        url: str = e.data
        if url.startswith("issue://"):
            try:
                target_id = int(url.replace("issue://", ""))
                on_navigate_to_issue(target_id)
            except ValueError:
                pass
            return

        if url.startswith("file:///") or url.startswith("file:"):
            # Convert file URL back to a local path.
            from urllib.parse import unquote, urlparse

            parsed = urlparse(url)
            # UNC: file://server/share -> \\server\share
            if parsed.hostname:
                path = (
                    "\\\\" + parsed.hostname + unquote(parsed.path).replace("/", "\\")
                )
            else:
                path = unquote(parsed.path).replace("/", "\\")
                # Remove leading backslash for drive-letter paths (\C:\... -> C:\...)
                if len(path) >= 3 and path[0] == "\\" and path[2] == ":":
                    path = path[1:]
            try:
                os.startfile(path)
            except OSError:
                # If the exact path doesn't exist, try opening the parent folder.
                parent = os.path.dirname(path)
                if os.path.exists(parent):
                    os.startfile(parent)
        else:
            page.launch_url(url)

    body_area = ft.Container(
        width=980,
        height=600,
        content=ft.Column(
            controls=[
                ft.Markdown(
                    linkify_issues(linkify_file_paths(issue["body"])) or "*本文なし*",
                    selectable=True,
                    extension_set=ft.MarkdownExtensionSet.GITHUB_WEB,
                    on_tap_link=_handle_link_tap,
                    md_style_sheet=ft.MarkdownStyleSheet(
                        p_text_style=ft.TextStyle(size=16),
                        a_text_style=ft.TextStyle(size=16),
                        list_bullet_text_style=ft.TextStyle(size=16),
                    ),
                ),
            ],
            spacing=0,
            scroll=ft.ScrollMode.AUTO,
        ),
        border=ft.border.all(1, "transparent"),
        border_radius=BORDER_RADIUS_CARD,
        padding=24,
        bgcolor=COLOR_CARD,
        shadow=ft.BoxShadow(
            blur_radius=2,
            color=ft.Colors.BLACK12,
            offset=ft.Offset(0, 1),
        ),
    )

    def build_comment_card(c) -> ft.Container:
        is_mine = c["created_by"] == user
        display_initial = c["created_by"][0].upper() if c["created_by"] else "?"
        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.CircleAvatar(
                                content=ft.Text(display_initial),
                                radius=14,
                                bgcolor=COLOR_PRIMARY,
                                color="white",
                            ),
                            ft.Text(
                                c["created_by"],
                                weight=ft.FontWeight.BOLD,
                                size=14,
                                color=COLOR_TEXT_MAIN,
                            ),
                            ft.Text(
                                format_datetime(c["created_at"]),
                                size=12,
                                color=COLOR_TEXT_MUTED,
                            ),
                            ft.Row(expand=True),
                            *(
                                [
                                    ft.IconButton(
                                        icon=ft.Icons.EDIT,
                                        icon_color=COLOR_PRIMARY,
                                        icon_size=16,
                                        tooltip="編集",
                                        on_click=lambda e, comment=c: (
                                            show_edit_comment_dialog(comment)
                                        ),
                                    ),
                                    ft.IconButton(
                                        icon=ft.Icons.DELETE_OUTLINE,
                                        icon_color=COLOR_DANGER,
                                        icon_size=16,
                                        tooltip="削除",
                                        on_click=lambda e, cid=c["id"]: (
                                            on_delete_comment(cid)
                                        ),
                                    ),
                                ]
                                if is_mine and state.mode == "edit"
                                else []
                            ),
                        ],
                        spacing=12,
                    ),
                    ft.Container(
                        content=ft.Markdown(
                            linkify_issues(linkify_file_paths(c["body"])),
                            selectable=True,
                            extension_set=ft.MarkdownExtensionSet.GITHUB_WEB,
                            on_tap_link=_handle_link_tap,
                        ),
                        padding=ft.Padding.only(left=40),
                    ),
                    ft.Container(
                        content=build_reaction_bar(
                            comment_reactions_map.get(c["id"], {}),
                            lambda r, cid=c["id"]: on_toggle_comment_reaction(cid, r),
                            lambda r, cid=c["id"]: on_toggle_comment_reaction(cid, r),
                            state.mode != "edit",
                        ),
                        padding=ft.Padding.only(left=40, top=6),
                    ),
                ],
                spacing=8,
            ),
            width=980,
            padding=16,
            bgcolor=COLOR_CARD,
            border_radius=BORDER_RADIUS_CARD,
            shadow=ft.BoxShadow(
                blur_radius=2,
                color=ft.Colors.BLACK12,
                offset=ft.Offset(0, 1),
            ),
            margin=ft.margin.only(bottom=16),
        )

    comment_cards = [build_comment_card(c) for c in comments]

    footer = ft.Container(
        content=ft.Column(
            controls=[
                ft.Divider(height=1, color=COLOR_BORDER),
                ft.Container(height=16),
                ft.Row(
                    controls=[
                        ft.CircleAvatar(
                            content=ft.Text(user[0].upper() if user else "?"),
                            radius=16,
                            bgcolor=COLOR_PRIMARY,
                            color="white",
                        ),
                        comment_input,
                        ft.IconButton(
                            icon=ft.Icons.IMAGE,
                            icon_color=COLOR_PRIMARY,
                            tooltip="クリップボードの画像を貼り付け",
                            on_click=on_paste_image_to_comment,
                            disabled=state.mode != "edit",
                        ),
                        ft.IconButton(
                            icon=ft.Icons.SEND,
                            icon_color=COLOR_PRIMARY,
                            tooltip="コメントを送信",
                            on_click=on_submit_comment,
                            disabled=state.mode != "edit",
                        ),
                    ],
                    spacing=12,
                    alignment=ft.MainAxisAlignment.START,
                    vertical_alignment=ft.CrossAxisAlignment.START,
                ),
            ],
            spacing=8,
        ),
        padding=ft.Padding.only(top=12, bottom=32),
    )

    # Pin the header row while allowing the body to scroll independently.
    pinned_header = ft.Container(
        content=ft.Container(width=980, content=header),
        padding=ft.Padding.only(bottom=8),
        bgcolor=COLOR_BG,
        border=ft.border.only(bottom=ft.BorderSide(1, COLOR_BORDER)),
    )

    scrollable_content = ft.Column(
        expand=True,
        scroll=ft.ScrollMode.AUTO,
        spacing=4,
        controls=[
            meta,
            *([milestone_block, ft.Container(height=12)] if milestone_block else []),
            ft.Container(height=16),
            label_block,
            ft.Container(height=16),
            body_area,
            ft.Container(
                width=980,
                content=ft.Column(
                    controls=[
                        ft.Row(
                            controls=[
                                ft.Icon(
                                    ft.Icons.EMOJI_EMOTIONS,
                                    size=18,
                                    color=COLOR_TEXT_MUTED,
                                ),
                                ft.Text(
                                    "リアクション",
                                    size=14,
                                    weight=ft.FontWeight.W_600,
                                    color=COLOR_TEXT_MAIN,
                                ),
                            ],
                            spacing=6,
                            vertical_alignment=ft.CrossAxisAlignment.CENTER,
                        ),
                        build_reaction_bar(
                            issue_reactions,
                            on_toggle_issue_reaction,
                            on_toggle_issue_reaction,
                            state.mode != "edit",
                        ),
                    ],
                    spacing=6,
                ),
                padding=ft.Padding.only(top=12, bottom=4),
            ),
            ft.Container(height=32),
            ft.Text(
                f"💬  コメント ({len(comments)})",
                size=16,
                weight=ft.FontWeight.BOLD,
                color=COLOR_TEXT_MAIN,
            ),
            ft.Container(height=16),
            *comment_cards,
            footer,
        ],
    )

    return ft.View(
        route="/detail",
        appbar=build_appbar(state.mode, state.locked_by, user),
        bgcolor=COLOR_BG,
        padding=ft.Padding.symmetric(horizontal=24, vertical=16),
        controls=[
            pinned_header,
            scrollable_content,
        ],
    )
