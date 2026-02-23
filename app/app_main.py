"""
app_main.py - Issue Manager メインアプリケーション
Issue Manager v1.0
"""

import atexit
import ctypes
import ctypes.wintypes
import logging
import os
import shutil
import signal
import sqlite3
import sys
import threading
from pathlib import Path

import flet as ft

from app.database.schema import initialize_schema
from app.config import (
    APP_TITLE,
    COLOR_BG,
    COLOR_PRIMARY,
    SHARED_DB_PATH,
    LOCAL_DB_PATH,
    LOCAL_DIR,
)
from app.ui.helpers import current_user, parse_labels
from app.ui.state import AppState
from app.ui import views, actions
from app.services import filter_service, issue_service
from app.utils.lock import (
    check_lock_on_startup,
    release_lock,
    force_acquire_lock,
    get_zombie_hours,
    read_lock,
    update_lock_timestamp,
)

logger = logging.getLogger(__name__)


def resource_path(relative_path: str) -> str:
    """Get absolute path to resource, works for dev and for PyInstaller"""
    if hasattr(sys, "_MEIPASS"):
        return str(Path(sys._MEIPASS) / relative_path)
    return str(Path.cwd() / relative_path)


# ==========================================================================
# グローバルな状態とクリーンアップ処理
# ==========================================================================

_app_state: AppState | None = None

# ローカルリランチモードかどうか
_is_local_relaunch = bool(os.environ.get("ISSUER_LOCAL_RELAUNCH"))


def _sync_db_back() -> None:
    """ローカル DB を共有フォルダへ書き戻し、ローカル DB を削除する。"""
    if not _is_local_relaunch:
        return
    if not os.path.exists(LOCAL_DB_PATH):
        return

    try:
        # WAL チェックポイントを実行してから書き戻す
        conn = sqlite3.connect(LOCAL_DB_PATH)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
    except Exception:
        logger.warning("WAL checkpoint failed", exc_info=True)

    # ローカル → 共有フォルダへコピー
    db_files = ["data.db", "data.db-wal", "data.db-shm"]
    try:
        for name in db_files:
            src = os.path.join(LOCAL_DIR, name)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(os.path.dirname(SHARED_DB_PATH), name))
        logger.info("DB synced back to shared folder")
    except Exception:
        logger.error("Failed to sync DB back to shared folder", exc_info=True)

    # ローカル DB を削除
    for name in db_files:
        local_file = os.path.join(LOCAL_DIR, name)
        try:
            if os.path.exists(local_file):
                os.remove(local_file)
        except OSError:
            pass


