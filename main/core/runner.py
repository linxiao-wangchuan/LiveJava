"""
Java 运行器模块
===============
封装 java 进程管理：启动、实时输出读取、stdin 写入、终止。
"""

import codecs
import threading
import subprocess
from typing import Callable


# ============================================================
# 全局进程状态
# ============================================================
_running_process: subprocess.Popen | None = None
_process_lock = threading.Lock()

MAX_EXECUTION_SECONDS = 60


def is_running() -> bool:
    with _process_lock:
        return _running_process is not None and _running_process.poll() is None


def kill_process():
    """终止正在运行的 Java 进程（先关管道再杀，确保彻底终止）"""
    global _running_process
    with _process_lock:
        proc = _running_process
        if proc is None:
            return
        # 先关 stdin，防止管道阻塞导致进程挂起
        try:
            proc.stdin.close()
        except Exception:
            pass
        # 杀进程
        try:
            proc.kill()
            proc.wait(timeout=3)  # 等最多 3 秒让它死透
        except Exception:
            pass
        # 关 stdout/stderr，释放读取线程
        try:
            proc.stdout.close()
        except Exception:
            pass
        try:
            proc.stderr.close()
        except Exception:
            pass
        _running_process = None


def send_input(text: str) -> bool:
    """向 Java 进程的 stdin 写入文本。返回是否成功。"""
    with _process_lock:
        proc = _running_process
        if proc is None or proc.poll() is not None:
            return False
        try:
            proc.stdin.write((text + "\n").encode("utf-8"))
            proc.stdin.flush()
            return True
        except (BrokenPipeError, OSError):
            return False


def run_java(
    classpath: str,
    class_name: str,
    java_path: str = "java",
    on_stdout: Callable[[str], None] | None = None,
    on_stderr: Callable[[str], None] | None = None,
    on_complete: Callable[[int], None] | None = None,
    timeout: int = MAX_EXECUTION_SECONDS,
):
    """
    在子进程中运行 Java 类，实时读取 stdout/stderr。
    参数:
        classpath:   类路径
        class_name:  要运行的类名
        java_path:   java 可执行文件路径
        on_stdout:   stdout 回调（每收到一段完整字符调用一次）
        on_stderr:   stderr 回调
        on_complete: 进程结束回调（接收 returncode）
        timeout:     超时秒数
    """
    global _running_process

    # 终止旧进程
    kill_process()

    try:
        process = subprocess.Popen(
            [
                java_path, "-cp", classpath,
                "-Dfile.encoding=UTF-8",
                "-Dsun.stdout.encoding=UTF-8",
                "-Dsun.stderr.encoding=UTF-8",
                class_name,
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=classpath,
        )
    except FileNotFoundError:
        if on_stderr:
            on_stderr("[错误] 找不到 java，请确认 JDK 已安装并正确配置。\n")
        if on_complete:
            on_complete(-1)
        return
    except Exception as e:
        if on_stderr:
            on_stderr(f"[错误] 运行异常: {e}\n")
        if on_complete:
            on_complete(-1)
        return

    with _process_lock:
        _running_process = process

    # ---- stdout 读取线程 ----
    def _read_stdout():
        try:
            decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
            while True:
                b = process.stdout.read(1)
                if not b:
                    final = decoder.decode(b"", final=True)
                    if final and on_stdout:
                        on_stdout(final)
                    break
                text = decoder.decode(b)
                if text and on_stdout:
                    on_stdout(text)
        except (ValueError, OSError):
            pass

    # ---- stderr 读取线程 ----
    def _read_stderr():
        try:
            decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
            while True:
                b = process.stderr.read(1)
                if not b:
                    final = decoder.decode(b"", final=True)
                    if final and on_stderr:
                        on_stderr(final)
                    break
                text = decoder.decode(b)
                if text and on_stderr:
                    on_stderr(text)
        except (ValueError, OSError):
            pass

    # ---- 进程等待线程 ----
    def _wait():
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
                process.wait()
            except Exception:
                pass
            if on_stderr:
                on_stderr(f"\n[超时] 程序运行超过 {timeout} 秒，已强制终止。\n")

        t_stdout.join(timeout=2)
        t_stderr.join(timeout=2)

        with _process_lock:
            global _running_process
            if _running_process is process:
                _running_process = None

        if on_complete:
            on_complete(process.returncode)

    t_stdout = threading.Thread(target=_read_stdout, daemon=True)
    t_stderr = threading.Thread(target=_read_stderr, daemon=True)
    t_wait   = threading.Thread(target=_wait,       daemon=True)

    t_stdout.start()
    t_stderr.start()
    t_wait.start()
