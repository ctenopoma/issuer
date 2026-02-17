"""
app_main.py - Issue Manager メインアプリケーション
Issue Manager v1.0
"""

import atexit
import base64
import logging
import signal
import sys
from io import BytesIO
from pathlib import Path

import flet as ft
from PIL import Image

from app.database.schema import initialize_schema
from app.config import APP_TITLE, COLOR_BG, COLOR_PRIMARY
from app.ui_helpers import current_user, parse_labels
from app.ui_state import AppState
from app.ui import views, actions
from app.services import filter_service, issue_service
from app.utils.lock import (
    check_lock_on_startup,
    release_lock,
    force_acquire_lock,
    get_zombie_hours,
    read_lock,
)

logger = logging.getLogger(__name__)


def _load_app_icon() -> str | None:
    """Load app.ico, convert to PNG, and return base64 string for Flet window icon."""

    search_roots = [
        Path(getattr(sys, "_MEIPASS", "")),
        Path(__file__).resolve().parent.parent,
        Path.cwd(),
    ]

    for root in search_roots:
        candidate = root / "app.ico"
        if candidate.exists():
            try:
                with Image.open(candidate) as img:
                    buffer = BytesIO()
                    img.save(buffer, format="PNG")
                    return base64.b64encode(buffer.getvalue()).decode("utf-8")
            except Exception:
                logger.warning("Failed to load app.ico for window icon", exc_info=True)

    return None


# ==========================================================================
# グローバルな状態とクリーンアップ処理
# ==========================================================================

_app_state: AppState | None = None


def _cleanup_handler(signum=None, frame=None):
    """シグナルハンドラー兼クリーンアップ。"""
    global _app_state
    try:
        if _app_state and _app_state.mode == "edit":
            release_lock()
    except Exception:
        pass  # クリーンアップ中の例外は無視する


atexit.register(_cleanup_handler)
signal.signal(signal.SIGINT, _cleanup_handler)
signal.signal(signal.SIGTERM, _cleanup_handler)


# ==========================================================================
# メインアプリ
# ==========================================================================