def _cleanup_handler(signum=None, frame=None):
    """シグナルハンドラー兼クリーンアップ。"""
    global _app_state
    try:
        if _app_state and _app_state.mode == "edit":
            _sync_db_back()
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
    page.title = APP_TITLE
    page.window.icon = resource_path("app.ico")
    page.window.maximized = True
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
                on_navigate_to_issue=handle_select_issue,
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

    def view_pop(_e: ft.ViewPopEvent = None):
        if len(page.views) > 1:
            page.views.pop()
        state.selected_issue_id = None
        page.update()

    page.on_route_change = route_change
    page.on_view_pop = view_pop

    # ------------------------------------------------------------------
    # マウスの「戻る」ボタン (XButton1) で前の画面に戻る
    # ------------------------------------------------------------------
    _mouse_hook_id = None
    _mouse_hook_thread_id = None
    # グローバルでコールバック参照を保持して GC を防止
    _global_hook_proc = None

    def _start_mouse_back_hook():
        """Windows 低レベルマウスフックで XButton1 を検出する。"""
        nonlocal _mouse_hook_id, _mouse_hook_thread_id

        # CI 環境や GitHub Actions のランナーではネイティブなフックが不安定
        # でクラッシュすることがあるため、環境変数でスキップする。
        if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
            logger.info("Skipping mouse back button hook in CI environment")
            return

        # safety: ensure running on Windows
        if sys.platform != "win32":
            logger.info("Mouse hook is only supported on Windows; skipping")
            return

        WH_MOUSE_LL = 14
        WM_XBUTTONDOWN = 0x020B
        XBUTTON1 = 0x0001

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        # 戻り値のサイズはアーキ依存（x86: 32bit, x64: 64bit）なので適切に選択する
        ret_type = ctypes.c_long if ctypes.sizeof(ctypes.c_void_p) == 4 else ctypes.c_longlong

        # WinAPI のコールバックは WINFUNCTYPE を使う
        HOOKPROC = ctypes.WINFUNCTYPE(
            ret_type,  # LRESULT
            ctypes.c_int,
            ctypes.wintypes.WPARAM,
            ctypes.wintypes.LPARAM,
        )

        # CallNextHookEx の引数・戻り値の型を明示的に設定
        user32.CallNextHookEx.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.wintypes.WPARAM,
            ctypes.wintypes.LPARAM,
        ]
        user32.CallNextHookEx.restype = ret_type  # LRESULT

        # SetWindowsHookExW の引数・戻り値の型を明示的に設定
        user32.SetWindowsHookExW.argtypes = [
            ctypes.c_int,
            HOOKPROC,
            ctypes.c_void_p,
            ctypes.wintypes.DWORD,
        ]
        user32.SetWindowsHookExW.restype = ctypes.c_void_p

        class MSLLHOOKSTRUCT(ctypes.Structure):
            _fields_ = [
                ("pt", ctypes.wintypes.POINT),
                ("mouseData", ctypes.wintypes.DWORD),
                ("flags", ctypes.wintypes.DWORD),
                ("time", ctypes.wintypes.DWORD),
                ("dwExtraInfo", ctypes.c_void_p),
            ]

        def low_level_mouse_proc(nCode, wParam, lParam):
            if nCode >= 0 and wParam == WM_XBUTTONDOWN:
                info = ctypes.cast(lParam, ctypes.POINTER(MSLLHOOKSTRUCT)).contents
                hi_word = (info.mouseData >> 16) & 0xFFFF
                if hi_word == XBUTTON1:
                    try:
                        page.run_thread(view_pop)
                    except Exception:
                        logger.debug(
                            "mouse back hook: failed to trigger view_pop", exc_info=True
                        )
            return user32.CallNextHookEx(_mouse_hook_id, nCode, wParam, lParam)

        # prevent garbage collection of callback — グローバル変数に保持
        nonlocal _mouse_hook_id, _mouse_hook_thread_id
        global _global_hook_proc
        _global_hook_proc = HOOKPROC(low_level_mouse_proc)

        def _run_hook():
            nonlocal _mouse_hook_id, _mouse_hook_thread_id
            _mouse_hook_thread_id = kernel32.GetCurrentThreadId()
            # WH_MOUSE_LL の場合は hInstance に NULL を渡しても動作しますが、
            # 明示的に None を使います。
            _mouse_hook_id = user32.SetWindowsHookExW(
                WH_MOUSE_LL, _global_hook_proc, None, 0
            )
            if not _mouse_hook_id:
                logger.warning("Failed to install mouse back button hook")
                return
            logger.info("Mouse back button hook installed")

            msg = ctypes.wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))

        t = threading.Thread(target=_run_hook, daemon=True)
        t.start()

    def _stop_mouse_back_hook():
        """フックを解除してメッセージループを停止する。"""
        user32 = ctypes.windll.user32
        if _mouse_hook_id:
            user32.UnhookWindowsHookEx(_mouse_hook_id)
        if _mouse_hook_thread_id:
            user32.PostThreadMessageW(_mouse_hook_thread_id, 0x0012, 0, 0)  # WM_QUIT

    _start_mouse_back_hook()

    # ------------------------------------------------------------------
    # ロックファイル ハートビート (定期更新)
    # ------------------------------------------------------------------
    def _start_heartbeat():
        def _heartbeat_loop():
            import time

            while True:
                time.sleep(60)
                # 編集モードでなくなったら停止
                if not state or state.mode != "edit":
                    break
                try:
                    update_lock_timestamp()
                    logger.debug("Lock timestamp updated")
                except Exception:
                    logger.warning("Failed to update lock timestamp", exc_info=True)

        t = threading.Thread(target=_heartbeat_loop, daemon=True)
        t.start()

    async def on_window_event(e: ft.WindowEvent):
        if e.type == ft.WindowEventType.CLOSE:
            logger.debug(f"Window close event, mode={state.mode}")
            _stop_mouse_back_hook()
            try:
                if state.mode == "edit":
                    _sync_db_back()
                    release_lock()
                elif _is_local_relaunch:
                    # 読み取り専用でもローカル DB は削除
                    for name in ["data.db", "data.db-wal", "data.db-shm"]:
                        p = os.path.join(LOCAL_DIR, name)
                        if os.path.exists(p):
                            try:
                                os.remove(p)
                            except OSError:
                                pass
            except Exception:
                logger.warning("Failed to cleanup on window close", exc_info=True)
            page.window.prevent_close = False
            await page.window.close()

    page.window.prevent_close = True
    page.window.on_event = on_window_event

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
            _start_heartbeat()
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
        if state.mode == "edit":
            _start_heartbeat()
        refresh_list()

        page.update()


# ==========================================================================
# エントリーポイント
# ==========================================================================


if __name__ == "__main__":
    ft.app(main)
