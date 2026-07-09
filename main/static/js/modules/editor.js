/**
 * CodeMirror 编辑器管理
 */
const Editor = (() => {
  let _cm = null;

  const DEFAULTS = {
    mode: "text/x-java",
    theme: "monokai",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    lineWrapping: true,
    viewportMargin: Infinity,
  };

  function init(textareaSelector, initialCode) {
    const ta = document.querySelector(textareaSelector);
    if (!ta) return null;
    _cm = CodeMirror.fromTextArea(ta, DEFAULTS);
    _cm.setValue(initialCode || "");
    _cm.setSize("100%", "100%");
    _cm.refresh();

    // auto-save
    _cm.on("change", () => {
      try {
        localStorage.setItem("java_runner_code", _cm.getValue());
      } catch (_) {}
    });

    return _cm;
  }

  function getValue()       { return _cm ? _cm.getValue() : ""; }
  function setValue(code)   { if (_cm) _cm.setValue(code); }
  function focus()          { if (_cm) _cm.focus(); }
  function setCursor(line)  { if (_cm) _cm.setCursor(line, 0); }
  function getLineCount()   { return _cm ? _cm.lineCount() : 0; }
  function get()            { return _cm; }

  function onChange(fn)     { if (_cm) _cm.on("change", fn); }

  return { init, getValue, setValue, focus, setCursor, getLineCount, get, onChange };
})();
