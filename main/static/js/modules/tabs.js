/**
 * 多 Tab 编辑器管理
 * ==================
 * 管理多个 CodeMirror 实例，提供 Tab 栏 UI。
 * 单文件模式下不启用，多文件/项目模式下接管编辑器区域。
 */
const TabManager = (() => {
  let _tabs = [];              // [{path, title, editor, dirty, container}]
  let _activePath = null;
  let _enabled = false;
  let _onActivate = null;      // 切换 Tab 时回调 (path, title)

  // ── UI 元素引用 ──
  const $tabBar   = () => document.querySelector("#tab_bar");
  const $tabList  = () => document.querySelector("#tab_list");
  const $wrapper  = () => document.querySelector("#editor_wrapper");
  const $codeArea = () => document.querySelector("#code_editor");
  const $info     = () => document.querySelector("#editor_info");

  function enable() {
    if (_enabled) return;
    _enabled = true;
    const bar = $tabBar();
    const wrap = $wrapper();
    const code = $codeArea();
    if (bar) bar.style.display = "flex";
    if (wrap) wrap.style.display = "block";
    if (code) code.style.display = "none";
  }

  function disable() {
    _enabled = false;
    // 先关闭所有 tab
    while (_tabs.length > 0) {
      _destroyTab(_tabs[0]);
    }
    _tabs = [];
    _activePath = null;
    const bar = $tabBar();
    const wrap = $wrapper();
    const code = $codeArea();
    if (bar) bar.style.display = "none";
    if (wrap) { wrap.style.display = "none"; wrap.innerHTML = ""; }
    if (code) code.style.display = "";
    if ($tabList()) $tabList().innerHTML = "";
  }

  function isEnabled() { return _enabled; }

  // ── 打开 Tab ──
  function openTab(path, title, content, autoSaveFn) {
    if (!_enabled) return;

    // 已存在 → 激活
    const existing = _tabs.find(t => t.path === path);
    if (existing) {
      activateTab(path);
      return;
    }

    // 创建容器
    const container = document.createElement("div");
    container.className = "editor-instance";
    container.setAttribute("data-path", path);
    $wrapper().appendChild(container);

    // 创建 CodeMirror 实例
    const cm = Editor.createInstance(container, content || "");

    const tab = {
      path: path,
      title: title || path.split("/").pop(),
      editor: cm,
      dirty: false,
      container: container,
    };

    // 监听修改
    cm.on("change", () => {
      tab.dirty = true;
      _renderTabBar();
    });

    _tabs.push(tab);
    _activateTabInternal(tab);
    _renderTabBar();
  }

  function closeTab(path) {
    const idx = _tabs.findIndex(t => t.path === path);
    if (idx < 0) return;
    const tab = _tabs[idx];

    // 如果是最后一个 tab 且只有一个 → 不关
    if (_tabs.length <= 1 && _enabled) return;

    _destroyTab(tab);
    _tabs.splice(idx, 1);

    if (_activePath === path) {
      // 激活相邻 tab
      const next = _tabs[Math.min(idx, _tabs.length - 1)];
      if (next) _activateTabInternal(next);
      else _activePath = null;
    }

    _renderTabBar();
  }

  function activateTab(path) {
    const tab = _tabs.find(t => t.path === path);
    if (!tab || _activePath === path) return;
    _activateTabInternal(tab);
    _renderTabBar();
  }

  function _activateTabInternal(tab) {
    // 隐藏所有
    _tabs.forEach(t => {
      t.container.style.display = "none";
    });
    // 显示目标
    tab.container.style.display = "";
    _activePath = tab.path;
    tab.editor.refresh();
    tab.editor.focus();

    // 更新标题
    if ($info()) $info().textContent = tab.title;

    // 回调通知外部
    if (_onActivate) _onActivate(tab.path, tab.title);
  }

  function _destroyTab(tab) {
    // 清理 CodeMirror 实例
    try {
      const el = tab.editor.getWrapperElement();
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (_) {}
    // 移除容器
    if (tab.container && tab.container.parentNode) {
      tab.container.parentNode.removeChild(tab.container);
    }
  }

  function getActiveEditor() {
    const tab = _tabs.find(t => t.path === _activePath);
    return tab ? tab.editor : null;
  }

  function getActivePath() { return _activePath; }
  function getActiveTab()  { return _tabs.find(t => t.path === _activePath) || null; }

  function getTabContent(path) {
    const tab = _tabs.find(t => t.path === path);
    return tab ? tab.editor.getValue() : null;
  }

  function getAllTabs() { return _tabs.map(t => ({ path: t.path, title: t.title, dirty: t.dirty })); }

  // ── Tab 栏渲染 ──
  function _renderTabBar() {
    const list = $tabList();
    if (!list) return;

    let html = "";
    for (const t of _tabs) {
      const active = t.path === _activePath ? " active" : "";
      const dirty = t.dirty ? " dirty" : "";
      html += `<span class="tab-item${active}${dirty}" data-path="${escHtml(t.path)}" title="${escHtml(t.title)}">`;
      html += `<span class="tab-title">${escHtml(t.title)}</span>`;
      html += `<span class="tab-close" data-close="${escHtml(t.path)}">✕</span>`;
      html += `</span>`;
    }
    list.innerHTML = html;

    // 绑定事件
    list.querySelectorAll(".tab-item").forEach(el => {
      el.addEventListener("click", (e) => {
        // 如果点的是关闭按钮
        if (e.target.classList.contains("tab-close")) {
          e.stopPropagation();
          const p = e.target.getAttribute("data-close");
          if (p) closeTab(p);
          return;
        }
        const p = el.getAttribute("data-path");
        if (p) activateTab(p);
      });
    });
  }

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── 激活回调 ──
  function onActivate(fn) { _onActivate = fn; }

  return {
    enable, disable, isEnabled,
    openTab, closeTab, activateTab,
    getActiveEditor, getActivePath, getActiveTab,
    getTabContent, getAllTabs,
    onActivate,
  };
})();
