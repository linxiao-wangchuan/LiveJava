/**
 * Java 本地运行服务器 — 前端主入口
 * ==================================
 * 职责: 初始化所有模块，绑定 UI 事件，编排运行流程。
 */

// ── 示例代码 ──
const EXAMPLE_NO_INTERACT = `int count = 1;
int flag = 200;
int i = 0;
do {
    if (count % 5 == 0 && count % 3 != 0) {
        i++;
        System.out.print(count + ", ");
    }
    count++;
} while (count <= flag);
System.out.print("\\n符合要求的数据的个数：" + i);`;

const EXAMPLE_INTERACT = `import java.util.Scanner;

public class Test01 {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        boolean flag = true;
        do {
            System.out.print("闪电五连鞭！\\n还钱吗？(输入「还钱」结束): ");
            String answer = scanner.next();
            if (answer.equals("还钱")) {
                flag = false;
            }
        } while (flag);
        System.out.print("知道还钱还差不多。");
        scanner.close();
    }
}`;

// ── DOM 引用 ──
const $ = (sel) => document.querySelector(sel);

// ── 状态 ──
let isRunning = false;

// ── 初始化 ──
document.addEventListener("DOMContentLoaded", () => {
  // 1. 加载主题
  ThemeManager.init();

  // 2. 初始化编辑器
  const savedCode = (() => {
    try { return localStorage.getItem("java_runner_code") || EXAMPLE_NO_INTERACT; }
    catch (_) { return EXAMPLE_NO_INTERACT; }
  })();
  Editor.init("#code_editor", savedCode);

  // 3. 初始化控制台
  Console.init("#console_output", "#console_input");

  // 4. 初始化 Socket.IO
  SocketManager.connect();
  SocketManager.onOutput((data) => {
    Console.append(data.type, data.text);
  });
  SocketManager.onRunComplete(() => {
    setRunningState(false);
  });

  // 5. 更新文件标题
  Editor.onChange(() => {
    const code = Editor.getValue();
    const m = code.match(/(?:public\s+)?class\s+(\w+)/);
    const info = $("#editor_info");
    if (info) info.textContent = (m ? m[1] : "Main") + ".java";
  });

  // 6. 初始标题
  (() => {
    const code = Editor.getValue();
    const m = code.match(/(?:public\s+)?class\s+(\w+)/);
    const info = $("#editor_info");
    if (info) info.textContent = (m ? m[1] : "Main") + ".java";
  })();

  // 7. 绑定事件
  bindEvents();

  // 8. 初始化侧栏自动包装开关
  initWrapSwitches();

  // 8. 获取 Java 版本
  fetchJavaVersion();

  // 9. 初始化侧栏和模式
  initSidebar();
  initModeSwitch();
  initMoveMode();

  // 10. Tab 激活回调 → 同步 _selectedEntryPath
  TabManager.onActivate((path) => {
    _selectedEntryPath = path;
    const lastSlash = path.lastIndexOf("/");
    _selectedDirPath = lastSlash >= 0 ? path.substring(0, lastSlash) : "";
  });

  // 10. 初始化设置面板
  Settings.initPanel();

  // 11. 清空控制台提示
  Console.clear();

  // 12. 聚焦编辑器
  Editor.focus();
  Editor.setCursor(Editor.getLineCount());
});

