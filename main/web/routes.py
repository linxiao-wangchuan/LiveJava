"""
HTTP 路由
=========
页面和 API 端点注册：设置、临时工作区、项目工作区。
"""

import base64
import datetime
import io
import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

_log = logging.getLogger("routes")

from config import (
    BG_DIR,
    BG_INDEX,
    PROJECT_DIR,
    VIDEO_DIR,
    VIDEO_INDEX,
    detect_java_from_path,
    get_current_project_dir,
    load_config,
    resolve_java,
    save_config,
    scan_relative_jdks,
    set_current_project_dir,
    set_java_paths,
    update_path_history,
)
from core.code_utils import load_template
from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_file,
    send_from_directory,
)
from PIL import Image, ImageDraw
from workspace.project_workspace import create_dir as project_create_dir
from workspace.project_workspace import create_file as project_create_file
from workspace.project_workspace import delete_entry as project_delete_entry
from workspace.project_workspace import get_all_java_files as project_get_java_files
from workspace.project_workspace import get_out_dir, get_src_dir, initialize_project
from workspace.project_workspace import list_file_tree as project_list_tree
from workspace.project_workspace import open_project
from workspace.project_workspace import read_file as project_read_file
from workspace.project_workspace import rename_entry as project_rename_entry
from workspace.project_workspace import write_file as project_write_file
from workspace.temp_workspace import (
    create_dir,
    create_file,
    delete_entry,
    get_all_java_files,
    get_workspace_root,
    list_file_tree,
    read_file,
    rename_entry,
    reset_workspace,
    write_file,
)

# ── 背景图/视频索引辅助函数（模块级）──


def _read_bg_index():
    if BG_INDEX.exists():
        try:
            return json.loads(BG_INDEX.read_text(encoding="utf-8"))
        except Exception:
            _log.debug("操作失败", exc_info=True)
            pass
    return {"active": "", "images": []}


def _write_bg_index(idx):
    BG_INDEX.write_text(json.dumps(idx, indent=2, ensure_ascii=False), encoding="utf-8")


def _sync_bg_index():
    """扫描目录：新增未索引文件 + 清理已删除文件"""
    idx = _read_bg_index()
    disk_files = {
        f.name
        for f in BG_DIR.iterdir()
        if f.is_file()
        and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")
    }
    old_len = len(idx.get("images", []))
    idx["images"] = [
        img for img in idx.get("images", []) if img["filename"] in disk_files
    ]
    if len(idx["images"]) != old_len:
        _write_bg_index(idx)
    known = {img["filename"] for img in idx["images"]}
    changed = False
    for fname in sorted(disk_files):
        if fname not in known:
            f = BG_DIR / fname
            idx["images"].append(
                {
                    "filename": fname,
                    "added_at": datetime.datetime.fromtimestamp(
                        f.stat().st_mtime
                    ).strftime("%Y-%m-%d"),
                    "size_kb": round(f.stat().st_size / 1024, 1),
                }
            )
            changed = True
    if idx.get("active") and idx["active"] not in disk_files:
        idx["active"] = ""
        changed = True
    if changed:
        _write_bg_index(idx)


def _read_video_index():
    if VIDEO_INDEX.exists():
        try:
            return json.loads(VIDEO_INDEX.read_text(encoding="utf-8"))
        except Exception:
            _log.debug("操作失败", exc_info=True)
            pass
    return {"active": "", "videos": []}


