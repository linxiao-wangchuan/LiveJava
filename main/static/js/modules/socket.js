/**
 * Socket.IO 连接管理
 */
const SocketManager = (() => {
  let _socket = null;
  let _onOutput = null;
  let _onRunComplete = null;

  function connect() {
    _socket = io({ transports: ["polling", "websocket"] });

    _socket.on("connect", () => {
      console.log("[Socket] connected");
    });

    _socket.on("disconnect", () => {
      console.log("[Socket] disconnected");
    });

    _socket.on("output", (data) => {
      if (_onOutput) _onOutput(data);
    });

    _socket.on("run_complete", () => {
      if (_onRunComplete) _onRunComplete();
    });

    return _socket;
  }

  function onOutput(fn)  { _onOutput = fn; }
  function onRunComplete(fn) { _onRunComplete = fn; }

  function emit(event, data) {
    if (_socket) _socket.emit(event, data);
  }

  function get() { return _socket; }

  return { connect, onOutput, onRunComplete, emit, get };
})();