// ── 事件绑定 ──
function bindEvents() {
  // 运行
  $("#btn_run").addEventListener("click", runCode);
  // 停止
  $("#btn_stop").addEventListener("click", stopCode);
  // 清空控制台
  $("#btn_clear").addEventListener("click", () => Console.clear());

  // 控制台输入
  Console.onInputKeydown((e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendInput();
    }
  });

  // 导入包自动保存
  const importsEl = $("#imports_editor");
  if (importsEl) {
    importsEl.addEventListener("input", () => {
      try { localStorage.setItem("java_runner_imports", importsEl.value); } catch (_) {}
    });
  }

  // 示例按钮
  $("#btn_example1").addEventListener("click", () => {
    Editor.setValue(EXAMPLE_NO_INTERACT);
    Console.clear();
    Console.append("system", "[就绪] 已加载「循环输出」示例。\n");
  });
  $("#btn_example2").addEventListener("click", () => {
    Editor.setValue(EXAMPLE_INTERACT);
    Console.clear();
    Console.append("system", "[就绪] 已加载「交互输入」示例。\n");
  });

  // 主题切换按钮
  const themeBtn = $("#btn_theme");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      ThemeManager.toggle();
    });
  }

  // Tab 栏折叠按钮
  const btnToggleTabs = $("#btn_toggle_tabs");
  const tabBar = $("#tab_bar");
  if (btnToggleTabs && tabBar) {
    btnToggleTabs.addEventListener("click", () => {
      const collapsed = tabBar.style.display === "none";
      if (collapsed) {
        tabBar.style.display = "flex";
        btnToggleTabs.textContent = "▲";
      } else {
        tabBar.style.display = "none";
        btnToggleTabs.textContent = "▼";
      }
      try { localStorage.setItem("java_runner_tabs_collapsed", collapsed ? "0" : "1"); } catch (_) {}
    });
    // 恢复状态
    try {
      if (localStorage.getItem("java_runner_tabs_collapsed") === "1") {
        tabBar.style.display = "none";
        btnToggleTabs.textContent = "▼";
      }
    } catch (_) {}
  }

  // README / 帮助按钮
  const aboutBtn = $("#btn_about");
  const aboutModal = $("#about_modal");
  if (aboutBtn && aboutModal) {
    aboutBtn.addEventListener("click", () => { aboutModal.style.display = "flex"; });
    const closeAbout = () => { aboutModal.style.display = "none"; };
    $("#btn_close_about")?.addEventListener("click", closeAbout);
    $("#btn_ok_about")?.addEventListener("click", closeAbout);
    aboutModal.addEventListener("click", (e) => { if (e.target === aboutModal) closeAbout(); });
  }

  // 全局快捷键
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); runCode(); }
    if (e.ctrlKey && e.key === "c" && isRunning) { e.preventDefault(); stopCode(); }
    if (e.ctrlKey && e.key === "s") { e.preventDefault(); _manualSave(); }
    if (e.ctrlKey && e.key === "l") { e.preventDefault(); Console.clear(); }

    // Ctrl+B → 折叠/展开侧栏
    if (e.ctrlKey && e.key === "b") {
      e.preventDefault();
      const sidebar = $("#sidebar");
      const btn = $("#btn_toggle_sidebar");
      if (sidebar) {
        const collapsed = sidebar.classList.contains("collapsed");
        if (collapsed) sidebar.classList.remove("collapsed");
        else sidebar.classList.add("collapsed");
        _sidebarVisible = !collapsed;
        try { localStorage.setItem("java_runner_sidebar", _sidebarVisible ? "1" : "0"); } catch (_) {}
      }
      return;
    }

    // Ctrl+Alt+← → 上一个 Tab / Ctrl+Alt+→ → 下一个 Tab
    if (!e.ctrlKey && !e.shiftKey && e.altKey && e.key === "ArrowRight" && TabManager.isEnabled()) {
      e.preventDefault();
      const tabs = TabManager.getAllTabs();
      if (tabs.length > 1) {
        const current = TabManager.getActivePath();
        const idx = tabs.findIndex(t => t.path === current);
        TabManager.activateTab(tabs[(idx + 1) % tabs.length].path);
      }
      return;
    }
    if (!e.ctrlKey && !e.shiftKey && e.altKey && e.key === "ArrowLeft" && TabManager.isEnabled()) {
      e.preventDefault();
      const tabs = TabManager.getAllTabs();
      if (tabs.length > 1) {
        const current = TabManager.getActivePath();
        const idx = tabs.findIndex(t => t.path === current);
        TabManager.activateTab(tabs[(idx - 1 + tabs.length) % tabs.length].path);
      }
      return;
    }

    // Alt+W → 关闭当前 Tab
    if (e.altKey && e.key === "w" && !e.ctrlKey && TabManager.isEnabled()) {
      const tabs = TabManager.getAllTabs();
      if (tabs.length > 1) {
        e.preventDefault();
        TabManager.closeTab(TabManager.getActivePath());
      }
      return;
    }

    if (e.key === "Escape") {
      // 关闭弹窗（优先级最高）
      const settingsModal = document.querySelector("#settings_modal");
      const aboutModal = document.querySelector("#about_modal");
      const moveModal = document.querySelector("#move_modal");
      if (settingsModal && settingsModal.style.display === "flex") {
        settingsModal.style.display = "none"; return;
      }
      if (aboutModal && aboutModal.style.display === "flex") {
        aboutModal.style.display = "none"; return;
      }
      if (moveModal && moveModal.style.display === "flex") {
        moveModal.style.display = "none"; _cancelMoveMode(); return;
      }
      if (_pendingAction === "move_file" || _pendingAction === "rename") {
        const label = _pendingAction === "rename" ? "重命名" : "移动";
        _cancelMoveMode();
        // 也关闭内联输入条
        const bar = document.querySelector("#inline_input");
        if (bar) bar.style.display = "none";
        Console.append("system", `[${label}] 已取消\n`);
        return;
      }
      Editor.focus();
    }
  });
}

// ── 运行 / 停止 ──
function runCode() {
  if (isRunning) return;
  const code = Editor.getValue().trim();
  if (!code) {
    Console.append("system", "[提示] 请先输入 Java 代码。\n");
    return;
  }

  // 多文件/项目模式：先保存编辑器内容到磁盘，再运行
  if ((_currentMode === "temp_multi" || _currentMode === "project") && _selectedEntryPath) {
    const api = _currentMode === "project" ? "/api/project/write" : "/api/temp-workspace/write";
    fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: _selectedEntryPath, content: code }),
    }).then(() => _doRun(code));
    return;
  }

  _doRun(code);
}

function _doRun(code) {
  Console.clear();
  setRunningState(true);
  SocketManager.emit("run_code", {
    code,
    mode: _currentMode,
    use_framework: _getWrapEnabled(),
    imports: $("#imports_editor")?.value ?? "",
    entry_path: _selectedEntryPath || "",
  });
}

function stopCode() {
  SocketManager.emit("stop_code");
}

function sendInput() {
  const text = Console.getInput();
  if (!text) return;
  SocketManager.emit("send_input", { text });
  Console.clearInput();
}

// ── 运行状态 ──
function setRunningState(running) {
  isRunning = running;
  const btnRun  = $("#btn_run");
  const btnStop = $("#btn_stop");
  if (btnRun)  btnRun.disabled  = running;
  if (btnStop) btnStop.disabled = !running;
  Console.setInputEnabled(running);

  const status = $("#status_indicator");
  if (status) {
    status.className = "status " + (running ? "running" : "ready");
    status.textContent = running ? "● 运行中" : "● 就绪";
  }
  if (running) Console.focusInput();
  else Editor.focus();
}

