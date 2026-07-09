"""
Flask 应用工厂
==============
创建 Flask 和 SocketIO 实例。
"""

from pathlib import Path
from flask import Flask
from flask_socketio import SocketIO

_socketio: SocketIO | None = None

# 模板和静态文件目录（相对于本文件 web/app.py）
_MODULE_DIR = Path(__file__).resolve().parent          # web/
_MAIN_DIR   = _MODULE_DIR.parent                        # main/
_TEMPLATE_DIR = _MAIN_DIR / "templates"
_STATIC_DIR   = _MAIN_DIR / "static"


def create_app() -> Flask:
    """创建并配置 Flask 应用"""
    app = Flask(
        __name__,
        template_folder=str(_TEMPLATE_DIR),
        static_folder=str(_STATIC_DIR),
    )
    app.config["SECRET_KEY"] = "java-local-server-2024-secret"
    return app


def init_socketio(app: Flask) -> SocketIO:
    """初始化 SocketIO"""
    global _socketio
    _socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="*")
    return _socketio


def get_socketio() -> SocketIO:
    """获取 SocketIO 实例（供其他模块使用）"""
    if _socketio is None:
        raise RuntimeError("SocketIO not initialized. Call init_socketio() first.")
    return _socketio
