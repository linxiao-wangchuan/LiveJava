"""
Java 编译器模块
===============
封装 javac 编译逻辑，支持单文件和多文件批量编译。
"""

import subprocess
from pathlib import Path


def compile_java(
    source_files: list[Path],
    output_dir: Path,
    javac_path: str = "javac",
    timeout: int = 15,
) -> tuple[bool, str]:
    """
    编译 Java 源文件。
    参数:
        source_files: .java 文件路径列表
        output_dir:   .class 输出目录
        javac_path:   javac 可执行文件路径
        timeout:      编译超时秒数
    返回:
        (成功标志, 错误信息或空字符串)
    """
    if not source_files:
        return False, "没有可编译的 Java 文件。"

    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        javac_path,
        "-encoding",
        "UTF-8",
        "-d",
        str(output_dir),
    ] + [str(f) for f in source_files]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(output_dir),
        )
        if result.returncode != 0:
            return False, result.stderr or result.stdout or "(未知编译错误)"
        return True, ""
    except subprocess.TimeoutExpired:
        return False, f"编译超时（{timeout} 秒）。"
    except FileNotFoundError:
        return False, "找不到 javac，请确认 JDK 已安装并正确配置。"
    except Exception as e:
        return False, f"编译异常: {e}"
