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

  // 8.5 获取 Java 版本
  fetchJavaVersion();

  // 9. 初始化侧栏和模式
  initSidebar();
  initModeSwitch();

  // 10. 初始化设置面板
  Settings.initPanel();

  // 11. 清空控制台提示
  Console.clear();

  // 11. 聚焦编辑器
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

  // 全局快捷键
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); runCode(); }
    if (e.ctrlKey && e.key === "c" && isRunning) { e.preventDefault(); stopCode(); }
    if (e.ctrlKey && e.key === "l") { e.preventDefault(); Console.clear(); }
    if (e.key === "Escape") Editor.focus();
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
}

// ── 模式切换 ──
let _currentMode = "temp_single";
let _selectedEntryPath = "";
let _selectedDirPath = "";

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
      if (_selectedEntryPath) {
        try { localStorage.setItem("java_runner_last_file", _selectedEntryPath); } catch (_) {}
      }
    }

    _currentMode = mode;
    try { localStorage.setItem("java_runner_mode", mode); } catch (_) {}

    const sidebar     = $("#sidebar");
    const projActions = $("#project_actions");
    const treeActions = $("#tree_actions");
    const fileTree    = $("#file_tree");

    switch (mode) {
      case "temp_single":
        if (sidebar) { sidebar.classList.add("collapsed"); _sidebarVisible = false; }
        if (projActions) projActions.style.display = "none";
        if (treeActions) treeActions.style.display = "none";
        if (fileTree) fileTree.innerHTML = '<div class="tree-empty">单文件模式无需文件树</div>';
        // 恢复单文件模式自己的代码（独立，不受多文件模式影响）
        _restoreSingleCode();
        break;

      case "temp_multi":
        if (sidebar) { sidebar.classList.remove("collapsed"); _sidebarVisible = true; }
        if (projActions) projActions.style.display = "none";
        if (treeActions) treeActions.style.display = "flex";
        refreshTempFileTree();
        bindFileActions("temp");
        _restoreLastFile("temp");
        break;

      case "project":
        if (sidebar) { sidebar.classList.remove("collapsed"); _sidebarVisible = true; }
        if (projActions) projActions.style.display = "block";
        if (treeActions) treeActions.style.display = "flex";
        refreshProjectTree();
        bindFileActions("project");
        _restoreLastFile("project");
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
  // 调用后端获取虚拟工作区文件树
  fetch("/api/temp-workspace/tree")
    .then(r => r.json())
    .then(data => {
      const fileTree = $("#file_tree");
      if (fileTree) fileTree.innerHTML = buildTreeHTML(data);
      bindTreeClicks();
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
    })
    .catch(() => {
      const fileTree = $("#file_tree");
      if (fileTree) fileTree.innerHTML = '<div class="tree-empty">请先打开项目文件夹</div>';
    });
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

function buildTreeHTML(items, _depth) {
  if (!items || !items.length) return '<div class="tree-empty">(空)</div>';
  if (_depth === undefined) _depth = 0;
  let html = '<ul class="tree-list">';
  for (const item of items) {
    html += '<li class="tree-item">';
    if (item.type === "dir") {
      const hasKids = item.children && item.children.length > 0;
      // 顶层目录默认展开，深层目录默认折叠
      const collapsed = _depth >= 1 ? " collapsed" : "";
      html += `<span class="tree-folder ${hasKids ? "has-kids" : ""}${collapsed}" data-path="${escHtml(item.path)}">`;
      html += `<span class="tree-arrow">${collapsed ? "▶" : "▼"}</span> `;
      html += `${escHtml(item.name)}</span>`;
      if (hasKids) {
        html += `<div class="tree-children${collapsed}">`;
        html += buildTreeHTML(item.children, _depth + 1);
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

let _pendingAction = null;  // "file" | "dir"
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
          if (isCollapsed) {
            children.classList.remove("collapsed");
            arrow.textContent = "▼";
            folder.classList.remove("collapsed");
          } else {
            children.classList.add("collapsed");
            arrow.textContent = "▶";
            folder.classList.add("collapsed");
          }
        }
        return;
      }
      // 点名称 → 选中目录
      document.querySelectorAll("#file_tree .tree-file, #file_tree .tree-folder")
        .forEach(e => e.classList.remove("active"));
      el.classList.add("active");
      _selectedDirPath = el.dataset.path || "";
      Console.append("system", `[目录] 已选中 "${_selectedDirPath || "/"}"，新建将创建在此目录下\n`);
    });
  });
  // 右键菜单：设为运行入口 / 删除
  document.querySelectorAll("#file_tree .tree-file").forEach(el => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const path = el.dataset.path;
      const isJava = path.endsWith(".java");
      const msg = isJava
        ? `[右键] "${path}"\n   → 已设为运行入口（再次右键可删除）\n`
        : `[右键] "${path}"\n   → 可在工具栏点击 🗑 删除\n`;
      if (isJava) {
        _selectedEntryPath = path;
        document.querySelectorAll("#file_tree .tree-entry").forEach(t => t.classList.remove("tree-entry"));
        el.classList.add("tree-entry");
      }
      // 同时设为目标路径，方便删除
      _selectedDirPath = "";
      Console.append("system", msg);
    });
  });
  // 文件夹右键：删除
  document.querySelectorAll("#file_tree .tree-folder").forEach(el => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      _selectedDirPath = el.dataset.path || "";
      _selectedEntryPath = "";
      Console.append("system", `[右键] 目录 "${_selectedDirPath || "/"}"\n   → 可在工具栏点击 🗑 删除\n`);
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
        Editor.setValue(data.content);
        // 清空 undo 历史，避免 Ctrl+Z 回退到上个文件的内容
        if (Editor.get()) Editor.get().clearHistory();
        // 刷新 viewport
        setTimeout(() => { if (Editor.get()) Editor.get().refresh(); }, 50);
        const info = $("#editor_info");
        if (info) info.textContent = path.split("/").pop() || "Main.java";
      }
    });
}
