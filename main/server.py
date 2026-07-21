"""
Java 本地运行服务器 — 启动入口
===============================
启动: python server.py  → 浏览器打开 http://localhost:5000
"""

import logging
import subprocess

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
_log = logging.getLogger("server")

from config import (
    MAIN_DIR,
    PROJECT_DIR,
    TEMP_DIR,
    load_config,
    resolve_java,
    set_java_paths,
    update_path_history,
)
from web.app import create_app, init_socketio
from web.routes import register_routes
from web.socket_events import register_socket_events


def main():
    # 0. 清理上次残留的 Java 孤儿进程
    for exe in ("java.exe", "javac.exe"):
        try:
            subprocess.run(
                ["taskkill", "/f", "/im", exe], capture_output=True, timeout=5
            )
        except Exception:
            _log.debug("清理孤儿进程失败: %s", exe)

    # 1. 加载配置 + 清理失效路径
    cfg = load_config()
    update_path_history(cfg)

    # 2. 解析 Java 路径
    javac_path, java_path = resolve_java(cfg)
    set_java_paths(javac_path, java_path)

    # 3. 创建 Flask + SocketIO
    app = create_app()
    socketio = init_socketio(app)

    # 4. 注册路由和事件
    register_routes(app)
    register_socket_events(socketio)

    # 5. 启动日志
    _log.info("Java Local Run Server v2.0")
    _log.info("JAVAC: %s", javac_path)
    _log.info("JAVA:  %s", java_path)
    _log.info("TEMP:  %s", TEMP_DIR)
    _log.info("URL:   http://localhost:5000")

    # 6. 启动
    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":
    main()
