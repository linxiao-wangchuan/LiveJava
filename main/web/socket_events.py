"""
SocketIO 事件处理
=================
WebSocket 事件注册和业务逻辑编排 — 支持三种运行模式。
"""

import shutil
import re
from pathlib import Path
from flask_socketio import emit

from config import TEMP_DIR, WORKSPACE_DIR, get_javac, get_java
from core.code_utils import (
    prepare_java_code, detect_class_name, has_main_method,
    is_raw_snippet, load_template,
)
from core.compiler import compile_java
from core.runner import run_java, kill_process, send_input, is_running
from workspace.temp_workspace import (
    get_all_java_files as temp_get_java_files,
    write_file as temp_write_file,
    get_workspace_root,
)
from workspace.project_workspace import (
    get_all_java_files as proj_get_java_files,
    get_src_dir, get_out_dir,
)
from web.routes import _current_project_dir

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
        print("[连接] 客户端已连接")

    @socketio.on("disconnect")
    def on_disconnect(data=None):
        print("[连接] 客户端已断开")

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
            emit("output", {"type": "system", "text": "[提示] 当前没有正在运行的程序。\n"})
            return
        if send_input(text):
            emit("output", {"type": "input", "text": text + "\n"})
        else:
            emit("output", {"type": "system", "text": "[错误] 输入失败，进程可能已结束。\n"})

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

    _clean_temp_dir()
    java_file = TEMP_DIR / f"{class_name}.java"
    java_file.write_text(wrapped_code, encoding="utf-8")
    emit("output", {"type": "system", "text": f"[编译] 正在编译 {class_name}.java ...\n"})

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
    _clean_temp_dir()  # 清理上次残留的 Main.java 等

    all_files = temp_get_java_files()
    if not all_files:
        emit("output", {"type": "system", "text": "[错误] 工作区没有找到 .java 文件。\n"})
        emit("run_complete", {})
        return

    # 批量包装：始终自动检测并包装裸片段（不受开关影响）
    if _auto_wrap_all(all_files, True):
        emit("output", {"type": "system", "text": "[包装] 已为代码片段自动生成类框架\n"})

    # 确定运行入口
    entry_file, class_name = _find_entry(all_files, entry_path)
    if class_name is None:
        emit("output", {"type": "system", "text": "[错误] 找不到包含 main 方法的类。\n"})
        emit("run_complete", {})
        return

    emit("output", {"type": "system", "text": f"[编译] 正在编译 {len(all_files)} 个文件...\n"})

    output_dir = TEMP_DIR / "out"
    ok, err_msg = compile_java(all_files, output_dir, get_javac())
    if not ok:
        emit("output", {"type": "system", "text": "[错误] 编译失败:\n"})
        emit("output", {"type": "stderr", "text": err_msg + "\n"})
        emit("run_complete", {})
        return

    emit("output", {"type": "system", "text": f"[编译] 编译成功 ✓（{len(all_files)} 个文件）\n"})
    emit("output", {"type": "system", "text": f"[运行] 运行入口: {class_name}\n\n"})

    _launch_java(str(output_dir), class_name)


# ================================================================
# 项目模式
# ================================================================
def _run_project(entry_path: str, use_framework: bool = True, imports: str = ""):
    kill_process()

    global _current_project_dir
    from web.routes import _ensure_project_dir
    if _ensure_project_dir() is None:
        emit("output", {"type": "system", "text": "[错误] 请先打开一个项目文件夹。\n"})
        emit("run_complete", {})
        return

    src_dir = get_src_dir(_current_project_dir)
    out_dir = get_out_dir(_current_project_dir)

    all_files = proj_get_java_files(_current_project_dir, src_dir_only=True)
    if not all_files:
        emit("output", {"type": "system", "text": "[错误] src/ 目录下没有找到 .java 文件。\n"})
        emit("run_complete", {})
        return

    # 批量包装：始终自动检测
    if _auto_wrap_all(all_files, True):
        emit("output", {"type": "system", "text": "[包装] 已为代码片段自动生成类框架\n"})

    entry_file, class_name = _find_entry(all_files, entry_path)
    if class_name is None:
        emit("output", {"type": "system", "text": "[错误] 找不到包含 main 方法的类。\n"})
        emit("run_complete", {})
        return

    # 构建 classpath：src + out
    cp = str(src_dir) + ";" + str(out_dir) if shutil.os.name == "nt" else str(src_dir) + ":" + str(out_dir)

    emit("output", {"type": "system", "text": f"[编译] 正在编译 {len(all_files)} 个文件到 out/ ...\n"})

    ok, err_msg = compile_java(all_files, out_dir, get_javac())
    if not ok:
        emit("output", {"type": "system", "text": "[错误] 编译失败:\n"})
        emit("output", {"type": "stderr", "text": err_msg + "\n"})
        emit("run_complete", {})
        return

    emit("output", {"type": "system", "text": f"[编译] 编译成功 ✓（{len(all_files)} 个文件）\n"})
    emit("output", {"type": "system", "text": f"[运行] 运行入口: {class_name}\n\n"})

    _launch_java(cp, class_name)