// ── 框架开关 ──
// ── 侧栏折叠 / 展开 ──
let _sidebarVisible = false;

function initSidebar() {
  const sidebar = $("#sidebar");
  if (!sidebar) return;

  // 恢复状态
  try {
    _sidebarVisible = localStorage.getItem("java_runner_sidebar") === "1";
  } catch (_) {}
  if (!_sidebarVisible) sidebar.classList.add("collapsed");

  function toggle() {
    _sidebarVisible = !_sidebarVisible;
    if (_sidebarVisible) sidebar.classList.remove("collapsed");
    else sidebar.classList.add("collapsed");
    try { localStorage.setItem("java_runner_sidebar", _sidebarVisible ? "1" : "0"); } catch (_) {}
  }

  $("#btn_toggle_sidebar").addEventListener("click", toggle);
  const topBtn = $("#btn_toggle_sidebar_top");
  if (topBtn) topBtn.addEventListener("click", toggle);
  // 折叠后的窄条点击展开
  const strip = $("#sidebar_collapsed_strip");
  if (strip) strip.addEventListener("click", toggle);
}

// ── 模式切换 ──
let _currentMode = "temp_single";
let _selectedEntryPath = "";
let _selectedDirPath = "";
let _expandToPath = "";   // 新建文件后自动展开到此路径
let _moveMode = "popup";  // 移动模式: "popup"（弹窗选择）| "quick"（点击侧栏目录）

// ── 文件夹展开状态持久化 ──
function _getExpandedFolders() {
  try { return new Set(JSON.parse(localStorage.getItem("java_runner_expanded") || "[]")); }
  catch (_) { return new Set(); }
}
function _saveExpandedFolders(set) {
  try { localStorage.setItem("java_runner_expanded", JSON.stringify([...set])); }
  catch (_) {}
}
function _toggleExpandedFolder(path) {
  const s = _getExpandedFolders();
  if (s.has(path)) s.delete(path); else s.add(path);
  _saveExpandedFolders(s);
}

// ── Tab 列表持久化 ──
function _saveOpenTabs() {
  if (!TabManager.isEnabled()) return;
  const tabs = TabManager.getAllTabs();
  const active = TabManager.getActivePath();
  try { localStorage.setItem("java_runner_open_tabs", JSON.stringify({ tabs, active })); }
  catch (_) {}
}
function _restoreOpenTabs() {
  try {
    const raw = localStorage.getItem("java_runner_open_tabs");
    if (!raw) return false;
    const data = JSON.parse(raw);
    const tabs = data.tabs || data;  // 兼容旧格式（纯数组）
    if (!tabs || !tabs.length) return false;
    const activePath = data.active || (tabs.length ? tabs[tabs.length - 1].path : null);
    const mode = _currentMode;
    const api = mode === "project" ? "/api/project/read" : "/api/temp-workspace/read";
    // 先全部打开，再激活最后一个（最后打开的 tab 会是 active）
    // 按顺序加载：先加载非 active 的，最后加载 active 的（因为 openTab 会自动激活最后打开的）
    const orderedTabs = tabs.filter(t => t.path !== activePath).concat(tabs.filter(t => t.path === activePath));
    Promise.all(orderedTabs.map(t =>
      fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: t.path }),
      }).then(r => r.json()).then(d => ({ path: t.path, title: t.title, content: d.content || "" }))
    )).then(results => {
      results.forEach(r => {
        if (r.content !== undefined) {
          TabManager.openTab(r.path, r.title, r.content);
        }
      });
      // 确保激活正确的 tab
      if (activePath) {
        setTimeout(() => TabManager.activateTab(activePath), 100);
      }
    });
    return true;
  } catch (_) { return false; }
}

// 页面关闭前保存 Tab 列表和展开状态
window.addEventListener("beforeunload", () => {
  _saveOpenTabs();
});

function initModeSwitch() {
  const radios = document.querySelectorAll('input[name="work_mode"]');
  if (!radios.length) return;

  // 恢复上次模式
  try {
    const saved = localStorage.getItem("java_runner_mode");
    if (saved) {
      _currentMode = saved;
      const r = document.querySelector(`input[value="${saved}"]`);
      if (r) r.checked = true;
    }
  } catch (_) {}

  function applyMode(mode) {
    const prevMode = _currentMode;

    // ── 离开旧模式时保存状态 ──
    if (prevMode === "temp_single" && mode !== "temp_single") {
      try { localStorage.setItem("java_runner_single_code", Editor.getValue()); } catch (_) {}
    }
    if ((prevMode === "temp_multi" || prevMode === "project") && mode !== prevMode) {
      _autoSaveCurrentFile();
      _saveOpenTabs();  // 持久化所有打开的 Tab
    }

    _currentMode = mode;
    try { localStorage.setItem("java_runner_mode", mode); } catch (_) {}
    _updateMoveModeVisibility();

    const sidebar     = $("#sidebar");
    const projActions = $("#project_actions");
    const treeActions = $("#tree_actions");
    const fileTree    = $("#file_tree");

    switch (mode) {
      case "temp_single":
        Editor.useSingleMode();
        TabManager.disable();
        _setTabToggleVisible(false);
        if (sidebar) { sidebar.classList.add("collapsed"); _sidebarVisible = false; }
        if (projActions) projActions.style.display = "none";
        if (treeActions) treeActions.style.display = "none";
        if (fileTree) fileTree.innerHTML = '<div class="tree-empty">单文件模式无需文件树</div>';
        // 恢复单文件模式自己的代码（独立，不受多文件模式影响）
        _restoreSingleCode();
        break;

      case "temp_multi":
        Editor.useTabMode();
        TabManager.enable();
        _setTabToggleVisible(true);
        if (sidebar) { sidebar.classList.remove("collapsed"); _sidebarVisible = true; }
        if (projActions) projActions.style.display = "none";
        if (treeActions) treeActions.style.display = "flex";
        refreshTempFileTree();
        bindFileActions("temp");
        _restoreOpenTabs();
        break;

      case "project":
        Editor.useTabMode();
        TabManager.enable();
        _setTabToggleVisible(true);
        if (sidebar) { sidebar.classList.remove("collapsed"); _sidebarVisible = true; }
        if (projActions) projActions.style.display = "block";
        if (treeActions) treeActions.style.display = "flex";
        refreshProjectTree();
        bindFileActions("project");
        _restoreOpenTabs();
        break;
    }
  }

  radios.forEach(r => {
    r.addEventListener("change", () => { if (r.checked) applyMode(r.value); });
  });

  applyMode(_currentMode);

  // 绑定打开项目：使用内联输入
  const openFolderBtn = $("#btn_open_folder");
  if (openFolderBtn) {
    openFolderBtn.addEventListener("click", () => {
      const prefix = document.querySelector("#inline_prefix");
      const bar = document.querySelector("#inline_input");
      const field = document.querySelector("#inline_input_field");
      if (prefix) prefix.textContent = "项目路径: ";
      if (field) field.placeholder = "如 E:\\project\\my-app";
      if (bar) bar.style.display = "flex";
      if (field) { field.value = ""; field.focus(); }
      _pendingAction = "open_project";
    });
  }
}

