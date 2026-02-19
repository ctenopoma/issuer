import logging
import os
import shutil
import subprocess
import sys


def _needs_local_relaunch() -> bool:
    """
    _overlapped の import を試み、失敗した場合のみ True を返す。
    ネットワーク共有上で _overlapped.pyd のロードに失敗する環境への対策。
    正常に import できる環境では何もしない。
    """
    # PyInstaller でビルドされた exe でなければスキップ
    if not getattr(sys, "frozen", False):
        return False

    # 既にローカルから実行中（再帰防止）
    if os.environ.get("ISSUER_LOCAL_RELAUNCH"):
        return False

    # テスト用: 強制的にリランチ経路を通す
    if os.environ.get("ISSUER_FORCE_RELAUNCH"):
        return True

    try:
        import _overlapped  # noqa: F401

        return False  # 正常にロードできた → そのまま起動
    except (ImportError, OSError):
        return True  # ロード失敗 → ローカルにコピーして再起動が必要


def _relaunch_from_local() -> None:
    """exe をローカルにコピーして再起動する。"""
    exe_path = sys.executable

    # コピー先: %LOCALAPPDATA%\Issuer\Issuer.exe
    local_dir = os.path.join(os.environ["LOCALAPPDATA"], "Issuer")
    local_exe = os.path.join(local_dir, os.path.basename(exe_path))

    # コピーが必要か判定（存在しない or サイズ・更新日時が異なる）
    need_copy = True
    if os.path.exists(local_exe):
        src_stat = os.stat(exe_path)
        dst_stat = os.stat(local_exe)
        if (
            src_stat.st_size == dst_stat.st_size
            and src_stat.st_mtime <= dst_stat.st_mtime
        ):
            need_copy = False

    if need_copy:
        os.makedirs(local_dir, exist_ok=True)
        shutil.copy2(exe_path, local_exe)

    # 再帰防止フラグ + 元の exe パスを渡してローカルから再起動
    env = os.environ.copy()
    env["ISSUER_LOCAL_RELAUNCH"] = "1"
    env["ISSUER_ORIGINAL_DIR"] = os.path.dirname(exe_path)
    subprocess.Popen([local_exe], env=env)


# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

if __name__ == "__main__":
    if _needs_local_relaunch():
        _relaunch_from_local()
        sys.exit(0)

    import flet as ft
    from app.app_main import main

    ft.app(target=main)
