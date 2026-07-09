"""
HTTP 路由
=========
页面和 API 端点注册：设置、临时工作区、项目工作区。
"""

from pathlib import Path
from flask import Flask, render_template, jsonify, request

from config import (
    load_config, save_config,
    scan_relative_jdks, detect_java_from_path, update_path_history,
    PROJECT_DIR,
)
from workspace.temp_workspace import (
    list_file_tree, create_file, create_dir, delete_entry, rename_entry,
    read_file, write_file, get_all_java_files, reset_workspace, get_workspace_root,
)
from core.code_utils import load_template
from workspace.project_workspace import (
    open_project, initialize_project,
    list_file_tree as project_list_tree,
    get_all_java_files as project_get_java_files,
    read_file as project_read_file,
    write_file as project_write_file,
    create_file as project_create_file,
    create_dir as project_create_dir,
    delete_entry as project_delete_entry,
    get_src_dir, get_out_dir,
)

# 当前打开的项目目录（服务器内存中）
_current_project_dir: Path | None = None


def _ensure_project_dir():
    """如果内存中项目目录丢了，尝试从 config.json 恢复"""
    global _current_project_dir
    if _current_project_dir is None:
        cfg = load_config()
        last = cfg.get("last_project_dir", "")
        if last:
            proj = open_project(last)
            if proj:
                _current_project_dir = proj
    return _current_project_dir


def register_routes(app: Flask):
    """注册所有 HTTP 路由"""

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
            save_config(new_cfg)
            return jsonify({"ok": True})
        return jsonify({"ok": False, "error": "invalid json"}), 400

    @app.route("/api/check-java", methods=["POST"])
    def api_check_java():
        data = request.get_json()
        path = data.get("path", "") if data else ""
        if not path:
            return jsonify({"valid": False, "error": "no path"})
        jc, ja = detect_java_from_path(path)
        return jsonify({
            "valid": jc is not None and ja is not None,
            "javac": jc,
            "java": ja,
        })

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
                [get_java(), "-version"],
                capture_output=True, text=True, timeout=5
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
        if not data: return jsonify({"ok": False}), 400
        write_file(data.get("path", ""), data.get("content", ""))
        return jsonify({"ok": True})

    @app.route("/api/temp-workspace/create-file", methods=["POST"])
    def api_temp_create_file():
        data = request.get_json()
        if not data: return jsonify({"ok": False}), 400
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
        if not data: return jsonify({"ok": False}), 400
        create_dir(data.get("path", ""))
        return jsonify({"ok": True})

    @app.route("/api/temp-workspace/delete", methods=["POST"])
    def api_temp_delete():
        data = request.get_json()
        if not data: return jsonify({"ok": False}), 400
        delete_entry(data.get("path", ""))
        return jsonify({"ok": True})

    @app.route("/api/temp-workspace/reset", methods=["POST"])
    def api_temp_reset():
        reset_workspace()
        return jsonify({"ok": True})

    # ================================================================
    # 项目工作区 API（project 模式）
    # ================================================================

    @app.route("/api/project/open", methods=["POST"])
    def api_project_open():
        global _current_project_dir
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
            return jsonify({
                "ok": True,
                "needs_init": True,
                "root": str(proj),
                "tree": project_list_tree(proj),
            })

        _current_project_dir = proj
        # 持久化
        cfg = load_config()
        cfg["last_project_dir"] = str(proj)
        save_config(cfg)

        return jsonify({
            "ok": True,
            "needs_init": False,
            "root": str(proj),
            "tree": project_list_tree(proj),
        })

    @app.route("/api/project/init", methods=["POST"])
    def api_project_init():
        global _current_project_dir
        data = request.get_json()
        if not data:
            return jsonify({"ok": False}), 400
        path = data.get("path", "")
        if not path:
            return jsonify({"ok": False}), 400

        result = initialize_project(path)
        _current_project_dir = result["root"]
        cfg = load_config()
        cfg["last_project_dir"] = str(result["root"])
        save_config(cfg)

        return jsonify({
            "ok": True,
            "root": str(result["root"]),
            "tree": project_list_tree(result["root"]),
        })

    @app.route("/api/project/tree", methods=["GET"])
    def api_project_tree():
        if _ensure_project_dir() is None:
            return jsonify({"ok": False, "tree": [], "root": ""})
        return jsonify({
            "ok": True,
            "root": str(_current_project_dir),
            "tree": project_list_tree(_current_project_dir),
        })

    @app.route("/api/project/read", methods=["POST"])
    def api_project_read():
        data = request.get_json()
        if not data or _ensure_project_dir() is None:
            return jsonify({"content": ""})
        content = project_read_file(_current_project_dir, data.get("path", ""))
        return jsonify({"path": data.get("path", ""), "content": content})

    @app.route("/api/project/write", methods=["POST"])
    def api_project_write():
        data = request.get_json()
        if not data or _ensure_project_dir() is None:
            return jsonify({"ok": False}), 400
        project_write_file(_current_project_dir, data.get("path", ""), data.get("content", ""))
        return jsonify({"ok": True})

    @app.route("/api/project/create-file", methods=["POST"])
    def api_project_create_file():
        data = request.get_json()
        if not data or _ensure_project_dir() is None:
            return jsonify({"ok": False}), 400
        rel_path = data.get("path", "")
        use_template = data.get("template", False)
        if use_template and rel_path.endswith(".java"):
            class_name = Path(rel_path).stem
            content = load_template(class_name)
        else:
            content = data.get("content", "") or ("// " + rel_path + "\n")
        project_create_file(_current_project_dir, rel_path, content)
        return jsonify({"ok": True})

    @app.route("/api/project/create-dir", methods=["POST"])
    def api_project_create_dir():
        data = request.get_json()
        if not data or _ensure_project_dir() is None:
            return jsonify({"ok": False}), 400
        project_create_dir(_current_project_dir, data.get("path", ""))
        return jsonify({"ok": True})

    @app.route("/api/project/delete", methods=["POST"])
    def api_project_delete():
        data = request.get_json()
        if not data or _ensure_project_dir() is None:
            return jsonify({"ok": False}), 400
        project_delete_entry(_current_project_dir, data.get("path", ""))
        return jsonify({"ok": True})
