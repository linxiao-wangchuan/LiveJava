"""
项目工作区管理
==============
真实磁盘目录的读写，用于「项目模式」。
模仿 IDEA 风格：src/ 放源码，out/ 放编译输出。
"""

import os
import shutil
from pathlib import Path


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


def list_file_tree(project_root: Path) -> list[dict]:
    """
    扫描整个项目目录的文件树。
    返回前端可渲染的嵌套结构。
    """
    def _scan(path: Path) -> list[dict]:
        entries = []
        try:
            items = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except PermissionError:
            return entries
        for item in items:
            if item.name.startswith(".") or item.name.endswith(".class"):
                continue
            rel = item.relative_to(project_root).as_posix()
            entry = {"name": item.name, "path": rel}
            if item.is_dir():
                entry["type"] = "dir"
                entry["children"] = _scan(item)
            else:
                entry["type"] = "file"
            entries.append(entry)
        return entries

    return _scan(project_root)


def get_all_java_files(project_root: Path, src_dir_only: bool = True) -> list[Path]:
    """
    获取项目中所有 .java 文件。
    如果 src_dir_only=True，只扫描 src/ 目录。
    """
    scan_root = get_src_dir(project_root) if src_dir_only else project_root
    if not scan_root.exists():
        return []
    return sorted(scan_root.rglob("*.java"))


def create_file(project_root: Path, rel_path: str, content: str = "") -> Path:
    """在项目目录下创建文件"""
    full = project_root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    return full


def create_dir(project_root: Path, rel_path: str) -> Path:
    """在项目目录下创建目录"""
    full = project_root / rel_path
    full.mkdir(parents=True, exist_ok=True)
    return full


def read_file(project_root: Path, rel_path: str) -> str:
    """读取项目目录下的文件"""
    full = project_root / rel_path
    if full.exists():
        return full.read_text(encoding="utf-8")
    return ""


def write_file(project_root: Path, rel_path: str, content: str):
    """写入项目目录下的文件"""
    full = project_root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")


def delete_entry(project_root: Path, rel_path: str):
    """删除项目目录下的文件或目录"""
    full = project_root / rel_path
    if not full.exists():
        return
    if full.is_dir():
        shutil.rmtree(full)
    else:
        full.unlink()


def rename_entry(project_root: Path, old_rel: str, new_rel: str):
    """重命名项目目录下的文件或目录"""
    old = project_root / old_rel
    new = project_root / new_rel
    if old.exists() and not new.exists():
        old.rename(new)
