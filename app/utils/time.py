"""
time.py - time utilities
Single responsibility: common time helpers.
"""
from datetime import datetime


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")
