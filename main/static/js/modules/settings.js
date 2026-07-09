/**
 * 设置面板管理 — JDK 三种模式、主题偏好
 */
const Settings = (() => {
  let _config = null;

  // ── API ──
  async function loadConfig() {
    try {
      const resp = await fetch("/api/config");
      _config = await resp.json();
      return _config;
    } catch (_) { return null; }
  }

  async function saveConfig(cfg) {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      _config = cfg;
      return true;
    } catch (_) { return false; }
  }

  async function checkJavaPath(path) {
    try {
      const resp = await fetch("/api/check-java", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      return await resp.json();
    } catch (_) { return { valid: false }; }
  }

  async function scanRelativeJdks() {
    try {
      const resp = await fetch("/api/scan-relative-jdks");
      return await resp.json();
    } catch (_) { return []; }
  }

  function getConfig() { return _config; }

  // ── UI 面板 ──
  function initPanel() {
    const openBtn = document.querySelector("#btn_open_settings");
    const closeBtn = document.querySelector("#btn_close_settings");
    const cancelBtn = document.querySelector("#btn_cancel_settings");
    const saveBtn = document.querySelector("#btn_save_settings");
    const modal = document.querySelector("#settings_modal");

    if (openBtn) openBtn.addEventListener("click", () => { if (modal) modal.style.display = "flex"; refreshPanel(); });
    if (closeBtn) closeBtn.addEventListener("click", () => { if (modal) modal.style.display = "none"; });
    if (cancelBtn) cancelBtn.addEventListener("click", () => { if (modal) modal.style.display = "none"; });
    if (saveBtn) saveBtn.addEventListener("click", saveSettings);

    // JDK 模式切换
    document.querySelectorAll('input[name="jdk_mode"]').forEach(r => {
      r.addEventListener("change", updateModeSections);
    });

    // 添加按钮 - 直接写入 config.json，不依赖保存按钮
    const addBtn = document.querySelector("#btn_add_jdk_path");
    if (addBtn) addBtn.addEventListener("click", async () => {
      const input = document.querySelector("#jdk_path_input");
      if (!input || !input.value.trim()) return;
      const path = input.value.trim();
      const sel = document.querySelector("#jdk_path_select");
      if (sel) {
        const opt = document.createElement("option");
        opt.value = path;
        opt.textContent = path;
        sel.appendChild(opt);
        sel.value = path;
      }
      input.value = "";
      checkSelectedPath();

      // 立刻持久化到 config
      if (!_config) _config = await loadConfig();
      const javaCfg = { ...(_config?.java || {}) };
      const history = [...(javaCfg.path_history || [])];
      const existing = history.find(e => e.path === path);
      if (!existing) {
        history.unshift({ path, added_at: new Date().toISOString().slice(0,10), invalid_count: 0 });
        javaCfg.path_history = history;
        const newCfg = { ..._config, java: javaCfg };
        await saveConfig(newCfg);
      }
      const st = document.querySelector("#settings_status");
      if (st) { st.textContent = "✓ 路径已添加并保存"; setTimeout(() => { st.textContent = ""; }, 2000); }
    });

    // 检测按钮
    const checkBtn = document.querySelector("#btn_check_jdk");
    if (checkBtn) checkBtn.addEventListener("click", checkSelectedPath);

    // 删除路径
    const delBtn = document.querySelector("#btn_delete_jdk");
    if (delBtn) delBtn.addEventListener("click", deleteSelectedPath);
  }

  async function refreshPanel() {
    _config = await loadConfig();
    if (!_config) return;

    const javaCfg = _config.java || {};
    const mode = javaCfg.mode || "env";

    // 恢复模式 radio — 对应 tab 高亮
    const modeRadio = document.querySelector(`input[name="jdk_mode"][value="${mode}"]`);
    if (modeRadio) modeRadio.checked = true;

    // 填充路径下拉
    const sel = document.querySelector("#jdk_path_select");
    if (sel) {
      sel.innerHTML = '<option value="">-- 选择历史路径 --</option>';
      const history = javaCfg.path_history || [];
      // 优先用 active_path，其次从 last_valid_javac 反推
      let activePath = javaCfg.active_path || "";
      if (!activePath) {
        let javacPath = javaCfg.last_valid_javac || "";
        if (javacPath) {
          const p = javacPath.replace(/\\/g, "/").replace(/\/bin\/javac.*$/, "");
          activePath = p.replace(/\//g, "\\");
        }
      }
      history.forEach((entry) => {
        const opt = document.createElement("option");
        opt.value = entry.path;
        const valid = entry.invalid_count === 0;
        opt.textContent = (valid ? "" : "[失效] ") + entry.path;
        if (!valid) opt.style.color = "#888";
        // 标记当前生效的路径
        if (mode === "path" && activePath && entry.path === activePath) {
          opt.textContent += " ★";
          opt.selected = true;
        }
        sel.appendChild(opt);
      });
      sel.addEventListener("change", () => { if (sel.value) checkSelectedPath(); });
    }

    updateModeSections();

    // 加载 Java 版本信息
    try {
      const vResp = await fetch("/api/java-version");
      const vData = await vResp.json();
      const verEl = document.querySelector("#jdk_version_info");
      if (verEl && vData.ok) verEl.textContent = vData.version;
    } catch (_) {}
  }

  function updateModeSections() {
    const mode = document.querySelector('input[name="jdk_mode"]:checked')?.value || "env";
    document.querySelector("#jdk_env_section").style.display      = mode === "env" ? "block" : "none";
    document.querySelector("#jdk_path_section").style.display     = mode === "path" ? "block" : "none";
    document.querySelector("#jdk_relative_section").style.display = mode === "relative" ? "block" : "none";

    if (mode === "env") showEnvInfo();
    if (mode === "relative") showRelativeInfo();
    if (mode === "path") {
      // 检查当前选中路径
      const sel = document.querySelector("#jdk_path_select");
      if (sel?.value) checkSelectedPath();
    }

    // 显示模式名 + 当前生效 JDK 路径
    const java = _config?.java || {};
    const modeLabel = { env: "环境模式", path: "路径模式", relative: "相对模式" }[mode] || mode;
    const cur = document.querySelector("#jdk_current");
    const javacPath = java.last_valid_javac || java.last_valid_java || "";
    if (cur) {
      cur.textContent = javacPath ? `[${modeLabel}] ${javacPath}` : `[${modeLabel}] (未检测到)`;
    }
  }

  function showEnvInfo() {
    const el = document.querySelector("#jdk_env_info");
    if (!el) return;
    const java = _config?.java || {};
    const javac = java.last_valid_javac || "(未检测到)";
    const javaExe = java.last_valid_java || "(未检测到)";
    el.innerHTML = `javac: <span class="ok">${javac}</span><br>java:  <span class="ok">${javaExe}</span>`;
    // 更新当前生效
    showCurrentActive(javac, javaExe);
  }

  function showCurrentActive(javac, javaExe) {
    const el = document.querySelector("#jdk_current");
    if (!el) return;
    el.textContent = javac && javac !== "(未检测到)" ? javac : "请配置 JDK";
  }

  async function checkSelectedPath() {
    const sel = document.querySelector("#jdk_path_select");
    const info = document.querySelector("#jdk_path_info");
    const path = sel?.value;
    if (!path || !info) return;
    info.textContent = "检测中...";
    const result = await checkJavaPath(path);
    if (result.valid) {
      info.innerHTML = `javac: <span class="ok">${result.javac}</span><br>java:  <span class="ok">${result.java}</span> ✅`;
      showCurrentActive(result.javac, result.java);
    } else {
      info.innerHTML = `<span class="err">❌ 此路径 JDK 不可用</span>`;
    }
  }

  async function showRelativeInfo() {
    const info = document.querySelector("#jdk_relative_info");
    const list = document.querySelector("#jdk_relative_list");
    if (!info || !list) return;
    info.textContent = "扫描中...";
    const jdks = await scanRelativeJdks();
    if (!jdks.length) {
      info.innerHTML = `<span class="err">jdk/ 目录下没有找到 JDK。请将 JDK 放入 {项目根}/jdk/jdk-{版本}/</span>`;
      list.innerHTML = "";
      return;
    }
    info.textContent = `找到 ${jdks.length} 个 JDK：`;
    let html = "";
    jdks.forEach(j => {
      const sel = _config?.java?.relative_version === j.version;
      html += `<label class="radio-option" style="margin-bottom:3px;">
        <input type="radio" name="rel_jdk" value="${j.version}" ${sel ? "checked" : ""}>
        <span>${j.version} ${j.valid ? "✅" : "❌"}</span>
        <small>${j.javac || "未找到"}</small>
      </label>`;
      if (sel && j.valid) {
        const cur = document.querySelector("#jdk_current");
        if (cur) cur.textContent = j.javac;
      }
    });
    list.innerHTML = html;
  }

  async function saveSettings() {
    const mode = document.querySelector('input[name="jdk_mode"]:checked')?.value || "env";
    const javaCfg = { ...(_config?.java || {}), mode };

    if (mode === "path") {
      const sel = document.querySelector("#jdk_path_select");
      if (sel?.value) {
        // 明确指定 active_path，防止顺序歧义
        javaCfg.active_path = sel.value;
        const history = javaCfg.path_history || [];
        const existing = history.find(e => e.path === sel.value);
        if (!existing) {
          history.unshift({ path: sel.value, added_at: new Date().toISOString().slice(0,10), invalid_count: 0 });
        }
        javaCfg.path_history = history;
      }
      javaCfg.relative_version = null;
    }

    if (mode === "relative") {
      const relRadio = document.querySelector('input[name="rel_jdk"]:checked');
      javaCfg.relative_version = relRadio?.value || null;
      javaCfg.path_history = javaCfg.path_history || [];
    }

    if (mode === "env") {
      javaCfg.relative_version = null;
    }

    const newCfg = { ..._config, java: javaCfg };
    const ok = await saveConfig(newCfg);
    const st = document.querySelector("#settings_status");
    if (ok) {
      if (st) { st.textContent = "✓ 设置已保存（重启服务器生效）"; setTimeout(() => { st.textContent = ""; }, 3000); }
    } else {
      if (st) { st.textContent = "✗ 保存失败，请重试"; st.style.color = "var(--red)"; setTimeout(() => { st.textContent = ""; st.style.color = ""; }, 3000); }
    }
  }

  async function deleteSelectedPath() {
    const sel = document.querySelector("#jdk_path_select");
    if (!sel?.value) return;
    const path = sel.value;
    const st = document.querySelector("#settings_status");

    const javaCfg = { ...(_config?.java || {}) };
    javaCfg.path_history = (javaCfg.path_history || []).filter(e => e.path !== path);
    _config = { ..._config, java: javaCfg };
    await saveConfig(_config);
    if (st) { st.textContent = "✓ 路径已删除"; setTimeout(() => { st.textContent = ""; }, 2000); }
    refreshPanel();
  }

  return { loadConfig, saveConfig, checkJavaPath, scanRelativeJdks, getConfig, initPanel, refreshPanel };
})();
