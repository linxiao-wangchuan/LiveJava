"""
SocketIO 事件处理
=================
WebSocket 事件注册和业务逻辑编排 — 支持三种运行模式。
"""

import logging
import shutil
from pathlib import Path

_log = logging.getLogger("socket")

from config import TEMP_DIR, WORKSPACE_DIR, get_current_project_dir, get_java, get_javac
from core.code_utils import (
    auto_wrap_all,
    clean_temp_dir,
    detect_class_name,
    detect_package,
    find_entry,
    has_main_method,
    is_raw_snippet,
    load_template,
    prepare_java_code,
)
from core.compiler import compile_java
from core.runner import is_running, kill_process, run_java, send_input
from flask_socketio import emit
from workspace.project_workspace import get_all_java_files as proj_get_java_files
from workspace.project_workspace import get_out_dir, get_src_dir
from workspace.temp_workspace import get_all_java_files as temp_get_java_files
from workspace.temp_workspace import get_workspace_root
from workspace.temp_workspace import write_file as temp_write_file

# 模块级 SocketIO 实例（后台线程 emit 需要）
_sio = None


def _safe_emit(event, data):
    """线程安全的 emit：后台线程通过 _sio.emit() 规避请求上下文限制"""
    if _sio is not None:
        _sio.emit(event, data, namespace="/")


def register_socket_events(socketio):
    """注册所有 SocketIO 事件"""
    global _sio
    _sio = socketio

    @socketio.on("connect")
    def on_connect(data=None):
        _log.debug("客户端已连接")

    @socketio.on("disconnect")
    def on_disconnect(data=None):
        _log.debug("客户端已断开")

    @socketio.on("run_code")
    def on_run_code(data: dict):
        """接收代码，根据模式编译 + 运行"""
        code = data.get("code", "").strip()
        use_framework = data.get("use_framework", True)
        imports = data.get("imports", "")
        mode = data.get("mode", "temp_single")
        entry_path = data.get("entry_path", "")  # 多文件模式的运行入口相对路径

        if mode == "temp_single":
            _run_temp_single(code, use_framework, imports)
        elif mode == "temp_multi":
            _run_temp_multi(entry_path, use_framework, imports)
        elif mode == "project":
            _run_project(entry_path, use_framework, imports)

    @socketio.on("send_input")
    def on_send_input(data: dict):
        text = data.get("text", "")
        if not is_running():
            emit(
                "output",
                {"type": "system", "text": "[提示] 当前没有正在运行的程序。\n"},
            )
            return
        if send_input(text):
            emit("output", {"type": "input", "text": text + "\n"})
        else:
            emit(
                "output",
                {"type": "system", "text": "[错误] 输入失败，进程可能已结束。\n"},
            )

    @socketio.on("stop_code")
    def on_stop_code(data=None):
        kill_process()
        _safe_emit("output", {"type": "system", "text": "\n[停止] 用户终止了程序。\n"})
        _safe_emit("run_complete", {})


# ================================================================
# 临时单文件模式
# ================================================================
def _run_temp_single(code: str, use_framework: bool, imports: str):
    kill_process()

    wrapped_code, class_name = prepare_java_code(code, use_framework, imports)

    clean_temp_dir()
    java_file = TEMP_DIR / f"{class_name}.java"
    java_file.write_text(wrapped_code, encoding="utf-8")
    emit(
        "output", {"type": "system", "text": f"[编译] 正在编译 {class_name}.java ...\n"}
    )

    ok, err_msg = compile_java([java_file], TEMP_DIR, get_javac())
    if not ok:
        emit("output", {"type": "system", "text": "[错误] 编译失败:\n"})
        emit("output", {"type": "stderr", "text": err_msg + "\n"})
        emit("run_complete", {})
        return

    emit("output", {"type": "system", "text": "[编译] 编译成功 ✓\n"})
    emit("output", {"type": "system", "text": "[运行] 开始执行...\n\n"})

    _launch_java(str(TEMP_DIR), class_name)


