"""
共享配置模块
============
项目路径、Java 环境检测、config.json 读写。
所有子模块通过此模块获取运行时配置。
"""

import json
import logging
import os
import shutil
from pathlib import Path

_log = logging.getLogger("config")

# ============================================================
# 路径常量
# ============================================================
MAIN_DIR = Path(__file__).resolve().parent  # main/
PROJECT_DIR = MAIN_DIR.parent  # 项目根目录
TEMP_DIR = MAIN_DIR / "temp"  # Java 临时编译目录
TEMP_DIR.mkdir(exist_ok=True)

WORKSPACE_DIR = TEMP_DIR / "workspace"  # 临时模式虚拟工作区
WORKSPACE_DIR.mkdir(exist_ok=True)

CONFIG_FILE = PROJECT_DIR / "config.json"  # 项目配置文件
JDK_DIR = PROJECT_DIR / "jdk"  # 相对模式 JDK 存放目录
BG_DIR = MAIN_DIR / "backgrounds"  # 背景图存放目录
BG_DIR.mkdir(exist_ok=True)
BG_INDEX = BG_DIR / ".bg_index.json"  # 背景图索引
VIDEO_DIR = MAIN_DIR / "background_videos"  # 背景视频存放目录
VIDEO_DIR.mkdir(exist_ok=True)
VIDEO_INDEX = VIDEO_DIR / ".video_index.json"  # 背景视频索引

# ============================================================
# Java 路径（运行时设置）
# ============================================================
_javac_path: str = "javac"
_java_path: str = "java"


def get_javac() -> str:
    return _javac_path


def get_java() -> str:
    return _java_path


def set_java_paths(javac: str, java: str):
    global _javac_path, _java_path
    _javac_path = javac
    _java_path = java


# ============================================================
# config.json 读写
# ============================================================

DEFAULT_CONFIG = {
    "java": {
        "mode": "env",  # env | path | relative
        "path_history": [],  # [{path, added_at, invalid_count}]
        "active_path": None,  # 用户明确选择的 JDK 路径
        "relative_version": None,  # "jdk-17.0.12"
        "last_valid_javac": None,
        "last_valid_java": None,
    },
    "theme": "dark",
    "last_mode": "temp_single",  # temp_single | temp_multi | project
    "last_project_dir": "",
    "upload_limits": {
        "java_runner_image_limit_mb": 100,
        "java_runner_video_limit_mb": 150,
    },
}


def load_config() -> dict:
    """读取 config.json，不存在则创建默认配置"""
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            # 补全缺失的默认字段
            merged = {**DEFAULT_CONFIG, **cfg}
            if "java" in cfg:
                merged["java"] = {**DEFAULT_CONFIG["java"], **cfg["java"]}
            return merged
    except Exception:
        _log.debug("读取 config.json 失败", exc_info=True)
        pass
    # 创建默认配置
    save_config(DEFAULT_CONFIG)
    return dict(DEFAULT_CONFIG)


def save_config(cfg: dict):
    """写入 config.json"""
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


# ============================================================
# JDK 检测
# ============================================================


def _check_java_bin(path: Path) -> tuple[str | None, str | None]:
    """检查一个目录下的 javac 和 java 是否存在，返回 (javac路径, java路径)"""
    javac_exe = path / ("javac.exe" if os.name == "nt" else "javac")
    java_exe = path / ("java.exe" if os.name == "nt" else "java")
    jc = str(javac_exe) if javac_exe.exists() else None
    ja = str(java_exe) if java_exe.exists() else None
    return jc, ja


def detect_java_from_env() -> tuple[str, str]:
    """从环境变量 JAVA_HOME 或 PATH 检测 Java"""
    java_home = os.environ.get("JAVA_HOME", "")
    if java_home:
        jc, ja = _check_java_bin(Path(java_home) / "bin")
        if jc and ja:
            return jc, ja

    # 从 PATH 找
    for cmd in ["javac", "javac.exe"]:
        found = shutil.which(cmd)
        if found:
            jc = found
            ja = jc.replace("javac", "java")
            if os.path.exists(ja):
                return jc, ja
            return jc, jc.replace("javac.exe", "java.exe")

    return "javac", "java"


