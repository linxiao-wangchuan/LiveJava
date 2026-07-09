/**
 * 控制台输出 + 交互输入管理
 */
const Console = (() => {
  let _outputEl = null;
  let _inputEl = null;

  function init(outputSelector, inputSelector) {
    _outputEl = document.querySelector(outputSelector);
    _inputEl  = document.querySelector(inputSelector);
  }

  function append(type, text) {
    if (!_outputEl) return;
    const placeholder = _outputEl.querySelector(".empty");
    if (placeholder) placeholder.remove();

    const span = document.createElement("span");
    span.className = type;
    span.textContent = text;
    _outputEl.appendChild(span);
    _outputEl.scrollTop = _outputEl.scrollHeight;
  }

  function clear() {
    if (!_outputEl) return;
    _outputEl.innerHTML = '<span class="empty">等待运行... 按 Ctrl+Enter 或点击「运行」执行代码</span>';
    if (_inputEl) _inputEl.value = "";
  }

  function getInput() {
    return _inputEl ? _inputEl.value : "";
  }

  function clearInput() {
    if (_inputEl) _inputEl.value = "";
  }

  function setInputEnabled(enabled) {
    if (_inputEl) _inputEl.disabled = !enabled;
  }

  function focusInput() {
    if (_inputEl) _inputEl.focus();
  }

  function onInputKeydown(fn) {
    if (_inputEl) _inputEl.addEventListener("keydown", fn);
  }

  return { init, append, clear, getInput, clearInput, setInputEnabled, focusInput, onInputKeydown };
})();