// ── 手动保存（Ctrl+S） ──
async function _manualSave() {
  const mode = _currentMode;
  if (mode !== "temp_multi" && mode !== "project") {
    Console.append("system", "[保存] 单文件模式无需手动保存（内容自动暂存）\n");
    return;
  }
  if (!_selectedEntryPath) {
    Console.append("system", "[保存] 未选中文件，无法保存\n");
    return;
  }
  const code = Editor.getValue();
  const api = mode === "project" ? "/api/project/write" : "/api/temp-workspace/write";
  try {
    await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: _selectedEntryPath, content: code }),
    });
    Console.append("system", `[保存] "${_selectedEntryPath}" 已保存 ✓\n`);
  } catch (_) {
    Console.append("system", "[保存] 保存失败，请重试\n");
  }
}

function _restoreSingleCode() {
  try {
    const code = localStorage.getItem("java_runner_single_code");
    if (code) Editor.setValue(code);
  } catch (_) {}
}

// ── 自动包装开关（三个独立） ──
function _getWrapEnabled() {
  switch (_currentMode) {
    case "temp_single": return document.querySelector("#wrap_single")?.checked ?? true;
    case "temp_multi":  return document.querySelector("#wrap_multi")?.checked ?? true;
    case "project":     return document.querySelector("#wrap_project")?.checked ?? true;
    default: return true;
  }
}

function initWrapSwitches() {
  ["single", "multi", "project"].forEach(k => {
    const el = document.querySelector(`#wrap_${k}`);
    if (!el) return;
    // 从 localStorage 恢复
    try {
      const saved = localStorage.getItem(`java_runner_wrap_${k}`);
      if (saved === "0") el.checked = false;
    } catch (_) {}
    // 变化时持久化
    el.addEventListener("change", () => {
      try { localStorage.setItem(`java_runner_wrap_${k}`, el.checked ? "1" : "0"); } catch (_) {}
    });
  });
}

function _restoreLastFile(mode) {
  const lastFile = localStorage.getItem("java_runner_last_file") || "";
  if (lastFile) {
    setTimeout(() => loadFileToEditor(lastFile), 300);
  }
}

function refreshTempFileTree() {
  fetch("/api/temp-workspace/tree")
    .then(r => r.json())
    .then(data => {
      const fileTree = $("#file_tree");
      if (fileTree) fileTree.innerHTML = buildTreeHTML(data);
      bindTreeClicks();
      _scrollToExpandTarget();
    })
    .catch(() => {
      const fileTree = $("#file_tree");
      if (fileTree) fileTree.innerHTML = '<div class="tree-empty">未能加载文件树</div>';
    });
}

function refreshProjectTree() {
  fetch("/api/project/tree")
    .then(r => r.json())
    .then(data => {
      const fileTree = $("#file_tree");
      const projPath = $("#project_path");
      if (data.root && projPath) projPath.textContent = data.root;
      if (fileTree) fileTree.innerHTML = data.tree
        ? buildTreeHTML(data.tree)
        : '<div class="tree-empty">请先打开项目文件夹</div>';
      bindTreeClicks();
      _scrollToExpandTarget();
    })
    .catch(() => {
      const fileTree = $("#file_tree");
      if (fileTree) fileTree.innerHTML = '<div class="tree-empty">请先打开项目文件夹</div>';
    });
}

// ── 移动模式初始化 ──
function initMoveMode() {
  // 从 localStorage 恢复
  try {
    const saved = localStorage.getItem("java_runner_move_mode");
    if (saved === "quick" || saved === "popup") _moveMode = saved;
  } catch (_) {}
  // 同步 radio
  const radio = document.querySelector(`input[name="move_mode"][value="${_moveMode}"]`);
  if (radio) radio.checked = true;
  // 显示/隐藏切换器
  _updateMoveModeVisibility();
  // 监听变化
  document.querySelectorAll('input[name="move_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      if (r.checked) {
        _moveMode = r.value;
        try { localStorage.setItem("java_runner_move_mode", _moveMode); } catch (_) {}
      }
    });
  });
}

