"""
lock.py - 排他制御（ロックファイル管理）
Issue Manager v1.0
"""
import json
import os
import logging
import getpass
from datetime import datetime, timedelta

from app.config import LOCK_PATH, ZOMBIE_THRESHOLD_HOURS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ロックファイル I/O
# ---------------------------------------------------------------------------

def read_lock() -> dict | None:
    """ロックファイルの内容を読み取る。存在しない・壊れている場合は None。"""
    if not os.path.exists(LOCK_PATH):
        return None
    try:
        with open(LOCK_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def write_lock() -> None:
    """自身のユーザー名と現在時刻でロックファイルを作成する。"""
    data = {
        "user": getpass.getuser(),
        "locked_at": datetime.now().isoformat(timespec="seconds"),
    }
    with open(LOCK_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def release_lock() -> None:
    """ロックファイルを削除する（正常終了時に呼ぶ）。"""
    if os.path.exists(LOCK_PATH):
        try:
            os.remove(LOCK_PATH)
            logger.debug(f"Lock file deleted: {LOCK_PATH}")
        except OSError as e:
            logger.debug(f"Failed to delete lock file: {e}")
    else:
        logger.debug(f"Lock file does not exist: {LOCK_PATH}")


# ---------------------------------------------------------------------------
# ゾンビロック判定
# ---------------------------------------------------------------------------

def is_zombie_lock(lock_data: dict) -> bool:
    """
    ロックが ZOMBIE_THRESHOLD_HOURS 以上前に作成されていれば True。
    locked_at のパースに失敗した場合も True（壊れたロックとして扱う）。
    """
    try:
        locked_at = datetime.fromisoformat(lock_data["locked_at"])
        return datetime.now() - locked_at > timedelta(hours=ZOMBIE_THRESHOLD_HOURS)
    except (KeyError, ValueError):
        return True


def get_zombie_hours(lock_data: dict) -> float:
    """ロックが何時間前に取得されたかを返す（ダイアログ表示用）。"""
    try:
        locked_at = datetime.fromisoformat(lock_data["locked_at"])
        delta = datetime.now() - locked_at
        return round(delta.total_seconds() / 3600, 1)
    except (KeyError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# 起動時チェック（メインロジック）
# ---------------------------------------------------------------------------

LockResult = tuple[str, str | None]
# ("edit",     None)         → 編集モードで起動可
# ("readonly", "UserB")      → 閲覧専用モード（UserB が編集中）
# ("zombie",   "UserB")      → ゾンビロック検出（ダイアログで判断を委ねる）


def check_lock_on_startup() -> LockResult:
    """
    起動時にロック状態を確認する。

    Returns:
        LockResult: (mode, locked_by_user)
    """
    lock = read_lock()

    if lock is None:
        # ロックなし → 自分がロックを取得して編集モード
        write_lock()
        return ("edit", None)

    if is_zombie_lock(lock):
        # ゾンビロック → UI 側でダイアログを出して強制解除を問う
        return ("zombie", lock.get("user", "不明"))

    # 有効なロックが存在 → 閲覧専用
    return ("readonly", lock.get("user", "不明"))


def force_acquire_lock() -> None:
    """
    ゾンビロックを強制解除して自分のロックを取得する。
    ユーザーが「強制解除して開く」を選んだ場合に呼ぶ。
    """
    release_lock()
    write_lock()
