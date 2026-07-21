"""
项目工作区管理
==============
真实磁盘目录的读写，用于「项目模式」。
模仿 IDEA 风格：src/ 放源码，out/ 放编译输出。
"""

from pathlib import Path

from workspace._base import create_dir as _base_create_dir
from workspace._base import create_file as _base_create_file
from workspace._base import delete_entry as _base_delete_entry
from workspace._base import get_all_java_files as _base_get_all_java_files
from workspace._base import list_file_tree as _base_list_file_tree
from workspace._base import read_file as _base_read_file
from workspace._base import rename_entry as _base_rename_entry
from workspace._base import write_file as _base_write_file

SRC_DIR_NAME = "src"
OUT_DIR_NAME = "out"


def open_project(project_dir: str) -> Path | None:
    """
    打开一个项目目录。如果不存在返回 None。
    返回项目根目录的 Path 对象。
    """
    path = Path(project_dir).resolve()
    if not path.exists():
        return None
    return path


def initialize_project(project_dir: str) -> dict[str, Path]:
    """
    初始化一个空目录为 Java 项目结构。
    创建 src/ 和 out/ 目录。
    返回 {"root": ..., "src": ..., "out": ...}
    """
    root = Path(project_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    src = root / SRC_DIR_NAME
    out = root / OUT_DIR_NAME
    src.mkdir(exist_ok=True)
    out.mkdir(exist_ok=True)
    # 创建默认 Main.java
    main_java = src / "Main.java"
    if not main_java.exists():
        main_java.write_text(
            "public class Main {\n"
            "    public static void main(String[] args) {\n"
            '        System.out.println("Hello, Java!");\n'
            "    }\n"
            "}\n",
            encoding="utf-8",
        )
    return {"root": root, "src": src, "out": out}


def get_src_dir(project_root: Path) -> Path:
    """获取项目的 src 目录"""
    d = project_root / SRC_DIR_NAME
    d.mkdir(exist_ok=True)
    return d


def get_out_dir(project_root: Path) -> Path:
    """获取项目的 out 目录"""
    d = project_root / OUT_DIR_NAME
    d.mkdir(exist_ok=True)
    return d


# ── CRUD 委托到 _base ──


def list_file_tree(project_root: Path) -> list[dict]:
    return _base_list_file_tree(project_root)


def get_all_java_files(project_root: Path, src_dir_only: bool = True) -> list[Path]:
    scan_root = get_src_dir(project_root) if src_dir_only else project_root
    return _base_get_all_java_files(scan_root)


def create_file(project_root: Path, rel_path: str, content: str = "") -> Path:
    return _base_create_file(project_root, rel_path, content)


def create_dir(project_root: Path, rel_path: str) -> Path:
    return _base_create_dir(project_root, rel_path)


def read_file(project_root: Path, rel_path: str) -> str:
    return _base_read_file(project_root, rel_path)


def write_file(project_root: Path, rel_path: str, content: str):
    _base_write_file(project_root, rel_path, content)


def delete_entry(project_root: Path, rel_path: str):
    _base_delete_entry(project_root, rel_path)


def rename_entry(project_root: Path, old_rel: str, new_rel: str):
    _base_rename_entry(project_root, old_rel, new_rel)
