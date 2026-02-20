"""
config.py - パス解決・アプリ定数
Issue Manager v1.0
"""

import os
import sys

# ---------------------------------------------------------------------------
# パス解決（exe 化対応）
# ---------------------------------------------------------------------------


def get_base_path() -> str:
    """
    実行環境に応じてアプリのベースディレクトリを返す。
    - リランチ後: 元の exe があったディレクトリ（ネットワーク共有等）
    - exe 化後  : exe ファイルの存在するディレクトリ
    - スクリプト: .py ファイルの存在するディレクトリ
    """
    # ローカルコピーから再起動された場合、元のディレクトリを使う
    original_dir = os.environ.get("ISSUER_ORIGINAL_DIR")
    if original_dir:
        return original_dir
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    # config.py is in app/, so project root is one level up
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


BASE_PATH = get_base_path()

# DB パス: 共有フォルダ（マスター）とローカルコピー
SHARED_DB_PATH = os.path.join(BASE_PATH, "data.db")
LOCAL_DIR = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Issuer")
LOCAL_DB_PATH = os.path.join(LOCAL_DIR, "data.db")

# frozen EXE + ローカルリランチならローカル DB を使う
_use_local_db = getattr(sys, "frozen", False) and bool(
    os.environ.get("ISSUER_LOCAL_RELAUNCH")
)
DB_PATH = LOCAL_DB_PATH if _use_local_db else SHARED_DB_PATH

LOCK_PATH = os.path.join(BASE_PATH, "app.lock")
ASSETS_DIR = os.path.join(BASE_PATH, "assets")

# ---------------------------------------------------------------------------
# アプリ定数
# ---------------------------------------------------------------------------

APP_TITLE = "Issue管理画面"
APP_VERSION = "0.1.0"
ZOMBIE_THRESHOLD_HOURS = 1  # この時間以上経過したロックをゾンビと判定

# ---------------------------------------------------------------------------
# カラーパレット（Modern / GitHub ライク）
# ---------------------------------------------------------------------------

COLOR_OPEN = "#2da44e"  # 緑 (GitHub Green)
COLOR_CLOSED = "#8250df"  # 紫 (GitHub Purple)
COLOR_BG = "#F0F2F5"  # 非常に薄いグレー（背景）
COLOR_CARD = "#FFFFFF"  # カード背景
COLOR_BORDER = "#D0D7DE"  # ボーダー
COLOR_TEXT_MUTED = "#656D76"  # 薄いテキスト
COLOR_TEXT_MAIN = "#1F2328"  # メインテキスト
COLOR_PRIMARY = "#0969DA"  # プライマリ（青）
COLOR_DANGER = "#CF222E"  # 危険色（赤）

# AppBar
COLOR_APPBAR_BG = "#FFFFFF"  # 白（シャドウ付きを想定）
COLOR_APPBAR_FG = "#1F2328"  # 黒文字

# UI 定数
BORDER_RADIUS_CARD = 10
BORDER_RADIUS_BTN = 6
SHADOW_ELEVATION = 2

# Filters / presets
FILTER_PRESET_LIMIT = 10
DEFAULT_PAGE_SIZE = 100
