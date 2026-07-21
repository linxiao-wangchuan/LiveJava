"""
工作区通用 CRUD（内部模块）
==========================
temp_workspace 和 project_workspace 共享的文件操作逻辑。
"""

import shutil
from pathlib import Path


def list_file_tree(root: Path) -> list[dict]:
    """
    扫描目录，返回文件树结构（供前端渲染）。
    格式: [{"name": "...", "type": "file"|"dir", "path": "相对路径", "children": [...]}]
    """
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


def create_file(root: Path, rel_path: str, content: str = "") -> Path:
    """创建文件，自动创建父目录"""
    full = root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    return full


def create_dir(root: Path, rel_path: str) -> Path:
    """创建目录"""
    full = root / rel_path
    full.mkdir(parents=True, exist_ok=True)
    return full


def read_file(root: Path, rel_path: str) -> str:
    """读取文件内容"""
    full = root / rel_path
    if full.exists():
        return full.read_text(encoding="utf-8")
    return ""


def write_file(root: Path, rel_path: str, content: str):
    """写入文件内容"""
    full = root / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")


def delete_entry(root: Path, rel_path: str):
    """删除文件或目录"""
    full = root / rel_path
    if not full.exists():
        return
    if full.is_dir():
        shutil.rmtree(full)
    else:
        full.unlink()


def rename_entry(root: Path, old_rel: str, new_rel: str):
    """重命名文件或目录"""
    old = root / old_rel
    new = root / new_rel
    if old.exists() and not new.exists():
        old.rename(new)


def get_all_java_files(root: Path) -> list[Path]:
    """获取目录下所有 .java 文件的绝对路径列表"""
    if not root.exists():
        return []
    return sorted(root.rglob("*.java"))