def _write_video_index(idx):
    VIDEO_INDEX.write_text(
        json.dumps(idx, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _find_ffmpeg() -> str | None:
    """在 PATH 和常用位置查找 ffmpeg"""
    found = shutil.which("ffmpeg")
    if found:
        return found
    for root in [PROJECT_DIR.parent, PROJECT_DIR]:
        for d in root.rglob("ffmpeg*"):
            exe = d / "bin" / "ffmpeg.exe"
            if exe.exists():
                return str(exe)
    return None


def _generate_video_thumb(fpath: Path) -> str | None:
    """用 ffmpeg 抽视频首帧做缩略图，失败则返回占位图"""
    if not fpath.exists():
        return None
    try:
        ffmpeg_exe = _find_ffmpeg() or "ffmpeg"
        result = subprocess.run(
            [
                ffmpeg_exe,
                "-y",
                "-i",
                str(fpath),
                "-vframes",
                "1",
                "-f",
                "image2pipe",
                "-vcodec",
                "mjpeg",
                "-",
            ],
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0 and result.stdout:
            im = Image.open(io.BytesIO(result.stdout))
            im = im.convert("RGB")
            im.thumbnail((100, 60), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=60)
            return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        _log.debug("操作失败", exc_info=True)
        pass
    # 降级：占位图
    try:
        im = Image.new("RGB", (100, 60), "#1a1a2e")
        draw = ImageDraw.Draw(im)
        draw.polygon([(38, 18), (38, 42), (62, 30)], fill="#888888")
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=60)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def _sync_video_index():
    """扫描目录：新增未索引文件 + 清理已删除文件"""
    idx = _read_video_index()
    disk_files = {
        f.name
        for f in VIDEO_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in (".mp4", ".webm", ".mov", ".avi", ".mkv")
    }
    old_len = len(idx.get("videos", []))
    idx["videos"] = [v for v in idx.get("videos", []) if v["filename"] in disk_files]
    if len(idx["videos"]) != old_len:
        _write_video_index(idx)
    known = {v["filename"] for v in idx["videos"]}
    changed = False
    for fname in sorted(disk_files):
        if fname not in known:
            f = VIDEO_DIR / fname
            idx["videos"].append(
                {
                    "filename": fname,
                    "added_at": datetime.datetime.fromtimestamp(
                        f.stat().st_mtime
                    ).strftime("%Y-%m-%d"),
                    "size_kb": round(f.stat().st_size / 1024, 1),
                    "thumb": None,
                }
            )
            changed = True
    if idx.get("active") and idx["active"] not in disk_files:
        idx["active"] = ""
        changed = True
    if changed:
        _write_video_index(idx)


def _deep_merge(base: dict, override: dict):
    """递归合并 override 到 base（修改 base 本身）"""
    for key, value in override.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value


def register_routes(app: Flask):
    """注册所有 HTTP 路由"""

    @app.route("/favicon.ico")
    def favicon():
        return send_from_directory(
            app.static_folder, "favicon.png", mimetype="image/png"
        )

    @app.route("/")
    def index():
        return render_template("index.html")

    # ================================================================
    # 设置相关 API
    # ================================================================

    @app.route("/api/config", methods=["GET"])
    def api_get_config():
        cfg = load_config()
        cfg["_relative_jdks"] = scan_relative_jdks()
        return jsonify(cfg)

    @app.route("/api/config", methods=["POST"])
    def api_save_config():
        new_cfg = request.get_json()
        if new_cfg:
            # 与现有配置合并，防止主题同步等局部更新覆盖完整配置
            existing = load_config()
            _deep_merge(existing, new_cfg)
            _log.info(
                "保存配置: mode=%s, path_history=%d条",
                existing.get("java", {}).get("mode", "?"),
                len(existing.get("java", {}).get("path_history", [])),
            )
            save_config(existing)
            jc, ja = resolve_java(load_config())
            set_java_paths(jc, ja)
            return jsonify({"ok": True})
        return jsonify({"ok": False, "error": "invalid json"}), 400

    @app.route("/api/check-java", methods=["POST"])
    def api_check_java():
        data = request.get_json()
        path = data.get("path", "") if data else ""
        if not path:
            return jsonify({"valid": False, "error": "no path"})
        jc, ja = detect_java_from_path(path)
        return jsonify(
            {
                "valid": jc is not None and ja is not None,
                "javac": jc,
                "java": ja,
            }
        )

    @app.route("/api/scan-relative-jdks", methods=["GET"])
    def api_scan_relative():
        return jsonify(scan_relative_jdks())

    @app.route("/api/java-version", methods=["GET"])
    def api_java_version():
        """运行 java -version 返回版本字符串"""
        import subprocess

        from config import get_java

        try:
            result = subprocess.run(
                [get_java(), "-version"], capture_output=True, text=True, timeout=5
            )
            # java -version 输出到 stderr
            output = (result.stderr or result.stdout or "").strip()
            first_line = output.split("\n")[0] if output else "Unknown"
            return jsonify({"version": first_line, "ok": True})
        except Exception as e:
            return jsonify({"version": f"(获取失败: {e})", "ok": False})

    @app.route("/api/path-history/cleanup", methods=["POST"])
    def api_cleanup_history():
        cfg = load_config()
        update_path_history(cfg)
        return jsonify({"ok": True})

    # ================================================================
    # 临时工作区 API（temp_multi 模式）
    # ================================================================

    @app.route("/api/temp-workspace/tree", methods=["GET"])
    def api_temp_tree():
        return jsonify(list_file_tree())

    @app.route("/api/temp-workspace/read", methods=["POST"])
    def api_temp_read():
        data = request.get_json()
        path = data.get("path", "") if data else ""
        content = read_file(path)
        return jsonify({"path": path, "content": content})

    @app.route("/api/temp-workspace/write", methods=["POST"])
    def api_temp_write():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        write_file(data.get("path", ""), data.get("content", ""))
        return jsonify({"ok": True})

    @app.route("/api/temp-workspace/create-file", methods=["POST"])
    def api_temp_create_file():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        rel_path = data.get("path", "")
        use_template = data.get("template", False)
        if use_template and rel_path.endswith(".java"):
            class_name = Path(rel_path).stem
            content = load_template(class_name)
        else:
            content = data.get("content", "") or ("// " + rel_path + "\n")
        create_file(rel_path, content)
        return jsonify({"ok": True})

    @app.route("/api/temp-workspace/create-dir", methods=["POST"])
    def api_temp_create_dir():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        create_dir(data.get("path", ""))
        return jsonify({"ok": True})

    @app.route("/api/temp-workspace/delete", methods=["POST"])
    def api_temp_delete():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        delete_entry(data.get("path", ""))
        return jsonify({"ok": True})

    @app.route("/api/temp-workspace/move", methods=["POST"])
    def api_temp_move():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        old_path = data.get("old_path", "")
        new_path = data.get("new_path", "")
        if not old_path or not new_path:
            return jsonify({"ok": False, "error": "需要 old_path 和 new_path"}), 400
        try:
            rename_entry(old_path, new_path)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500

    @app.route("/api/temp-workspace/reset", methods=["POST"])
    def api_temp_reset():
        reset_workspace()
        return jsonify({"ok": True})

    # ================================================================
    # 项目工作区 API（project 模式）
    # ================================================================

    @app.route("/api/project/open", methods=["POST"])
    def api_project_open():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False, "error": "no data"}), 400
        path = data.get("path", "")
        if not path:
            return jsonify({"ok": False, "error": "no path"}), 400

        proj = open_project(path)
        if proj is None:
            return jsonify({"ok": False, "error": "路径不存在"}), 404

        # 检查是否为空目录，提示初始化
        has_src = (proj / "src").exists()
        if not has_src:
            return jsonify(
                {
                    "ok": True,
                    "needs_init": True,
                    "root": str(proj),
                    "tree": project_list_tree(proj),
                }
            )

        set_current_project_dir(proj)
        # 持久化
        cfg = load_config()
        cfg["last_project_dir"] = str(proj)
        save_config(cfg)

        return jsonify(
            {
                "ok": True,
                "needs_init": False,
                "root": str(proj),
                "tree": project_list_tree(proj),
            }
        )

    @app.route("/api/project/init", methods=["POST"])
    def api_project_init():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        path = data.get("path", "")
        if not path:
            return jsonify({"ok": False}), 400

        result = initialize_project(path)
        set_current_project_dir(result["root"])
        cfg = load_config()
        cfg["last_project_dir"] = str(result["root"])
        save_config(cfg)

        return jsonify(
            {
                "ok": True,
                "root": str(result["root"]),
                "tree": project_list_tree(result["root"]),
            }
        )

    @app.route("/api/project/tree", methods=["GET"])
    def api_project_tree():
        if get_current_project_dir() is None:
            return jsonify({"ok": False, "tree": [], "root": ""})
        return jsonify(
            {
                "ok": True,
                "root": str(get_current_project_dir()),
                "tree": project_list_tree(get_current_project_dir()),
            }
        )

    @app.route("/api/project/read", methods=["POST"])
    def api_project_read():
        data = request.get_json()
        if not data or get_current_project_dir() is None:
            return jsonify({"content": ""})
        content = project_read_file(get_current_project_dir(), data.get("path", ""))
        return jsonify({"path": data.get("path", ""), "content": content})

    @app.route("/api/project/write", methods=["POST"])
    def api_project_write():
        data = request.get_json()
        if not data or get_current_project_dir() is None:
            return jsonify({"ok": False}), 400
        project_write_file(
            get_current_project_dir(), data.get("path", ""), data.get("content", "")
        )
        return jsonify({"ok": True})

    @app.route("/api/project/create-file", methods=["POST"])
    def api_project_create_file():
        data = request.get_json()
        if not data or get_current_project_dir() is None:
            return jsonify({"ok": False}), 400
        rel_path = data.get("path", "")
        use_template = data.get("template", False)
        if use_template and rel_path.endswith(".java"):
            class_name = Path(rel_path).stem
            content = load_template(class_name)
        else:
            content = data.get("content", "") or ("// " + rel_path + "\n")
        project_create_file(get_current_project_dir(), rel_path, content)
        return jsonify({"ok": True})

    @app.route("/api/project/create-dir", methods=["POST"])
    def api_project_create_dir():
        data = request.get_json()
        if not data or get_current_project_dir() is None:
            return jsonify({"ok": False}), 400
        project_create_dir(get_current_project_dir(), data.get("path", ""))
        return jsonify({"ok": True})

    @app.route("/api/project/delete", methods=["POST"])
    def api_project_delete():
        data = request.get_json()
        if not data or get_current_project_dir() is None:
            return jsonify({"ok": False}), 400
        project_delete_entry(get_current_project_dir(), data.get("path", ""))
        return jsonify({"ok": True})

    @app.route("/api/project/move", methods=["POST"])
    def api_project_move():
        data = request.get_json()
        if not data or get_current_project_dir() is None:
            return jsonify({"ok": False}), 400
        old_path = data.get("old_path", "")
        new_path = data.get("new_path", "")
        if not old_path or not new_path:
            return jsonify({"ok": False, "error": "需要 old_path 和 new_path"}), 400
        try:
            project_rename_entry(get_current_project_dir(), old_path, new_path)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500

    # ================================================================
    # 背景图 API
    # ================================================================

    _sync_bg_index()

    @app.route("/api/backgrounds/list", methods=["GET"])
    def api_bg_list():
        _sync_bg_index()  # 运行时拖文件也能识别
        idx = _read_bg_index()
        images = []
        for img in idx.get("images", []):
            fpath = BG_DIR / img["filename"]
            thumb = None
            if fpath.exists():
                try:
                    im = Image.open(fpath)
                    # GIF/PNG 调色板模式需转 RGB 才能存 JPEG
                    if im.mode in ("P", "RGBA", "LA", "PA"):
                        im = im.convert("RGBA")
                    im = im.convert("RGB")
                    im.thumbnail((100, 60), Image.LANCZOS)
                    buf = io.BytesIO()
                    im.save(buf, format="JPEG", quality=60)
                    thumb = base64.b64encode(buf.getvalue()).decode()
                except Exception:
                    _log.debug("操作失败", exc_info=True)
                    pass
            images.append(
                {
                    "filename": img["filename"],
                    "added_at": img.get("added_at", ""),
                    "size_kb": img.get("size_kb", 0),
                    "thumb": thumb,
                }
            )
        return jsonify({"active": idx.get("active", ""), "images": images})

    @app.route("/api/backgrounds/upload", methods=["POST"])
    def api_bg_upload():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False, "error": "no data"}), 400
        filename = data.get("filename", "bg.png")
        b64 = data.get("data", "")
        if not b64:
            return jsonify({"ok": False, "error": "no image data"}), 400
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        try:
            raw = base64.b64decode(b64)
        except Exception:
            return jsonify({"ok": False, "error": "invalid base64"}), 400
        cfg = load_config()
        img_limit_mb = cfg.get("upload_limits", {}).get(
            "java_runner_image_limit_mb", 100
        )
        if len(raw) > img_limit_mb * 1024 * 1024:
            return (
                jsonify({"ok": False, "error": f"image too large (>{img_limit_mb}MB)"}),
                400,
            )
        stem, ext = os.path.splitext(filename)
        if not ext:
            ext = ".png"
        # 清理特殊字符（括号、空格等URL不友好字符）

        stem = re.sub(r"[()\s]+", "_", stem)

        safe_name = f"{stem}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
        fpath = BG_DIR / safe_name
        fpath.write_bytes(raw)
        idx = _read_bg_index()
        idx["images"].append(
            {
                "filename": safe_name,
                "added_at": datetime.datetime.now().strftime("%Y-%m-%d"),
                "size_kb": round(len(raw) / 1024, 1),
            }
        )
        _write_bg_index(idx)
        return jsonify({"ok": True, "filename": safe_name})

    @app.route("/api/backgrounds/delete", methods=["POST"])
    def api_bg_delete():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        filename = data.get("filename", "")
        if not filename:
            return jsonify({"ok": False}), 400
        fpath = BG_DIR / filename
        if fpath.exists():
            fpath.unlink()
        idx = _read_bg_index()
        idx["images"] = [img for img in idx["images"] if img["filename"] != filename]
        if idx["active"] == filename:
            idx["active"] = ""
        _write_bg_index(idx)
        return jsonify({"ok": True})

    @app.route("/api/backgrounds/activate", methods=["POST"])
    def api_bg_activate():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        filename = data.get("filename", "")
        idx = _read_bg_index()
        idx["active"] = filename
        _write_bg_index(idx)
        return jsonify({"ok": True})

    @app.route("/api/backgrounds/file/<path:filename>")
    def api_bg_file(filename):
        fpath = BG_DIR / filename
        if fpath.exists():
            return send_file(str(fpath))
        return ("", 404)

    # ================================================================
    # 背景视频 API（视频单独目录，与图片隔离）
    # ================================================================

    _sync_video_index()

    @app.route("/api/background-videos/list", methods=["GET"])
    def api_video_list():
        _sync_video_index()  # 运行时拖文件也能识别
        idx = _read_video_index()
        videos = []
        for v in idx.get("videos", []):
            # 先用缓存的 Canvas 缩略图，没有再调 ffmpeg
            thumb = v.get("thumb") or _generate_video_thumb(VIDEO_DIR / v["filename"])
            videos.append(
                {
                    "filename": v["filename"],
                    "added_at": v.get("added_at", ""),
                    "size_kb": v.get("size_kb", 0),
                    "thumb": thumb,
                }
            )
        return jsonify({"active": idx.get("active", ""), "videos": videos})

    @app.route("/api/background-videos/upload", methods=["POST"])
    def api_video_upload():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False, "error": "no data"}), 400
        filename = data.get("filename", "bg.mp4")
        b64 = data.get("data", "")
        if not b64:
            return jsonify({"ok": False, "error": "no video data"}), 400
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        try:
            raw = base64.b64decode(b64)
        except Exception:
            return jsonify({"ok": False, "error": "invalid base64"}), 400
        cfg = load_config()
        vid_limit_mb = cfg.get("upload_limits", {}).get(
            "java_runner_video_limit_mb", 150
        )
        if len(raw) > vid_limit_mb * 1024 * 1024:
            return (
                jsonify({"ok": False, "error": f"video too large (>{vid_limit_mb}MB)"}),
                400,
            )
        stem, ext = os.path.splitext(filename)
        if not ext:
            ext = ".mp4"

        stem = re.sub(r"[()\s]+", "_", stem)

        safe_name = f"{stem}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
        fpath = VIDEO_DIR / safe_name
        fpath.write_bytes(raw)
        thumb = data.get("thumb", None)  # Canvas 前端截帧（可选）
        idx = _read_video_index()
        idx["videos"].append(
            {
                "filename": safe_name,
                "added_at": datetime.datetime.now().strftime("%Y-%m-%d"),
                "size_kb": round(len(raw) / 1024, 1),
                "thumb": thumb,  # 存 base64 缩略图到索引
            }
        )
        _write_video_index(idx)
        return jsonify({"ok": True, "filename": safe_name})

    @app.route("/api/background-videos/delete", methods=["POST"])
    def api_video_delete():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        filename = data.get("filename", "")
        if not filename:
            return jsonify({"ok": False}), 400
        fpath = VIDEO_DIR / filename
        if fpath.exists():
            fpath.unlink()
        idx = _read_video_index()
        idx["videos"] = [v for v in idx["videos"] if v["filename"] != filename]
        if idx["active"] == filename:
            idx["active"] = ""
        _write_video_index(idx)
        return jsonify({"ok": True})

    @app.route("/api/background-videos/activate", methods=["POST"])
    def api_video_activate():
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        filename = data.get("filename", "")
        idx = _read_video_index()
        idx["active"] = filename
        _write_video_index(idx)
        return jsonify({"ok": True})

    @app.route("/api/background-videos/file/<path:filename>")
    def api_video_file(filename):
        fpath = VIDEO_DIR / filename
        if fpath.exists():
            return send_file(str(fpath))
        return ("", 404)
