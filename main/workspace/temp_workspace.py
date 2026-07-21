"""
临时工作区管理
==============
虚拟工作区：文件存储在 main/temp/workspace/ 下。
用于「临时多文件」模式。
"""

import logging
import shutil
import time
from pathlib import Path

_log = logging.getLogger("temp_ws")

from config import WORKSPACE_DIR
from workspace._base import create_dir as _base_create_dir
from workspace._base import create_file as _base_create_file
from workspace._base import delete_entry as _base_delete_entry
from workspace._base import get_all_java_files as _base_get_all_java_files
from workspace._base import list_file_tree as _base_list_file_tree
from workspace._base import read_file as _base_read_file
from workspace._base import rename_entry as _base_rename_entry
from workspace._base import write_file as _base_write_file


def get_workspace_root() -> Path:
    """获取虚拟工作区根目录"""
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    return WORKSPACE_DIR


# ── CRUD 委托到 _base ──


def list_file_tree(root: Path | None = None) -> list[dict]:
    if root is None:
        root = WORKSPACE_DIR
    return _base_list_file_tree(root)


def create_file(rel_path: str, content: str = "") -> Path:
    return _base_create_file(WORKSPACE_DIR, rel_path, content)


def create_dir(rel_path: str) -> Path:
    return _base_create_dir(WORKSPACE_DIR, rel_path)


def read_file(rel_path: str) -> str:
    return _base_read_file(WORKSPACE_DIR, rel_path)


def write_file(rel_path: str, content: str):
    _base_write_file(WORKSPACE_DIR, rel_path, content)


def delete_entry(rel_path: str):
    _base_delete_entry(WORKSPACE_DIR, rel_path)


def rename_entry(old_rel: str, new_rel: str):
    _base_rename_entry(WORKSPACE_DIR, old_rel, new_rel)


def get_all_java_files(root: Path | None = None) -> list[Path]:
    if root is None:
        root = WORKSPACE_DIR
    return _base_get_all_java_files(root)


# ── 临时工作区特有操作 ──


def reset_workspace():
    """清空整个虚拟工作区并重新创建一个空白 Main.java"""
    if WORKSPACE_DIR.exists():
        for attempt in range(3):
            try:
                shutil.rmtree(WORKSPACE_DIR)
                break
            except Exception:
                if attempt < 2:
                    time.sleep(0.3)
                else:
                    _force_clear_dir(WORKSPACE_DIR)
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    # 清理编译输出
    out_dir = WORKSPACE_DIR.parent / "out"
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)
    # 创建默认 Main.java
    create_file(
        "Main.java",
        "public class Main {\n"
        "    public static void main(String[] args) {\n"
        '        System.out.println("Hello, Java!");\n'
        "    }\n"
        "}\n",
    )


def _force_clear_dir(path: Path):
    """逐文件删除，跳过删不掉的"""
    for item in path.rglob("*"):
        try:
            if item.is_file():
                item.unlink()
            elif item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
        except Exception:
            _log.debug("操作失败", exc_info=True)
            pass
