"""
Java 本地运行服务器 — 启动入口
===============================
启动: python server.py  → 浏览器打开 http://localhost:5000
"""

from config import (
    load_config, resolve_java, set_java_paths,
    update_path_history, TEMP_DIR, MAIN_DIR, PROJECT_DIR,
)
from web.app import create_app, init_socketio
from web.routes import register_routes
from web.socket_events import register_socket_events


def main():
    # 0. 清理上次残留的 Java 孤儿进程
    import subprocess as _sp
    for _exe in ("java.exe", "javac.exe"):
        try:
            _sp.run(["taskkill", "/f", "/im", _exe], capture_output=True, timeout=5)
        except Exception:
            pass

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

    # 5. 打印信息
    print("=" * 55)
    print("  [Java] Java Local Run Server  v2.0")
    print("=" * 55)
    print(f"  JAVAC : {javac_path}")
    print(f"  JAVA  : {java_path}")
    print(f"  TEMP  : {TEMP_DIR}")
    print(f"  URL   : http://localhost:5000")
    print("=" * 55)

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
