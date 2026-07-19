/**
 * 主题管理器 v2.3
 * ===============
 * 8 套预设 + 自定义主题 CRUD + 即时切换 + 蒙版颜色跟随
 */
const ThemeManager = (() => {
  const PRESETS = [
    { id: "sublime-dark",    name: "Sublime Dark",    file: "sublime-dark.css" },
    { id: "light",           name: "亮色",             file: "light.css" },
    { id: "monokai",         name: "Monokai",          file: "monokai.css" },
    { id: "one-dark",        name: "One Dark",         file: "one-dark.css" },
    { id: "dracula",         name: "Dracula",          file: "dracula.css" },
    { id: "nord",            name: "Nord",             file: "nord.css" },
    { id: "gruvbox-dark",    name: "Gruvbox Dark",     file: "gruvbox-dark.css" },
    { id: "solarized-dark",  name: "Solarized Dark",   file: "solarized-dark.css" },
  ];

  const LEGACY_MAP = { "dark": "sublime-dark" };

  const CORE_VARS = [
    "--bg-primary","--bg-secondary","--bg-tertiary","--bg-input",
    "--bg-hover","--bg-active","--border","--border-light",
    "--text","--text-dim","--text-bright","--accent","--accent2",
    "--red","--green","--yellow","--orange",
    "--btn-bg","--btn-hover","--btn-border",
    "--scrollbar-thumb","--scrollbar-track",
    "--sidebar-bg","--tab-active-bg","--tab-inactive-bg","--toolbar-bg",
  ];

  let _activeId = "sublime-dark";
  let _customThemes = [];

  // ── 初始化 ──
  function init() {
    try {
      let saved = localStorage.getItem("java_runner_theme");
      if (saved) _activeId = LEGACY_MAP[saved] || saved;
    } catch (_) {}
    try {
      const raw = localStorage.getItem("java_runner_custom_themes");
      if (raw) _customThemes = JSON.parse(raw);
    } catch (_) {}
    applyTheme(_activeId);
  }

  // ── 应用主题 ──
  function applyTheme(themeId) {
    _activeId = themeId;
    document.documentElement.setAttribute("data-theme", themeId);

    const preset = PRESETS.find(p => p.id === themeId);
    if (preset) {
      loadThemeCSS(preset.file);
      _clearOverrides();
    } else {
      const custom = _customThemes.find(t => t.id === themeId);
      if (custom) _applyColors(custom.colors);
    }

    // CodeMirror 主题跟随：亮色用 default，暗色用 monokai
    const cmTheme = (themeId === "light") ? "default" : "monokai";
    try {
      if (typeof Editor !== "undefined" && Editor.get()) {
        Editor.get().setOption("theme", cmTheme);
      }
      // Tab 编辑器也要更新
      if (typeof TabManager !== "undefined" && TabManager.isEnabled()) {
        TabManager.forEachEditor(ed => ed.setOption("theme", cmTheme));
      }
    } catch (_) {}

    try { localStorage.setItem("java_runner_theme", themeId); } catch (_) {}
    _syncConfig();
  }

  function loadThemeCSS(filename) {
    let el = document.getElementById("theme-dynamic");
    if (!el) {
      el = document.createElement("style");
      el.id = "theme-dynamic";
      document.head.appendChild(el);
    }
    fetch("/static/css/themes/" + filename)
      .then(r => r.text())
      .then(css => { el.textContent = css; })
      .catch(() => {});
  }

  function _applyColors(colors) {
    _clearOverrides();
    const root = document.documentElement;
    for (const [k, v] of Object.entries(colors)) root.style.setProperty(k, v);
    let el = document.getElementById("theme-dynamic");
    if (el) el.textContent = "";
  }

  function _clearOverrides() {
    for (const v of CORE_VARS) document.documentElement.style.removeProperty(v);
  }

  function _syncConfig() {
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: _activeId, custom_themes: _customThemes }),
    }).catch(() => {});
  }

  // ── getters ──
  function getActive() { return _activeId; }
  function getPresets() { return PRESETS; }
  function getCustomThemes() { return _customThemes; }
  function isPreset(id) { return PRESETS.some(p => p.id === id); }

  // ── 自定义主题 CRUD ──
  function createCustom(name, colors) {
    const id = "custom-" + Date.now();
    _customThemes.push({ id, name, colors: Object.assign({}, colors) });
    _saveCustom();
    return id;
  }

  function updateCustom(id, name, colors) {
    const t = _customThemes.find(t => t.id === id);
    if (!t) return;
    if (name) t.name = name;
    if (colors) t.colors = Object.assign({}, colors);
    _saveCustom();
  }

  function deleteCustom(id) {
    _customThemes = _customThemes.filter(t => t.id !== id);
    if (_activeId === id) applyTheme("sublime-dark");
    _saveCustom();
  }

  function _saveCustom() {
    try { localStorage.setItem("java_runner_custom_themes", JSON.stringify(_customThemes)); } catch (_) {}
    _syncConfig();
  }

  // ── 蒙版颜色 ──
  function getPrimaryBg() {
    return getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim() || "#1e1e1e";
  }

  // ── 预览（不持久化） ──
  function previewColors(colors) {
    _clearOverrides();
    for (const [k, v] of Object.entries(colors)) {
      document.documentElement.style.setProperty(k, v);
    }
  }

  return {
    init, applyTheme, getActive, getPresets, getCustomThemes, isPreset,
    createCustom, updateCustom, deleteCustom,
    getPrimaryBg, previewColors, CORE_VARS,
  };
})();
