/**
 * 主题管理器 — 黑白主题切换
 */
const ThemeManager = (() => {
  const KEY = "java_runner_theme";

  function getCurrent() {
    try {
      return localStorage.getItem(KEY) || "dark";
    } catch (_) {
      return "dark";
    }
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    // CodeMirror 主题名
    const cmTheme = theme === "light" ? "default" : "monokai";
    if (typeof Editor !== "undefined" && Editor.get()) {
      Editor.get().setOption("theme", cmTheme);
    }
    try { localStorage.setItem(KEY, theme); } catch (_) {}
  }

  function toggle() {
    const next = getCurrent() === "dark" ? "light" : "dark";
    apply(next);
    return next;
  }

  function init() {
    apply(getCurrent());
  }

  return { init, toggle, getCurrent, apply };
})();