function _setTabToggleVisible(visible) {
  const btn = document.querySelector("#btn_toggle_tabs");
  if (btn) btn.style.display = visible ? "" : "none";
  if (visible) {
    // 恢复用户折叠偏好
    try {
      const bar = document.querySelector("#tab_bar");
      if (bar && localStorage.getItem("java_runner_tabs_collapsed") === "1") {
        bar.style.display = "none";
        btn.textContent = "▼";
      }
    } catch (_) {}
  }
}

function _updateMoveModeVisibility() {
  const sel = document.querySelector("#move_mode_selector");
  if (!sel) return;
  sel.style.display = (_currentMode === "temp_multi" || _currentMode === "project") ? "" : "none";
}

// ── 快速移动模式（点击侧栏目录） ──
// ── 重命名 ──
function _startRename(path) {
  _pendingAction = "rename";
  _pendingMoveOldPath = path;
  const bar = document.querySelector("#inline_input");
  const field = document.querySelector("#inline_input_field");
  const prefix = document.querySelector("#inline_prefix");
  if (prefix) prefix.textContent = "重命名: ";
  if (field) {
    field.value = path.split("/").pop();
    field.placeholder = "输入新名称";
  }
  if (bar) bar.style.display = "flex";
  if (field) setTimeout(() => { field.focus(); field.select(); }, 50);
  Console.append("system", `[重命名] 正在重命名 "${path}" → 输入新名称后回车\n`);
}

function _startQuickMove(path) {
  _pendingAction = "move_file";
  _pendingMoveOldPath = path;
  Console.append("system", `[移动] 右键 "${path}" → 点击左侧目录树中的目标文件夹，或按 Esc 取消\n`);
  document.querySelectorAll("#file_tree .tree-folder").forEach(f => {
    f.classList.add("move-target");
  });
}

// ── 弹窗移动模式 ──
function _showMoveModal(path) {
  _pendingMoveOldPath = path;
  const modal = document.querySelector("#move_modal");
  const info = document.querySelector("#move_file_info");
  const tree = document.querySelector("#move_tree");
  const status = document.querySelector("#move_status");
  if (!modal || !tree) return;
  if (info) info.textContent = `源文件: ${path}`;
  if (status) status.textContent = "";
  // 获取完整文件树并渲染（只显示目录）
  const mode = _currentMode;
  const api = mode === "project" ? "/api/project/tree" : "/api/temp-workspace/tree";
  fetch(api).then(r => r.json()).then(data => {
    const treeData = mode === "project" ? data.tree : data;
    if (treeData) {
      tree.innerHTML = _buildFolderTree(treeData, path);
      _bindMoveTreeClicks();
    }
  });
  modal.style.display = "flex";
  // 关闭按钮
  const closeBtn = document.querySelector("#btn_close_move");
  const cancelBtn = document.querySelector("#btn_cancel_move");
  const closeHandler = () => { modal.style.display = "none"; _cancelMoveMode(); };
  if (closeBtn) { closeBtn.onclick = closeHandler; }
  if (cancelBtn) { cancelBtn.onclick = closeHandler; }
  // 点击遮罩关闭
  modal.onclick = (e) => { if (e.target === modal) closeHandler(); };
  // Esc 关闭
  const escHandler = (e) => {
    if (e.key === "Escape") { closeHandler(); document.removeEventListener("keydown", escHandler); }
  };
  document.addEventListener("keydown", escHandler);
}

// 构建只显示目录的树（排除当前文件所在目录 + 排除文件）
function _buildFolderTree(items, skipPath, _depth) {
  if (!items || !items.length) return '<div class="tree-empty">(无可用目录)</div>';
  if (_depth === undefined) _depth = 0;
  // 获取源文件所在目录
  const skipDir = skipPath ? skipPath.substring(0, skipPath.lastIndexOf("/")) : "";
  let html = '<ul class="tree-list">';
  for (const item of items) {
    if (item.type !== "dir") continue;  // 只显示目录
    const isSkipDir = item.path === skipDir;
    const hasKids = item.children && item.children.some(c => c.type === "dir");
    html += '<li class="tree-item">';
    html += `<span class="tree-folder has-kids move-dest-folder" data-path="${escHtml(item.path)}" data-skip="${isSkipDir ? '1' : '0'}">`;
    html += '<span class="tree-arrow">▼</span> ';
    html += `${escHtml(item.name)}</span>`;
    if (hasKids || (item.children && item.children.length > 0)) {
      html += `<div class="tree-children">`;
      html += _buildFolderTree(item.children, skipPath, _depth + 1);
      html += '</div>';
    }
    html += '</li>';
  }
  html += '</ul>';
  return html;
}

function _bindMoveTreeClicks() {
  document.querySelectorAll("#move_tree .move-dest-folder").forEach(el => {
    el.addEventListener("click", (e) => {
      // 箭头 → 折叠/展开
      if (e.target.classList.contains("tree-arrow")) {
        const children = el.nextElementSibling;
        if (children && children.classList.contains("tree-children")) {
          const isCollapsed = children.classList.contains("collapsed");
          if (isCollapsed) {
            children.classList.remove("collapsed");
            e.target.textContent = "▼";
          } else {
            children.classList.add("collapsed");
            e.target.textContent = "▶";
          }
        }
        return;
      }
      // 点击文件夹名 → 选为目标
      const destDir = el.dataset.path;
      const skip = el.dataset.skip === "1";
      if (skip || !destDir) return;

      const oldPath = _pendingMoveOldPath;
      const filename = oldPath.split("/").pop();
      const newPath = destDir + "/" + filename;
      _doMoveFile(oldPath, newPath);
      // 关闭弹窗
      const modal = document.querySelector("#move_modal");
      if (modal) modal.style.display = "none";
    });
  });
}