def detect_java_from_path(jdk_dir: str) -> tuple[str | None, str | None]:
    """检查用户指定的 JDK 目录"""
    return _check_java_bin(Path(jdk_dir) / "bin")


def detect_java_relative(version: str) -> tuple[str | None, str | None]:
    """检查相对模式下的 JDK"""
    jdk_path = JDK_DIR / version
    return _check_java_bin(jdk_path / "bin")


def scan_relative_jdks() -> list[dict]:
    """扫描 jdk/ 目录下所有可用的 JDK 版本"""
    results = []
    if not JDK_DIR.exists():
        return results
    for d in sorted(JDK_DIR.iterdir()):
        if d.is_dir() and d.name.startswith("jdk-"):
            jc, ja = _check_java_bin(d / "bin")
            results.append(
                {
                    "version": d.name,
                    "javac": jc,
                    "java": ja,
                    "valid": jc is not None and ja is not None,
                }
            )
    return results


def resolve_java(cfg: dict) -> tuple[str, str]:
    """
    根据 config.json 的 java 配置，确定 javac 和 java 的路径。
    同时把结果写回 config，供前端设置页显示。
    返回 (javac_path, java_path)
    """
    java_cfg = cfg.get("java", {})
    mode = java_cfg.get("mode", "env")

    jc, ja = None, None

    if mode == "relative":
        version = java_cfg.get("relative_version")
        if version:
            jc, ja = detect_java_relative(version)

    if (not jc or not ja) and mode == "path":
        # 优先用用户明确选择的 active_path
        active = java_cfg.get("active_path")
        if active:
            jc, ja = detect_java_from_path(active)
        # 回退到历史列表
        if not jc or not ja:
            history = java_cfg.get("path_history", [])
            for entry in history:
                jc, ja = detect_java_from_path(entry["path"])
                if jc and ja:
                    break

    # 回退到环境检测
    if not jc or not ja:
        jc, ja = detect_java_from_env()

    # 存回 config，供前端读取
    java_cfg["last_valid_javac"] = jc
    java_cfg["last_valid_java"] = ja
    save_config(cfg)

    return jc, ja


def update_path_history(cfg: dict):
    """
    更新 path_history 中每条记录的有效性。
    无效路径 invalid_count += 1；>=3 次的删除。
    有效路径排前面，无效沉底。
    """
    java_cfg = cfg.setdefault("java", {})
    history = java_cfg.get("path_history", [])
    if not history:
        return

    updated = []
    invalid_entries = []

    for entry in history:
        jc, ja = detect_java_from_path(entry["path"])
        if jc and ja:
            entry["invalid_count"] = 0
            updated.append(entry)
        else:
            entry["invalid_count"] = entry.get("invalid_count", 0) + 1
            if entry["invalid_count"] < 3:
                invalid_entries.append(entry)

    # 有效在前，无效沉底
    java_cfg["path_history"] = updated + invalid_entries
    save_config(cfg)


# ============================================================
# 项目工作区状态（供 routes 和 socket_events 共享）
# ============================================================

_current_project_dir: "Path | None" = None


def get_current_project_dir() -> "Path | None":
    """获取当前打开的项目目录，如果丢了就尝试从 config.json 恢复"""
    global _current_project_dir
    if _current_project_dir is None:
        cfg = load_config()
        last = cfg.get("last_project_dir", "")
        if last:
            from workspace.project_workspace import open_project

            proj = open_project(last)
            if proj:
                _current_project_dir = proj
    return _current_project_dir


def set_current_project_dir(path: "Path | None"):
    """设置当前项目目录"""
    global _current_project_dir
    _current_project_dir = path