def main(page: ft.Page):
    global _app_state

    icon_b64 = _load_app_icon()

    page.title = APP_TITLE
    if icon_b64:
        page.window_icon = icon_b64
    page.window_maximized = True
    page.theme_mode = ft.ThemeMode.LIGHT
    page.bgcolor = COLOR_BG
    page.padding = 0
    page.fonts = {
        "Roboto": "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
        "Open Sans": "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap",
    }
    page.theme = ft.Theme(
        color_scheme_seed=COLOR_PRIMARY,
        font_family="Roboto",
    )

    user = current_user()
    state = AppState()
    _app_state = state

    lock_mode, locked_by = check_lock_on_startup()
    state.locked_by = locked_by

    def apply_last_filter():
        last = filter_service.load_last()
        state.current_tab = last.status or "OPEN"
        state.keyword = last.keyword or ""
        state.filter_assignee = last.assignee or ""
        state.filter_tags_text = ", ".join(last.tags) if last.tags else ""
        state.filter_milestone_id = last.milestone_id
        refresh_list()

    def clear_filters():
        state.current_tab = "OPEN"
        state.keyword = ""
        state.filter_assignee = ""
        state.filter_tags_text = ""
        state.filter_milestone_id = None
        filter_service.save_last(filter_service.build_filter())
        refresh_list()

    def back_to_list():
        if page.views:
            page.views.pop()
        state.selected_issue_id = None
        refresh_list()

    def handle_issue_deleted():
        if state.selected_issue_id is not None:
            issue_service.delete_issue(state.selected_issue_id)
        back_to_list()

    def show_detail():
        if state.selected_issue_id is None:
            return
        page.views.append(
            views.build_detail_view(
                page=page,
                state=state,
                user=user,
                issue_id=state.selected_issue_id,
                on_back=back_to_list,
                on_deleted=handle_issue_deleted,
            )
        )
        page.update()

    def handle_select_issue(issue_id: int):
        state.selected_issue_id = issue_id
        show_detail()

    def filter_by_milestone(milestone_id: int | None):
        state.filter_milestone_id = milestone_id
        filter_service.save_last(
            filter_service.build_filter(
                keyword=state.keyword,
                status=state.current_tab,
                assignee=state.filter_assignee or None,
                tags=parse_labels(state.filter_tags_text),
                milestone_id=milestone_id,
            )
        )
        refresh_list()

    def open_milestone_progress():
        page.views.append(
            views.build_milestone_progress_view(
                page=page,
                state=state,
                user=user,
                on_back=refresh_list,
                on_select_milestone=filter_by_milestone,
            )
        )
        page.update()

    def refresh_list():
        try:
            page.views.clear()
            page.views.append(
                views.build_issue_list_view(
                    page=page,
                    state=state,
                    user=user,
                    on_new_issue=lambda: actions.show_new_issue_dialog(
                        page, state, user, refresh_list
                    ),
                    on_new_milestone=lambda: actions.show_new_milestone_dialog(
                        page, refresh_list
                    ),
                    on_manage_milestones=lambda: actions.show_manage_milestones(
                        page, refresh_list
                    ),
                    on_show_milestone_progress=open_milestone_progress,
                    on_clear_milestone_filter=lambda: filter_by_milestone(None),
                    on_select_issue=handle_select_issue,
                    on_save_filter=refresh_list,
                    on_save_preset=lambda: filter_service.save_last(
                        filter_service.build_filter(
                            keyword=state.keyword,
                            status=state.current_tab,
                            assignee=state.filter_assignee or None,
                            tags=parse_labels(state.filter_tags_text),
                            milestone_id=state.filter_milestone_id,
                        )
                    ),
                    on_load_preset=apply_last_filter,
                    on_clear_filter=clear_filters,
                )
            )
            page.update()
        except Exception as exc:
            logger.exception("Error in refresh_list")
            page.overlay.append(
                ft.AlertDialog(
                    title=ft.Text("エラーが発生しました"),
                    content=ft.Text(f"詳細: {exc}"),
                    open=True,
                )
            )
            page.update()

    def route_change(_e: ft.RouteChangeEvent):
        if page.route == "/":
            refresh_list()

    def view_pop(_e: ft.ViewPopEvent):
        if len(page.views) > 1:
            page.views.pop()
        state.selected_issue_id = None
        page.update()

    page.on_route_change = route_change
    page.on_view_pop = view_pop

    def on_window_event(e):
        if e.data == "close":
            logger.debug(f"Window close event, mode={state.mode}")
            try:
                if state.mode == "edit":
                    release_lock()
            except Exception:
                logger.warning("Failed to release lock on window close", exc_info=True)
            page.window_prevent_close = False

    page.window_prevent_close = True
    page.on_window_event = on_window_event

    def show_zombie_dialog():
        lock_data = read_lock() or {}
        zombie_hours = get_zombie_hours(lock_data)

        def open_readonly(_):
            state.mode = "readonly"
            dialog.open = False
            page.update()
            refresh_list()

        def force_unlock(_):
            force_acquire_lock()
            state.mode = "edit"
            state.locked_by = None
            dialog.open = False
            page.update()
            refresh_list()

        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("編集ロックが長時間保持されています"),
            content=ft.Text(
                f"約 {zombie_hours} 時間前のロックを検出しました。\n強制解除して編集するか、閲覧のみで開きます。"
            ),
            actions=[
                ft.TextButton("閲覧のみで開く", on_click=open_readonly),
                ft.FilledButton(
                    "強制解除して編集",
                    bgcolor=COLOR_PRIMARY,
                    color="white",
                    on_click=force_unlock,
                ),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        page.overlay.append(dialog)
        dialog.open = True
        page.update()

    try:
        initialize_schema()
    except Exception as exc:
        logger.exception("Failed to initialize database schema")
        page.overlay.append(
            ft.AlertDialog(
                title=ft.Text("データベース初期化エラー"),
                content=ft.Text(f"データベースの初期化に失敗しました。\n詳細: {exc}"),
                open=True,
            )
        )
        page.update()
        return

    if lock_mode == "zombie":
        show_zombie_dialog()
    else:
        state.mode = "edit" if lock_mode == "edit" else "readonly"
        refresh_list()

    page.update()


# ==========================================================================
# エントリーポイント
# ==========================================================================


if __name__ == "__main__":
    ft.app(main)