function _doMoveFile(oldPath, newPath) {
  if (!oldPath || !newPath || oldPath === newPath) {
    _cancelMoveMode();
    return;
  }
  const api = _pendingMode === "project" ? "/api/project/move" : "/api/temp-workspace/move";
  fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  }).then(r => r.json()).then(data => {
    if (data.ok) {
      // Tab 同步
      if (TabManager.isEnabled()) {
        const content = TabManager.getTabContent(oldPath);
        if (content !== null) {
          TabManager.closeTab(oldPath);
          TabManager.openTab(newPath, newPath.split("/").pop(), content);
        }
      }
      if (_pendingMode === "project") refreshProjectTree();
      else refreshTempFileTree();
      _expandToPath = newPath;
      Console.append("system", `[移动] "${oldPath}" → "${newPath}"  ✓\n`);
    } else {
      Console.append("system", `[错误] 移动失败: ${data.error || "未知"}\n`);
    }
  }).catch(() => Console.append("system", "[错误] 移动请求失败\n"));
  _cancelMoveMode();
}

function _cancelMoveMode() {
  _pendingAction = null;
  _pendingMoveOldPath = "";
  document.querySelectorAll("#file_tree .tree-folder.move-target").forEach(f => {
    f.classList.remove("move-target");
  });
}

function _scrollToExpandTarget() {
  if (!_expandToPath) return;
  // 找到文件树中对应的元素并高亮 + 滚动到可见
  const el = document.querySelector(`#file_tree .tree-file[data-path="${escHtml(_expandToPath)}"]`);
  if (el) {
    // 清除所有高亮
    document.querySelectorAll("#file_tree .tree-file, #file_tree .tree-folder")
      .forEach(e => e.classList.remove("active"));
    el.classList.add("active");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  _expandToPath = "";  // 只展开一次
}

function openProjectDir(dir) {
  fetch("/api/project/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dir }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        refreshProjectTree();
      } else {
        alert(data.error || "无法打开项目目录");
      }
    })
    .catch(() => alert("请求失败"));
}

function buildTreeHTML(items, _depth, _expandTo) {
  if (!items || !items.length) return '<div class="tree-empty">(空)</div>';
  if (_depth === undefined) _depth = 0;
  if (_expandTo === undefined) _expandTo = _expandToPath;
  const expandedFolders = _getExpandedFolders();
  let html = '<ul class="tree-list">';
  for (const item of items) {
    html += '<li class="tree-item">';
    if (item.type === "dir") {
      const hasKids = item.children && item.children.length > 0;
      // 持久化的展开状态 > 展开目标祖先 > 顶层默认展开 > 深层默认折叠
      const isAncestor = _expandTo && item.path && _expandTo.startsWith(item.path + "/");
      const userExpanded = expandedFolders.has(item.path);
      const shouldCollapse = (_depth >= 1 && !isAncestor && !userExpanded);
      const collapsed = shouldCollapse ? " collapsed" : "";
      html += `<span class="tree-folder ${hasKids ? "has-kids" : ""}${collapsed}" data-path="${escHtml(item.path)}">`;
      html += `<span class="tree-arrow">${collapsed ? "▶" : "▼"}</span> `;
      html += `${escHtml(item.name)}</span>`;
      if (hasKids) {
        html += `<div class="tree-children${collapsed}">`;
        html += buildTreeHTML(item.children, _depth + 1, _expandTo);
        html += '</div>';
      }
    } else {
      html += `<span class="tree-file" data-path="${escHtml(item.path)}">📄 ${escHtml(item.name)}</span>`;
    }
    html += '</li>';
  }
  html += '</ul>';
  return html;
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let _pendingAction = null;     // "file" | "dir" | "open_project" | "move_file"
let _pendingMoveOldPath = "";  // 移动操作的源路径
let _pendingMode = null;    // "temp" | "project"
let _fileActionsBound = false;

function bindFileActions(mode) {
  _pendingMode = mode;
  if (_fileActionsBound) return;  // 只绑一次，模式切换不重复绑
  _fileActionsBound = true;

  const $ = (s) => document.querySelector(s);

  const btnNewFile = $("#btn_new_file");
  const btnNewDir  = $("#btn_new_dir");
  const inlineBar  = $("#inline_input");
  const inlineField = $("#inline_input_field");
  const inlinePrefix = $("#inline_prefix");
  const btnOk = $("#inline_input_ok");
  const btnCancel = $("#inline_input_cancel");

  function showInline(type) {
    _pendingAction = type;
    const prefix = _selectedDirPath ? _selectedDirPath + "/" : "";
    if (inlinePrefix) inlinePrefix.textContent = prefix || "(根目录) ";
    if (inlineBar) inlineBar.style.display = "flex";
    if (inlineField) {
      inlineField.value = "";
      inlineField.placeholder = type === "file" ? "文件名，如 Dog.java" : "目录名，如 com/example";
      setTimeout(() => inlineField.focus(), 50);
    }
  }

  function hideInline() {
    _pendingAction = null;
    _pendingMoveOldPath = "";
    if (inlineBar) inlineBar.style.display = "none";
    if (inlineField) inlineField.value = "";
  }

  function submitInline() {
    if (!_pendingAction) return;
    const field = $("#inline_input_field");
    if (!field) return;
    const name = field.value.trim();
    if (!name) return;

    if (_pendingAction === "file") {
      const api = _pendingMode === "project" ? "/api/project/create-file" : "/api/temp-workspace/create-file";
      let path = name.includes(".") ? name : name + ".java";
      if (_selectedDirPath && !path.includes("/")) {
        path = _selectedDirPath + "/" + path;
      }
      // 自动包装关闭时用模板，开启时只放注释
      const useTemplate = !_getWrapEnabled();
      // 记录目标路径，刷新后自动展开到该文件
      _expandToPath = path;
      fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, template: useTemplate }),
      }).then(r => r.json()).then(() => {
        if (_pendingMode === "project") refreshProjectTree();
        else refreshTempFileTree();
      });
    } else if (_pendingAction === "dir") {
      const api = _pendingMode === "project" ? "/api/project/create-dir" : "/api/temp-workspace/create-dir";
      let dirPath = _selectedDirPath ? _selectedDirPath + "/" + name : name;
      fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      }).then(r => r.json()).then(() => {
        if (_pendingMode === "project") refreshProjectTree();
        else refreshTempFileTree();
      });
    } else if (_pendingAction === "rename") {
      const oldPath = _pendingMoveOldPath;
      const newName = name;
      if (oldPath && newName) {
        const dir = oldPath.substring(0, oldPath.lastIndexOf("/"));
        const newPath = dir ? dir + "/" + newName : newName;
        _doMoveFile(oldPath, newPath);
      }
    } else if (_pendingAction === "open_project") {
      openProjectDir(name);
    }
    hideInline();
  }

  if (btnNewFile) btnNewFile.addEventListener("click", () => showInline("file"));
  if (btnNewDir)  btnNewDir.addEventListener("click", () => showInline("dir"));
  if (btnOk)      btnOk.addEventListener("click", submitInline);
  if (btnCancel)  btnCancel.addEventListener("click", hideInline);

  // 删除按钮
  const btnDel = document.querySelector("#btn_delete_item");
  if (btnDel) btnDel.addEventListener("click", () => deleteSelectedItem(mode));

  // 清空工作区
  const btnReset = document.querySelector("#btn_reset_workspace");
  if (btnReset) btnReset.addEventListener("click", () => {
    _showConfirm("确认清空整个工作区？所有文件将被删除。", () => {
      const api = mode === "project" ? null : "/api/temp-workspace/reset";
      if (!api) return;
      fetch(api, { method: "POST" })
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            _selectedDirPath = ""; _selectedEntryPath = "";
            refreshTempFileTree();
            Console.append("system", "[清空] 工作区已重置。\n");
          }
        })
        .catch(() => Console.append("system", "[错误] 清空失败，请重试。\n"));
    });
  });
  if (inlineField) {
    inlineField.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitInline();
      if (e.key === "Escape") hideInline();
    });
  }
}

