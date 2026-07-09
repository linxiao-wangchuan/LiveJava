"""
Java 代码工具
=============
代码包装、类名检测、import 解析、模板加载。
"""

import re
from pathlib import Path

# 模板文件路径
_MAIN_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_FILE = _MAIN_DIR / "java_template.txt"


def load_template(class_name: str) -> str:
    """从外储模板文件读取并替换 ${class_name}"""
    if TEMPLATE_FILE.exists():
        try:
            tmpl = TEMPLATE_FILE.read_text(encoding="utf-8")
        except Exception:
            tmpl = "public class ${class_name} {\n    public static void main(String[] args) {\n        //\n    }\n}\n"
    else:
        tmpl = "public class ${class_name} {\n    public static void main(String[] args) {\n        //\n    }\n}\n"
    return tmpl.replace("${class_name}", class_name)


def is_raw_snippet(code: str) -> bool:
    """判断代码是否为裸片段（无 class 定义且无 main 方法）"""
    has_class = bool(re.search(r"(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+\w+", code))
    return not has_class


def detect_class_name(code: str) -> str:
    """从 Java 代码中提取类名，找不到返回 'Main'"""
    m = re.search(
        r"(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)", code
    )
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
    body   = "\n".join(body_lines)

    wrapped = f"""{header}

public class Main {{
    public static void main(String[] args) {{
{body}
    }}
}}
"""
    return wrapped, "Main"