# ================================================================
# 临时多文件模式
# ================================================================
def _run_temp_multi(entry_path: str, use_framework: bool = True, imports: str = ""):
    kill_process()
    clean_temp_dir()  # 清理上次残留的 Main.java 等

    all_files = temp_get_java_files()
    if not all_files:
        emit(
            "output", {"type": "system", "text": "[错误] 工作区没有找到 .java 文件。\n"}
        )
        emit("run_complete", {})
        return

    # 批量包装：始终自动检测（临时模式用 WORKSPACE_DIR 推导包名）
    if auto_wrap_all(all_files, True, WORKSPACE_DIR):
        emit(
            "output", {"type": "system", "text": "[包装] 已为代码片段自动生成类框架\n"}
        )

    # 确定运行入口
    entry_file, class_name = find_entry(all_files, entry_path)
    if class_name is None:
        emit(
            "output", {"type": "system", "text": "[错误] 找不到包含 main 方法的类。\n"}
        )
        emit("run_complete", {})
        return

    emit(
        "output",
        {"type": "system", "text": f"[编译] 正在编译 {len(all_files)} 个文件...\n"},
    )

    output_dir = TEMP_DIR / "out"
    ok, err_msg = compile_java(all_files, output_dir, get_javac())
    if not ok:
        emit("output", {"type": "system", "text": "[错误] 编译失败:\n"})
        emit("output", {"type": "stderr", "text": err_msg + "\n"})
        emit("run_complete", {})
        return

    emit(
        "output",
        {"type": "system", "text": f"[编译] 编译成功 ✓（{len(all_files)} 个文件）\n"},
    )
    emit("output", {"type": "system", "text": f"[运行] 运行入口: {class_name}\n\n"})

    _launch_java(str(output_dir), class_name)


# ================================================================
# 项目模式
# ================================================================
def _run_project(entry_path: str, use_framework: bool = True, imports: str = ""):
    kill_process()

    if get_current_project_dir() is None:
        emit("output", {"type": "system", "text": "[错误] 请先打开一个项目文件夹。\n"})
        emit("run_complete", {})
        return

    src_dir = get_src_dir(get_current_project_dir())
    out_dir = get_out_dir(get_current_project_dir())

    all_files = proj_get_java_files(get_current_project_dir(), src_dir_only=True)
    if not all_files:
        emit(
            "output",
            {"type": "system", "text": "[错误] src/ 目录下没有找到 .java 文件。\n"},
        )
        emit("run_complete", {})
        return

    # 批量包装：始终自动检测（项目模式用 src_dir 推导包名）
    if auto_wrap_all(all_files, True, src_dir):
        emit(
            "output", {"type": "system", "text": "[包装] 已为代码片段自动生成类框架\n"}
        )

    entry_file, class_name = find_entry(all_files, entry_path)
    if class_name is None:
        emit(
            "output", {"type": "system", "text": "[错误] 找不到包含 main 方法的类。\n"}
        )
        emit("run_complete", {})
        return

    # 构建 classpath：src + out
    cp = (
        str(src_dir) + ";" + str(out_dir)
        if shutil.os.name == "nt"
        else str(src_dir) + ":" + str(out_dir)
    )

    emit(
        "output",
        {
            "type": "system",
            "text": f"[编译] 正在编译 {len(all_files)} 个文件到 out/ ...\n",
        },
    )

    ok, err_msg = compile_java(all_files, out_dir, get_javac())
    if not ok:
        emit("output", {"type": "system", "text": "[错误] 编译失败:\n"})
        emit("output", {"type": "stderr", "text": err_msg + "\n"})
        emit("run_complete", {})
        return

    emit(
        "output",
        {"type": "system", "text": f"[编译] 编译成功 ✓（{len(all_files)} 个文件）\n"},
    )
    emit("output", {"type": "system", "text": f"[运行] 运行入口: {class_name}\n\n"})

    _launch_java(cp, class_name, str(src_dir))


# ================================================================
# 辅助函数
# ================================================================


def _launch_java(classpath: str, class_name: str, cwd: str = None):
    """启动 Java 进程（后台线程安全 emit）"""
    run_java(
        classpath=classpath,
        class_name=class_name,
        java_path=get_java(),
        cwd=cwd,
        on_stdout=lambda t: _safe_emit("output", {"type": "stdout", "text": t}),
        on_stderr=lambda t: _safe_emit("output", {"type": "stderr", "text": t}),
        on_complete=lambda rc: _on_run_complete(rc),
    )


def _on_run_complete(returncode: int):
    _safe_emit(
        "output",
        {"type": "system", "text": f"\n[完成] 进程已退出，返回码: {returncode}\n"},
    )
    _safe_emit("run_complete", {})