// ── 弹窗替代：控制台通知 ──
function _notify(msg) {
  Console.append("system", "[提示] " + msg + "\n");
}

// ── 弹窗替代：内联确认条 ──
function _showConfirm(msg, onYes) {
  const bar = document.querySelector("#inline_confirm");
  const msgEl = document.querySelector("#inline_confirm_msg");
  const yesBtn = document.querySelector("#inline_confirm_yes");
  const noBtn = document.querySelector("#inline_confirm_no");
  if (!bar || !msgEl) return onYes(); // 回退

  msgEl.textContent = msg;
  bar.style.display = "flex";

  function cleanup() {
    bar.style.display = "none";
    yesBtn?.removeEventListener("click", handler);
    noBtn?.removeEventListener("click", cleanup);
  }

  function handler() { cleanup(); onYes(); }

  yesBtn?.addEventListener("click", handler);
  noBtn?.addEventListener("click", cleanup);
}

// ── 弹窗替代：原生目录选择器 ──
function _pickFolder(callback) {
  const input = document.querySelector("#native_folder_picker");
  if (!input) { _notify("目录选择器不可用，请手动输入路径"); return; }
  input.value = "";
  input.addEventListener("change", function handler() {
    input.removeEventListener("change", handler);
    const files = input.files;
    if (files && files.length > 0) {
      // webkitRelativePath 的第一段就是选中的目录名
      const fullPath = files[0].webkitRelativePath;
      const dirName = fullPath.split("/")[0];
      // 拿不到完整绝对路径，用相对路径提示用户
      _notify("已选择目录: " + dirName + "（请手动输入完整路径）");
      callback(dirName);
    }
  }, { once: true });
  input.click();
}

function deleteSelectedItem(mode) {
  const target = _selectedEntryPath || _selectedDirPath;
  if (!target) {
    Console.append("system", "[提示] 请先在文件树中点击选中一个文件或文件夹。\n");
    return;
  }
  const label = _selectedEntryPath || _selectedDirPath;
  _showConfirm(`确认删除 "${label}"？此操作不可恢复。`, () => {
    const api = mode === "project" ? "/api/project/delete" : "/api/temp-workspace/delete";
    fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target }),
    }).then(r => r.json()).then(() => {
      _selectedEntryPath = "";
      _selectedDirPath = "";
      if (mode === "project") refreshProjectTree();
      else refreshTempFileTree();
      Console.append("system", `[删除] "${label}" 已删除。\n`);
    });
  });
}

