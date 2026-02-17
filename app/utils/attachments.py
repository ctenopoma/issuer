"""
attachments.py - 画像添付ユーティリティ
Issue Manager v1.0
"""
import os
import shutil
import uuid
from datetime import datetime

try:
    from PIL import ImageGrab  # type: ignore
except Exception:
    ImageGrab = None

from app.config import ASSETS_DIR


def save_attachment(src_path: str) -> str:
    """
    画像を assets フォルダにコピーし、Markdown 用の相対パスを返す。

    ファイル名は「タイムスタンプ_UUID6文字.拡張子」で生成する。
    日本語・マルチバイト文字を含む元ファイル名の問題を回避するため、
    元ファイル名は使用しない。

    Args:
        src_path: コピー元ファイルの絶対パス

    Returns:
        Markdown に挿入する相対パス（例: "assets/20250217_143022_a3f8b1.png"）
    """
    os.makedirs(ASSETS_DIR, exist_ok=True)

    ext = os.path.splitext(src_path)[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        ext = ".png"  # 不明な拡張子は png として扱う

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:6]
    filename = f"{timestamp}_{uid}{ext}"

    dest_path = os.path.join(ASSETS_DIR, filename)
    shutil.copy2(src_path, dest_path)

    return f"assets/{filename}"


def save_clipboard_image() -> str | None:
    """Clipboard 画像を assets 配下に保存し、Markdown 用パスを返す。"""
    if ImageGrab is None:
        return None

    try:
        img = ImageGrab.grabclipboard()
    except Exception:
        img = None

    if img is None:
        return None

    os.makedirs(ASSETS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = uuid.uuid4().hex[:6]
    filename = f"{timestamp}_{uid}.png"
    dest_path = os.path.join(ASSETS_DIR, filename)

    try:
        img.save(dest_path, format="PNG")
    except Exception:
        return None

    return f"assets/{filename}"
