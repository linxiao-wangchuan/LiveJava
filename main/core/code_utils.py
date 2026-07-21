"""
Java 代码工具
=============
代码包装、类名检测、import 解析、模板加载、多文件预处理。
"""

import logging
import re
import shutil
from pathlib import Path

from config import TEMP_DIR, WORKSPACE_DIR

_log = logging.getLogger("core")

# 模板文件路径
_MAIN_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_FILE = _MAIN_DIR / "java_template.txt"


def load_template(class_name: str) -> str:
    """从外储模板文件读取并替换 ${class_name}"""
    if TEMPLATE_FILE.exists():
        try:
            tmpl = TEMPLATE_FILE.read_text(encoding="utf-8")
        except Exception:
            _log.debug("读取模板文件失败", exc_info=True)
            tmpl = "public class ${class_name} {\n    public static void main(String[] args) {\n        //\n    }\n}\n"
    else:
        tmpl = "public class ${class_name} {\n    public static void main(String[] args) {\n        //\n    }\n}\n"
    return tmpl.replace("${class_name}", class_name)


def is_raw_snippet(code: str) -> bool:
    """判断代码是否为裸片段（无 class 定义且无 main 方法）"""
    has_class = bool(
        re.search(r"(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+\w+", code)
    )
    return not has_class


def detect_class_name(code: str) -> str:
    """从 Java 代码中提取类名，找不到返回 'Main'"""
    m = re.search(r"(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)", code)
    return m.group(1) if m else "Main"


def has_main_method(code: str) -> bool:
    """检测代码中是否包含 main 方法"""
    return bool(re.search(r"void\s+main\s*\(\s*String", code))


def normalize_imports(raw_imports: str) -> list[str]:
    """
    规范化用户输入的导入包文本。
    支持 "java.util.Scanner" 或 "import java.util.Scanner;"
    返回去重后的 import 语句列表。
    """
    lines: list[str] = []
    seen = set()
    for raw in raw_imports.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if not line.startswith("import "):
            line = "import " + line
        if not line.endswith(";"):
            line = line + ";"
        if line not in seen:
            seen.add(line)
            lines.append(line)
    return lines


def prepare_java_code(
    code: str, use_framework: bool = True, imports: str = ""
) -> tuple[str, str]:
    """
    处理用户代码，使其可编译。
    返回: (完整 Java 源码, 类名)

    use_framework=True  → 代码片段自动包装成 Main 类
    use_framework=False → 原样使用，拼接导入包区域的内容
    """
    # ================================================================
    # 框架关闭：用户自己写完整代码
    # ================================================================
    if not use_framework:
        imports_clean = imports.strip()
        if imports_clean:
            import_lines = normalize_imports(imports_clean)
            imports_str = "\n".join(import_lines)

            user_has_imports = any(
                l.strip().startswith("import ") or l.strip().startswith("package ")
                for l in code.split("\n")
            )
            if user_has_imports:
                code = imports_str + "\n" + code
            else:
                code = imports_str + "\n\n" + code

        return code, detect_class_name(code)

    # ================================================================
    # 框架开启：自动包装
    # ================================================================
    cn = detect_class_name(code)
    if cn != "Main" and has_main_method(code):
        # 完整 Java 类，直接使用
        return code, cn

    # ---- 分离 import/package 和代码体 ----
    header_lines: list[str] = []
    body_lines: list[str] = []

    for line in code.split("\n"):
        stripped = line.strip()
        if stripped.startswith("import ") or stripped.startswith("package "):
            header_lines.append(stripped)
        else:
            body_lines.append(line)

    # 自动补充 Scanner
    if not any("Scanner" in imp for imp in header_lines):
        header_lines.append("import java.util.Scanner;")

    header = "\n".join(header_lines)
    body = "\n".join(body_lines)

    wrapped = f"""{header}

public class Main {{
    public static void main(String[] args) {{
{body}
    }}
}}
"""
    return wrapped, "Main"


# ================================================================
# 多文件预处理（从 socket_events.py 迁入）
# ================================================================


def clean_temp_dir():
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
            _log.debug("清理临时目录失败: %s", f, exc_info=True)


def derive_package(file_path: Path, base_dir=None) -> str:
    """根据文件在 base_dir 下的位置推导包名"""
    base = Path(base_dir) if base_dir else WORKSPACE_DIR
    try:
        rel = file_path.relative_to(base)
    except ValueError:
        return ""
    parts = rel.parts[:-1]  # 去掉文件名
    return ".".join(parts) if parts else ""


def detect_package(code: str) -> str:
    """从 Java 代码中提取 package 声明，没有则返回空字符串"""
    m = re.search(r"package\s+([\w.]+)\s*;", code)
    return m.group(1) if m else ""


def auto_wrap_all(java_files: list[Path], use_framework: bool, base_dir=None) -> bool:
    """
    扫描所有文件：
    - 裸片段 → 包装成独立类
    - 已有类但没有 package 且位于子目录 → 补上 package 声明
    避免不同目录下的同名类因无包声明而冲突。
    base_dir: 推导包名的基准目录（临时模式用 WORKSPACE_DIR，项目模式用 src_dir）
    """
    if not use_framework:
        return False
    wrapped_any = False
    for f in java_files:
        try:
            content = f.read_text(encoding="utf-8")
        except Exception:
            _log.debug("读取源文件失败: %s", f, exc_info=True)
            continue

        pkg = derive_package(f, base_dir)

        if is_raw_snippet(content):
            # 裸片段：完整包装
            class_name = f.stem
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

        elif pkg and not detect_package(content):
            # 已有类但缺 package 且位于子目录 → 补上 package
            f.write_text(f"package {pkg};\n\n{content}", encoding="utf-8")
            wrapped_any = True

    return wrapped_any


def find_entry(
    java_files: list[Path], preferred: str = ""
) -> tuple[Path | None, str | None]:
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
            pkg = detect_package(content)
            fqn = (pkg + "." + cn) if pkg else cn
            candidates.append((f, fqn))

    if not candidates:
        return None, None

    if preferred:
        for f, fqn in candidates:
            try:
                rel = str(f.relative_to(WORKSPACE_DIR)).replace("\\", "/")
                if rel == preferred or rel.endswith(preferred):
                    return f, fqn
            except ValueError:
                pass
        for f, fqn in candidates:
            if f.name == Path(preferred).name:
                return f, fqn

    return candidates[0]