// 切换文件前自动保存当前编辑内容（返回 Promise 确保存完再加载）
function _autoSaveCurrentFile() {
  if (!_selectedEntryPath) return Promise.resolve();
  const mode = _currentMode;
  if (mode !== "temp_multi" && mode !== "project") return Promise.resolve();
  const code = Editor.getValue();
  const path = _selectedEntryPath;  // 快照，避免异步中被覆盖
  const api = mode === "project" ? "/api/project/write" : "/api/temp-workspace/write";
  return fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content: code }),
  }).catch(() => {});
}

function bindTreeClicks() {
  // 文件点击：①先等旧文件保存完成 → ②再加载新文件
  document.querySelectorAll("#file_tree .tree-file").forEach(el => {
    el.addEventListener("click", async () => {
      const path = el.dataset.path;
      if (!path) return;
      // ★ 等旧文件存完再切
      await _autoSaveCurrentFile();
      // 清除高亮 + 设置新选中
      document.querySelectorAll("#file_tree .tree-file, #file_tree .tree-folder")
        .forEach(e => e.classList.remove("active"));
      el.classList.add("active");
      _selectedEntryPath = path;
      const lastSlash = path.lastIndexOf("/");
      _selectedDirPath = lastSlash >= 0 ? path.substring(0, lastSlash) : "";
      Console.append("system", `[文件] 已选中 "${path}"，新建将创建在 "${_selectedDirPath || "(根目录)"}"\n`);
      loadFileToEditor(path);
    });
  });
  // 目录点击：有子目录时点箭头折叠/展开，点名称选中
  document.querySelectorAll("#file_tree .tree-folder").forEach(el => {
    el.addEventListener("click", (e) => {
      // 如果点的是箭头 → 折叠/展开
      if (e.target.classList.contains("tree-arrow")) {
        const folder = el;
        const arrow = e.target;
        const children = folder.nextElementSibling;
        if (children && children.classList.contains("tree-children")) {
          const isCollapsed = children.classList.contains("collapsed");
          const path = folder.dataset.path;
          if (isCollapsed) {
            children.classList.remove("collapsed");
            arrow.textContent = "▼";
            folder.classList.remove("collapsed");
          } else {
            children.classList.add("collapsed");
            arrow.textContent = "▶";
            folder.classList.add("collapsed");
          }
          // ★ 持久化展开/折叠状态
          if (path) _toggleExpandedFolder(path);
        }
        return;
      }
      // 点名称 → 选中目录（或移动文件到此处）
      if (_pendingAction === "move_file" && _pendingMoveOldPath) {
        // 移动模式：将文件移到点击的目录下
        const oldPath = _pendingMoveOldPath;
        const filename = oldPath.split("/").pop();
        const destDir = el.dataset.path || "";
        const newPath = destDir ? destDir + "/" + filename : filename;
        _doMoveFile(oldPath, newPath);
        return;
      }
      document.querySelectorAll("#file_tree .tree-file, #file_tree .tree-folder")
        .forEach(e => e.classList.remove("active"));
      el.classList.add("active");
      _selectedDirPath = el.dataset.path || "";
      Console.append("system", `[目录] 已选中 "${_selectedDirPath || "/"}"，新建将创建在此目录下\n`);
    });
  });
  // 右键菜单：设为运行入口 / 重命名 / 移动 / 删除
  document.querySelectorAll("#file_tree .tree-file").forEach(el => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const path = el.dataset.path;
      const isJava = path.endsWith(".java");
      _selectedEntryPath = path;
      _selectedDirPath = "";
      if (isJava) {
        document.querySelectorAll("#file_tree .tree-entry").forEach(t => t.classList.remove("tree-entry"));
        el.classList.add("tree-entry");
      }
      // ★ Shift+右键 = 重命名；普通右键 = 移动
      if (e.shiftKey) {
        _startRename(path);
        return;
      }
      Console.append("system", `[右键] "${path}" — Shift+右键=重命名 | 右键=移动 | 🗑=删除\n`);
      if (_moveMode === "quick") {
        _startQuickMove(path);
      } else {
        _showMoveModal(path);
      }
    });
  });
  // 文件夹右键：重命名 / 删除
  document.querySelectorAll("#file_tree .tree-folder").forEach(el => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const path = el.dataset.path || "";
      _selectedDirPath = path;
      _selectedEntryPath = "";
      if (e.shiftKey && path) {
        _startRename(path);
        return;
      }
      Console.append("system", `[右键] 目录 "${path || "/"}"\n   → Shift+右键=重命名 | 🗑=删除\n`);
    });
  });
}

function fetchJavaVersion() {
  fetch("/api/java-version")
    .then(r => r.json())
    .then(data => {
      const el = document.querySelector("#java_version");
      if (el && data.version) {
        el.textContent = data.version;
        el.title = data.version;
      }
    })
    .catch(() => {
      const el = document.querySelector("#java_version");
      if (el) el.textContent = "";
    });
}

function loadFileToEditor(path) {
  const mode = _currentMode;
  const api = mode === "project" ? "/api/project/read" : "/api/temp-workspace/read";
  fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.content !== undefined) {
        const filename = path.split("/").pop() || "Main.java";
        if (TabManager.isEnabled()) {
          // Tab 模式：打开为新 Tab
          TabManager.openTab(path, filename, data.content);
        } else {
          // 单文件模式：直接设置编辑器内容
          Editor.setValue(data.content);
          if (Editor.get()) Editor.get().clearHistory();
          setTimeout(() => { if (Editor.get()) Editor.get().refresh(); }, 50);
        }
        const info = $("#editor_info");
        if (info) info.textContent = filename;
      }
    });
}
