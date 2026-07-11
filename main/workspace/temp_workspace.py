"""
临时工作区管理
==============
虚拟工作区：文件存储在 main/temp/workspace/ 下。
用于「临时多文件」模式。
"""

import os
import shutil
from pathlib import Path
from config import WORKSPACE_DIR


def get_workspace_root() -> Path:
    """获取虚拟工作区根目录"""
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    return WORKSPACE_DIR


def list_file_tree(root: Path | None = None) -> list[dict]:
    """
    扫描目录，返回文件树结构（供前端渲染）。
    格式: [{"name": "...", "type": "file"|"dir", "path": "相对路径", "children": [...]}]
    """
    if root is None:
        root = WORKSPACE_DIR
    root.mkdir(parents=True, exist_ok=True)

    def _scan(path: Path) -> list[dict]:
        entries = []
        try:
            items = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except PermissionError:
            return entries
        for item in items:
            if item.name.startswith(".") or item.name.endswith(".class"):
                continue
            rel = item.relative_to(root).as_posix()
            entry = {"name": item.name, "path": rel}
            if item.is_dir():
                entry["type"] = "dir"
                entry["children"] = _scan(item)
            else:
                entry["type"] = "file"
            entries.append(entry)
        return entries

    return _scan(root)


def create_file(rel_path: str, content: str = "") -> Path:
    """在虚拟工作区创建文件，自动创建父目录"""
    full = WORKSPACE_DIR / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    return full


def create_dir(rel_path: str) -> Path:
    """在虚拟工作区创建目录"""
    full = WORKSPACE_DIR / rel_path
    full.mkdir(parents=True, exist_ok=True)
    return full


def delete_entry(rel_path: str):
    """删除文件或目录"""
    full = WORKSPACE_DIR / rel_path
    if not full.exists():
        return
    if full.is_dir():
        shutil.rmtree(full)
    else:
        full.unlink()


def rename_entry(old_rel: str, new_rel: str):
    """重命名文件或目录"""
    old = WORKSPACE_DIR / old_rel
    new = WORKSPACE_DIR / new_rel
    if old.exists() and not new.exists():
        old.rename(new)


def read_file(rel_path: str) -> str:
    """读取虚拟工作区中的文件内容"""
    full = WORKSPACE_DIR / rel_path
    if full.exists():
        return full.read_text(encoding="utf-8")
    return ""


def write_file(rel_path: str, content: str):
    """写入虚拟工作区中的文件"""
    full = WORKSPACE_DIR / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")


def get_all_java_files(root: Path | None = None) -> list[Path]:
    """获取工作区下所有 .java 文件的绝对路径列表"""
    if root is None:
        root = WORKSPACE_DIR
    if not root.exists():
        return []
    return sorted(root.rglob("*.java"))


def reset_workspace():
    """清空整个虚拟工作区并重新创建一个空白 Main.java"""
    import time
    if WORKSPACE_DIR.exists():
        for attempt in range(3):
            try:
                shutil.rmtree(WORKSPACE_DIR)
                break
            except Exception:
                if attempt < 2:
                    time.sleep(0.3)  # Windows 文件锁等待
                else:
                    # 最后一次失败：逐文件删除
                    _force_clear_dir(WORKSPACE_DIR)
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    # 清理编译输出
    out_dir = WORKSPACE_DIR.parent / "out"
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)
    # 创建默认 Main.java
    create_file("Main.java",
        "public class Main {\n"
        "    public static void main(String[] args) {\n"
        '        System.out.println("Hello, Java!");\n'
        "    }\n"
        "}\n"
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
            pass