# ================================================================
# 辅助函数
# ================================================================

def _launch_java(classpath: str, class_name: str):
    """启动 Java 进程（后台线程安全 emit）"""
    run_java(
        classpath=classpath,
        class_name=class_name,
        java_path=get_java(),
        on_stdout=lambda t: _safe_emit("output", {"type": "stdout", "text": t}),
        on_stderr=lambda t: _safe_emit("output", {"type": "stderr", "text": t}),
        on_complete=lambda rc: _on_run_complete(rc),
    )


def _auto_wrap_all(java_files: list[Path], use_framework: bool) -> bool:
    """
    扫描所有文件，将裸片段自动包装为独立类。
    自动添加 package 声明（根据目录结构），避免同名类冲突。
    """
    if not use_framework:
        return False
    wrapped_any = False
    for f in java_files:
        try:
            content = f.read_text(encoding="utf-8")
        except Exception:
            continue
        if is_raw_snippet(content):
            class_name = f.stem
            # 从文件路径推导包名（相对 WORKSPACE_DIR）
            pkg = _derive_package(f)
            body_lines = content.strip().split("\n")
            body = "\n".join("        " + line for line in body_lines)

            if pkg:
                wrapped = (
                    f"package {pkg};\n\n"
                    f"public class {class_name} {{\n"
                    f"    public static void main(String[] args) {{\n"
                    f"{body}\n"
                    f"    }}\n"
                    f"}}\n"
                )
            else:
                wrapped = load_template(class_name)
                wrapped = wrapped.replace("        //\n", body + "\n")

            f.write_text(wrapped, encoding="utf-8")
            wrapped_any = True
    return wrapped_any


def _derive_package(file_path: Path) -> str:
    """根据文件在 WORKSPACE_DIR 下的位置推导包名"""
    try:
        rel = file_path.relative_to(WORKSPACE_DIR)
    except ValueError:
        return ""
    parts = rel.parts[:-1]  # 去掉文件名
    return ".".join(parts) if parts else ""


def _wrap_entry_file(
    java_files: list[Path], preferred: str, imports: str
) -> tuple[Path | None, str | None]:
    """
    对入口文件应用自动包装，写入独立的 Main.java 到 TEMP_DIR。
    返回 (Main.java的Path, "Main") 或 (None, None)。
    """
    target = None
    if preferred:
        for f in java_files:
            if f.name == Path(preferred).name or str(f).endswith(preferred):
                target = f
                break
    if target is None and java_files:
        target = java_files[0]
    if target is None:
        return None, None

    try:
        original = target.read_text(encoding="utf-8")
    except Exception:
        return None, None

    wrapped_code, _ = prepare_java_code(original, use_framework=True, imports=imports)
    # 写入 TEMP_DIR 而不是覆盖原文件，避免 public class Main 与文件名不匹配
    wrapper_file = TEMP_DIR / "Main.java"
    wrapper_file.write_text(wrapped_code, encoding="utf-8")
    return wrapper_file, wrapped_code


def _detect_package(code: str) -> str:
    """从 Java 代码中提取 package 声明，没有则返回空字符串"""
    m = re.search(r"package\s+([\w.]+)\s*;", code)
    return m.group(1) if m else ""


def _find_entry(java_files: list[Path], preferred: str = "") -> tuple[Path | None, str | None]:
    """
    在所有 .java 文件中找到带 main 方法的入口。
    返回 (文件Path, 全限定类名) 或 (None, None)。
    """
    candidates = []
    for f in java_files:
        try:
            content = f.read_text(encoding="utf-8")
        except Exception:
            continue
        if has_main_method(content):
            cn = detect_class_name(content)
            pkg = _detect_package(content)
            fqn = (pkg + "." + cn) if pkg else cn  # 全限定名
            candidates.append((f, fqn))

    if not candidates:
        return None, None

    if preferred:
        for f, fqn in candidates:
            if f.name == Path(preferred).name or str(f).endswith(preferred):
                return f, fqn

    return candidates[0]


def _clean_temp_dir():
    """清空临时编译目录（保留 workspace 子目录，但清理 out/ 里的旧 .class）"""
    for f in TEMP_DIR.glob("*"):
        try:
            if f.name == "workspace":
                continue
            if f.name == "out":
                shutil.rmtree(f, ignore_errors=True)
                continue
            if f.is_file():
                f.unlink()
            elif f.is_dir():
                shutil.rmtree(f, ignore_errors=True)
        except Exception:
            pass


def _on_run_complete(returncode: int):
    _safe_emit("output", {"type": "system", "text": f"\n[完成] 进程已退出，返回码: {returncode}\n"})
    _safe_emit("run_complete", {})
