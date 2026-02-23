import logging
import os
import shutil
import subprocess
import sys


def _needs_local_relaunch() -> bool:
    """
    PyInstaller exe の場合、常にローカルにコピーして実行する。
    共有フォルダからの直接実行は DB I/O の遅延や
    _overlapped.pyd のロード失敗など不安定要因が多いため、
    常にローカルコピーで安定動作させる。
    """
    # PyInstaller でビルドされた exe でなければスキップ
    if not getattr(sys, "frozen", False):
        return False

    # 既にローカルから実行中（再帰防止）
    if os.environ.get("ISSUER_LOCAL_RELAUNCH"):
        return False

    return True


def _copy_db_to_local(shared_dir: str, local_dir: str) -> None:
    """共有フォルダの DB ファイルをローカルにコピーする。"""
    db_files = ["data.db", "data.db-wal", "data.db-shm"]
    os.makedirs(local_dir, exist_ok=True)
    for name in db_files:
        src = os.path.join(shared_dir, name)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(local_dir, name))


def _relaunch_from_local() -> None:
    """exe をローカルにコピーして再起動する。DB もローカルへコピーする。"""
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

    # DB をローカルにコピー（data.db + WAL/SHM）
    shared_dir = os.path.dirname(exe_path)
    _copy_db_to_local(shared_dir, local_dir)

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

    try:
        ft.app(target=main)
    except Exception:
        logging.exception("Unhandled exception running Flet app")
        # exit with non-zero so local runs notice failure; CI will also log
        sys.exit(1)
