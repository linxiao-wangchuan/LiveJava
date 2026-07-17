/**
 * Socket.IO 连接管理 — 自动重连 + 状态保持
 */
const SocketManager = (() => {
  let _socket = null;
  let _onOutput = null;
  let _onRunComplete = null;
  let _reconnectAttempts = 0;
  let _wasRunning = false;

  function connect() {
    _socket = io({
      transports: ["polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });

    _socket.on("connect", () => {
      console.log("[Socket] connected");
      if (_reconnectAttempts > 0) {
        // 重连成功：通知用户
        if (_onOutput) _onOutput({ type: "system", text: "[连接] 已重新连接到服务器。\n" });
        _reconnectAttempts = 0;
      }
    });

    _socket.on("disconnect", (reason) => {
      console.log("[Socket] disconnected:", reason);
      // 保存编辑器内容到 localStorage，防止重启丢失
      _saveEditorSnapshot();
      _reconnectAttempts++;
    });

    _socket.on("reconnect_attempt", (attempt) => {
      console.log("[Socket] reconnect attempt:", attempt);
    });

    _socket.on("reconnect_error", (error) => {
      console.log("[Socket] reconnect error:", error.message);
    });

    _socket.on("reconnect_failed", () => {
      console.log("[Socket] reconnect failed after max attempts");
      if (_onOutput) _onOutput({ type: "system", text: "[连接] 服务器连接失败，请刷新页面重试。\n" });
    });

    _socket.on("output", (data) => {
      if (_onOutput) _onOutput(data);
    });

    _socket.on("run_complete", () => {
      if (_onRunComplete) _onRunComplete();
    });

    return _socket;
  }

  function _saveEditorSnapshot() {
    // 保存编辑器内容
    try {
      if (typeof Editor !== "undefined" && Editor.getValue) {
        const code = Editor.getValue();
        if (code && code.trim()) {
          localStorage.setItem("java_runner_snapshot", code);
          localStorage.setItem("java_runner_snapshot_time", Date.now());
        }
      }
    } catch (_) {}
  }

  function onOutput(fn)  { _onOutput = fn; }
  function onRunComplete(fn) { _onRunComplete = fn; }

  function emit(event, data) {
    if (_socket && _socket.connected) {
      _socket.emit(event, data);
    }
  }

  function get() { return _socket; }
  function isConnected() { return _socket && _socket.connected; }

  return { connect, onOutput, onRunComplete, emit, get, isConnected };
})();
