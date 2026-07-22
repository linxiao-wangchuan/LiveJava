/**
 * 设置面板 v2.3 — 竖 Tab（环境/外观）+ 外观管理
 */
const Settings = (() => {
  let _config = null;
  let _snapshot = null;   // 打开弹窗时的快照
  let _editingCustomId = null;

  // ── API ──
  async function loadConfig() {
    try { const r = await fetch("/api/config"); _config = await r.json(); return _config; }
    catch (_) { return null; }
  }
  async function saveConfig(cfg) {
    try { await fetch("/api/config", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(cfg) }); _config = cfg; return true; }
    catch (_) { return false; }
  }
  async function checkJavaPath(path) {
    try { const r = await fetch("/api/check-java", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({path}) }); return await r.json(); }
    catch (_) { return {valid:false}; }
  }
  async function scanRelativeJdks() {
    try { const r = await fetch("/api/scan-relative-jdks"); return await r.json(); }
    catch (_) { return []; }
  }
  function getConfig() { return _config; }

  // API: 背景图
  async function _bgList() {
    try { const r = await fetch("/api/backgrounds/list"); return await r.json(); }
    catch (_) { return {active:"",images:[]}; }
  }
  async function _bgUpload(filename, base64Data) {
    const r = await fetch("/api/backgrounds/upload", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename,data:base64Data}) });
    return await r.json();
  }
  async function _bgDelete(filename) {
    await fetch("/api/backgrounds/delete", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename}) });
  }
  async function _bgActivate(filename) {
    await fetch("/api/backgrounds/activate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename}) });
  }

  // API: 背景视频
  async function _videoList() {
    try { const r = await fetch("/api/background-videos/list"); return await r.json(); }
    catch (_) { return {active:"",videos:[]}; }
  }
  async function _videoUpload(filename, base64Data, thumb) {
    const r = await fetch("/api/background-videos/upload", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename, data:base64Data, thumb:thumb||null}) });
    return await r.json();
  }
  async function _videoDelete(filename) {
    await fetch("/api/background-videos/delete", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename}) });
  }
  async function _videoActivate(filename) {
    await fetch("/api/background-videos/activate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename}) });
  }

  // ── 打开设置弹窗 ──
  function openPanel(tab) {
    const modal = document.querySelector("#settings_modal");
    if (!modal) return;
    _takeSnapshot();
    modal.style.display = "flex";
    refreshPanel();
    if (tab) switchTab(tab);
    else {
      const lastTab = localStorage.getItem("java_runner_settings_tab") || "env";
      switchTab(lastTab);
    }
  }

  function _takeSnapshot() {
    _snapshot = {
      activeTheme: ThemeManager.getActive(),
      customThemes: JSON.parse(JSON.stringify(ThemeManager.getCustomThemes())),
    };
    // 背景图快照
    _bgList().then(data => {
      if (_snapshot) _snapshot.bgActive = data.active || "";
    });
    // 蒙版快照
    try { _snapshot.maskOpacity = localStorage.getItem("java_runner_mask_opacity") || "0.45"; } catch (_) {}
  }

  function closePanel() {
    _snapshot = null;
    const modal = document.querySelector("#settings_modal");
    if (modal) modal.style.display = "none";
  }

  function cancelPanel() {
    if (!_snapshot) { closePanel(); return; }
    // 恢复主题
    ThemeManager.applyTheme(_snapshot.activeTheme);
    // 恢复自定义主题列表
    const customs = ThemeManager.getCustomThemes();
    const snapIds = _snapshot.customThemes.map(t => t.id);
    // 删掉快照里没有的自定义主题
    for (const c of customs) {
      if (!snapIds.includes(c.id) && !ThemeManager.isPreset(c.id)) {
        ThemeManager.deleteCustom(c.id);
      }
    }
    // 恢复蒙版
    const opacity = _snapshot.maskOpacity || "0.45";
    applyMaskOpacity(opacity);
    try { localStorage.setItem("java_runner_mask_opacity", opacity); } catch (_) {}
    _snapshot = null;
    closePanel();
  }

  // ── 竖 Tab 切换 ──
  function switchTab(tabId) {
    document.querySelectorAll(".side-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".settings-tab-content").forEach(t => t.style.display = "none");
    const tabEl = document.querySelector(`.side-tab[data-tab="${tabId}"]`);
    const contentEl = document.querySelector(`#settings_tab_${tabId}`);
    if (tabEl) tabEl.classList.add("active");
    if (contentEl) contentEl.style.display = "block";
    try { localStorage.setItem("java_runner_settings_tab", tabId); } catch (_) {}
    if (tabId === "appearance") refreshAppearancePanel();
  }

  // ── 初始化 ──
  function initPanel() {
    const openBtn = document.querySelector("#btn_open_settings");
    const closeBtn = document.querySelector("#btn_close_settings");
    const cancelBtn = document.querySelector("#btn_cancel_settings");
    const saveBtn = document.querySelector("#btn_save_settings");
    const modal = document.querySelector("#settings_modal");

    if (openBtn) openBtn.addEventListener("click", () => openPanel());
    if (closeBtn) closeBtn.addEventListener("click", closePanel);
    if (cancelBtn) cancelBtn.addEventListener("click", cancelPanel);
    if (saveBtn) saveBtn.addEventListener("click", () => { saveSettings(); closePanel(); });

    // 竖 Tab 点击
    document.querySelectorAll(".side-tab").forEach(t => {
      t.addEventListener("click", () => switchTab(t.dataset.tab));
    });

    // 点遮罩关闭 = 取消
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) cancelPanel(); });

    // JDK 模式切换
    document.querySelectorAll('input[name="jdk_mode"]').forEach(r => {
      r.addEventListener("change", updateModeSections);
    });

    // 添加路径按钮
    const addBtn = document.querySelector("#btn_add_jdk_path");
    if (addBtn) addBtn.addEventListener("click", async () => {
      const input = document.querySelector("#jdk_path_input");
      if (!input || !input.value.trim()) return;
      const path = input.value.trim();
      const sel = document.querySelector("#jdk_path_select");
      if (sel) {
        const opt = document.createElement("option");
        opt.value = path; opt.textContent = path;
        sel.appendChild(opt); sel.value = path;
      }
      input.value = "";
      checkSelectedPath();
      _config = await loadConfig();
      const javaCfg = {...(_config?.java||{})};
      const history = [...(javaCfg.path_history||[])];
      if (!history.find(e => e.path === path)) {
        history.unshift({path, added_at: new Date().toISOString().slice(0,10), invalid_count:0});
        javaCfg.path_history = history;
        _config = {..._config, java:javaCfg};
        await saveConfig(_config);
      }
      const st = document.querySelector("#settings_status");
      if (st) { st.textContent = "✓ 路径已保存"; setTimeout(()=>{st.textContent="";},2000); }
    });

    const checkBtn = document.querySelector("#btn_check_jdk");
    if (checkBtn) checkBtn.addEventListener("click", checkSelectedPath);

    const delBtn = document.querySelector("#btn_delete_jdk");
    if (delBtn) delBtn.addEventListener("click", deleteSelectedPath);

    // ── 外观面板事件 ──
    initAppearanceEvents();
  }

  // ── JDK 刷新（保持原有逻辑） ──
  async function refreshPanel() {
    _config = await loadConfig();
    if (!_config) return;
    const javaCfg = _config.java || {};
    const mode = javaCfg.mode || "env";
    const modeRadio = document.querySelector(`input[name="jdk_mode"][value="${mode}"]`);
    if (modeRadio) modeRadio.checked = true;
    const sel = document.querySelector("#jdk_path_select");
    if (sel) {
      sel.innerHTML = '<option value="">-- 选择历史路径 --</option>';
      const history = javaCfg.path_history || [];
      let activePath = javaCfg.active_path || "";
      if (!activePath) {
        let jp = javaCfg.last_valid_javac || "";
        if (jp) { const p = jp.replace(/\\/g,"/").replace(/\/bin\/javac.*$/,""); activePath = p.replace(/\//g,"\\"); }
      }
      history.forEach(entry => {
        const opt = document.createElement("option");
        opt.value = entry.path;
        opt.textContent = (entry.invalid_count===0?"":"[失效] ") + entry.path + (mode==="path"&&activePath&&entry.path===activePath?" ★":"");
        if (entry.invalid_count!==0) opt.style.color = "#888";
        if (mode==="path"&&activePath&&entry.path===activePath) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", ()=>{if(sel.value)checkSelectedPath();});
    }
    updateModeSections();
    try {
      const vResp = await fetch("/api/java-version");
      const vData = await vResp.json();
      const verEl = document.querySelector("#jdk_version_info");
      if (verEl && vData.ok) verEl.textContent = vData.version;
    } catch (_) {}
  }

  function updateModeSections() {
    const mode = document.querySelector('input[name="jdk_mode"]:checked')?.value || "env";
    document.querySelector("#jdk_env_section").style.display      = mode==="env"?"block":"none";
    document.querySelector("#jdk_path_section").style.display     = mode==="path"?"block":"none";
    document.querySelector("#jdk_relative_section").style.display = mode==="relative"?"block":"none";
    if (mode==="env") showEnvInfo();
    if (mode==="relative") showRelativeInfo();
    if (mode==="path") { const sel=document.querySelector("#jdk_path_select"); if(sel?.value)checkSelectedPath(); }
    const java = _config?.java || {};
    const modeLabel = {env:"环境模式",path:"路径模式",relative:"相对模式"}[mode]||mode;
    const cur = document.querySelector("#jdk_current");
    const jp = java.last_valid_javac || java.last_valid_java || "";
    if (cur) cur.textContent = jp ? `[${modeLabel}] ${jp}` : `[${modeLabel}] (未检测到)`;
  }

  function showEnvInfo() {
    const el = document.querySelector("#jdk_env_info");
    if (!el) return;
    const java = _config?.java || {};
    el.innerHTML = `javac: <span class="ok">${java.last_valid_javac||"(未检测到)"}</span><br>java: <span class="ok">${java.last_valid_java||"(未检测到)"}</span>`;
  }

  async function checkSelectedPath() {
    const sel = document.querySelector("#jdk_path_select");
    const info = document.querySelector("#jdk_path_info");
    if (!sel?.value||!info) return;
    info.textContent = "检测中...";
    const r = await checkJavaPath(sel.value);
    info.innerHTML = r.valid
      ? `javac: <span class="ok">${r.javac}</span><br>java: <span class="ok">${r.java}</span> ✅`
      : `<span class="err">❌ 此路径 JDK 不可用</span>`;
  }

  async function showRelativeInfo() {
    const info = document.querySelector("#jdk_relative_info");
    const list = document.querySelector("#jdk_relative_list");
    if (!info||!list) return;
    info.textContent = "扫描中...";
    const jdks = await scanRelativeJdks();
    if (!jdks.length) { info.innerHTML=`<span class="err">jdk/ 目录下未找到 JDK</span>`; list.innerHTML=""; return; }
    info.textContent = `找到 ${jdks.length} 个 JDK：`;
    let html = "";
    jdks.forEach(j => {
      const sel = _config?.java?.relative_version === j.version;
      html += `<label class="radio-option"><input type="radio" name="rel_jdk" value="${j.version}" ${sel?"checked":""}> <span>${j.version} ${j.valid?"✅":"❌"}</span><small>${j.javac||"未找到"}</small></label>`;
    });
    list.innerHTML = html;
  }

  async function saveSettings() {
    // 先重载配置确保 path_history 等字段是最新的
    _config = await loadConfig();
    const mode = document.querySelector('input[name="jdk_mode"]:checked')?.value || "env";
    const javaCfg = {...(_config?.java||{}), mode};
    if (mode==="path") {
      const sel = document.querySelector("#jdk_path_select");
      if (sel?.value) { javaCfg.active_path = sel.value; javaCfg.relative_version = null; }
    }
    if (mode==="relative") {
      const relRadio = document.querySelector('input[name="rel_jdk"]:checked');
      javaCfg.relative_version = relRadio?.value||null;
    }
    if (mode==="env") javaCfg.relative_version = null;
    const newCfg = {..._config, java:javaCfg, theme:ThemeManager.getActive(), custom_themes:ThemeManager.getCustomThemes()};
    const ok = await saveConfig(newCfg);
    const st = document.querySelector("#settings_status");
    if (ok) {
      if (st) { st.textContent = "✓ 设置已保存，JDK 已热重载"; st.style.color = ""; setTimeout(() => { st.textContent = ""; }, 2500); }
      // 立即刷新面板显示（JDK 路径、版本等）
      _config = await loadConfig();
      refreshPanel();
      // 同步更新顶部栏 Java 版本
      fetchJavaVersion();
    } else {
      if (st) { st.textContent = "✗ 保存失败"; st.style.color = "var(--red)"; setTimeout(() => { st.textContent = ""; st.style.color = ""; }, 3000); }
    }
  }

  async function fetchJavaVersion() {
    try {
      const r = await fetch("/api/java-version");
      const d = await r.json();
      const el = document.querySelector("#java_version");
      if (el && d.ok) { el.textContent = d.version; el.title = d.version; }
    } catch (_) {}
  }

  async function deleteSelectedPath() {
    const sel = document.querySelector("#jdk_path_select");
    if (!sel?.value) return;
    const javaCfg = {...(_config?.java||{})};
    javaCfg.path_history = (javaCfg.path_history||[]).filter(e => e.path!==sel.value);
    _config = {..._config, java:javaCfg};
    await saveConfig(_config);
    refreshPanel();
  }

  // ═══════════════════════════════════════════
  //  外观面板
  // ═══════════════════════════════════════════

  function initAppearanceEvents() {
    // 背景图上传按钮
    const zone = document.querySelector("#bg_upload_zone");
    const fileInput = document.querySelector("#bg_file_input");
    if (zone && fileInput) {
      zone.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (file) _handleBgFile(file);
        fileInput.value = "";
      });
    }

    // 蒙版滑块
    const slider = document.querySelector("#mask_opacity");
    if (slider) {
      // 恢复
      try { const v = localStorage.getItem("java_runner_mask_opacity")||"0.45"; slider.value = Math.round(parseFloat(v)*100); } catch (_) {}
      const valEl = document.querySelector("#mask_opacity_val");
      if (valEl) valEl.textContent = (slider.value/100).toFixed(2);
      slider.addEventListener("input", () => {
        const v = slider.value / 100;
        if (valEl) valEl.textContent = v.toFixed(2);
        applyMaskOpacity(v);
        try { localStorage.setItem("java_runner_mask_opacity", String(v)); } catch (_) {}
      });
    }

    // 粘贴背景图
    document.addEventListener("paste", (e) => {
      const modal = document.querySelector("#settings_modal");
      if (!modal || modal.style.display === "none") return;
      // 检查焦点不在 input 里
      if (document.activeElement && document.activeElement.tagName === "INPUT") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) _handleBgFile(file);
          break;
        }
        if (item.type.startsWith("video/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) _handleVideoFile(file);
          break;
        }
      }
    });

    // ── 上传限制 ──
    function _getLimit(key, defVal) {
      try { return parseInt(localStorage.getItem(key)) || defVal; } catch (_) { return defVal; }
    }
    function _saveLimit(key, val) {
      try { localStorage.setItem(key, val); } catch (_) {}
      // 同步到 config.json
      const cfg = _config || {};
      if (!cfg.upload_limits) cfg.upload_limits = {};
      cfg.upload_limits[key] = parseInt(val);
      saveConfig(cfg);
    }
    const imgLimitInput = document.querySelector("#image_limit_mb");
    const vidLimitInput = document.querySelector("#video_limit_mb");
    if (imgLimitInput) {
      imgLimitInput.value = _getLimit("java_runner_image_limit_mb", 100);
      imgLimitInput.addEventListener("change", () => _saveLimit("java_runner_image_limit_mb", imgLimitInput.value));
    }
    if (vidLimitInput) {
      vidLimitInput.value = _getLimit("java_runner_video_limit_mb", 150);
      vidLimitInput.addEventListener("change", () => _saveLimit("java_runner_video_limit_mb", vidLimitInput.value));
    }

    // ── 背景图筛选标签 ──
    document.querySelectorAll(".bg-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".bg-filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        _refreshBgGrid();
      });
    });

    // ── 图片填充方式 ──
    document.querySelectorAll('input[name="image_fill"]').forEach(r => {
      r.addEventListener("change", () => {
        const imgDiv = document.querySelector("#editor_bg_image");
        if (imgDiv) {
          imgDiv.style.backgroundSize = r.value;
          imgDiv.style.backgroundPosition = r.value === "contain" ? "center center" : "center center";
        }
        try { localStorage.setItem("java_runner_image_fill", r.value); } catch (_) {}
      });
    });
    try {
      const fill = localStorage.getItem("java_runner_image_fill") || "cover";
      const fillRadio = document.querySelector(`input[name="image_fill"][value="${fill}"]`);
      if (fillRadio) fillRadio.checked = true;
    } catch (_) {}

    // ── 背景模式切换（图片 ↔ 视频） ──
    document.querySelectorAll('input[name="bg_mode"]').forEach(r => {
      r.addEventListener("change", () => {
        const isImage = r.value === "image";
        try { localStorage.setItem("java_runner_bg_mode", r.value); } catch (_) {}
        document.querySelector("#bg_image_section").style.display = isImage ? "" : "none";
        document.querySelector("#bg_video_section").style.display = isImage ? "none" : "";
        if (isImage) {
          _stopVideo();
          _applyEditorBg(_currentBgActive());
        } else {
          _applyEditorBg("");  // 清除背景图
          _refreshVideoGrid();
        }
      });
    });
    // 恢复上次模式
    try {
      const mode = localStorage.getItem("java_runner_bg_mode") || "image";
      const radio = document.querySelector(`input[name="bg_mode"][value="${mode}"]`);
      if (radio) radio.checked = true;
      if (mode === "video") {
        document.querySelector("#bg_image_section").style.display = "none";
        document.querySelector("#bg_video_section").style.display = "";
      }
    } catch (_) {}

    // 视频上传
    const videoZone = document.querySelector("#video_upload_zone");
    const videoFileInput = document.querySelector("#video_file_input");
    if (videoZone && videoFileInput) {
      videoZone.addEventListener("click", () => videoFileInput.click());
      videoFileInput.addEventListener("change", () => {
        const file = videoFileInput.files[0];
        if (file) _handleVideoFile(file);
        videoFileInput.value = "";
      });
    }

    // 视频填充方式
    document.querySelectorAll('input[name="video_fill"]').forEach(r => {
      r.addEventListener("change", () => {
        const video = document.querySelector("#editor_bg_video");
        if (video) video.style.objectFit = r.value;
        try { localStorage.setItem("java_runner_video_fill", r.value); } catch (_) {}
      });
    });
    try {
      const fill = localStorage.getItem("java_runner_video_fill") || "cover";
      const fillRadio = document.querySelector(`input[name="video_fill"][value="${fill}"]`);
      if (fillRadio) fillRadio.checked = true;
    } catch (_) {}

    // 音量
    const volSlider = document.querySelector("#video_volume");
    if (volSlider) {
      try { volSlider.value = localStorage.getItem("java_runner_video_volume") || "0"; } catch (_) {}
      const volVal = document.querySelector("#video_volume_val");
      const updateVolLabel = () => {
        const v = parseInt(volSlider.value);
        if (volVal) volVal.textContent = v === 0 ? "静音" : (v / 100).toFixed(2);
        const video = document.querySelector("#editor_bg_video");
        if (video) { video.volume = v / 100; video.muted = v === 0; }
      };
      updateVolLabel();
      volSlider.addEventListener("input", () => {
        updateVolLabel();
        try { localStorage.setItem("java_runner_video_volume", volSlider.value); } catch (_) {}
      });
    }

    // 新建自定义主题
    const newBtn = document.querySelector("#btn_new_custom");
    if (newBtn) newBtn.addEventListener("click", () => openCustomEditor(null));

    // 自定义编辑器事件
    const saveCustomBtn = document.querySelector("#btn_save_custom");
    const cancelCustomBtn = document.querySelector("#btn_cancel_custom");
    const closeCustomBtn = document.querySelector("#btn_close_custom_editor");
    const delCustomBtn = document.querySelector("#btn_delete_custom");
    const customModal = document.querySelector("#custom_editor_modal");
    if (saveCustomBtn) saveCustomBtn.addEventListener("click", saveCustomEditor);
    if (cancelCustomBtn) cancelCustomBtn.addEventListener("click", closeCustomEditor);
    if (closeCustomBtn) closeCustomBtn.addEventListener("click", closeCustomEditor);
    if (delCustomBtn) delCustomBtn.addEventListener("click", deleteCustomEditor);
    if (customModal) customModal.addEventListener("click", (e) => { if (e.target===customModal) closeCustomEditor(); });

    // ── 删除警告开关 ──
    const warnToggle = document.querySelector("#delete_warn_toggle");
    if (warnToggle) {
      const saved = localStorage.getItem("java_runner_delete_warn");
      warnToggle.checked = saved !== "0";
      warnToggle.addEventListener("change", () => {
        localStorage.setItem("java_runner_delete_warn", warnToggle.checked ? "1" : "0");
      });
    }

    // ── 其他设置 ──
    const autoOpenToggle = document.querySelector("#auto_open_toggle");
    if (autoOpenToggle) {
      autoOpenToggle.checked = localStorage.getItem("java_runner_auto_open") !== "0";
      autoOpenToggle.addEventListener("change", () => {
        localStorage.setItem("java_runner_auto_open", autoOpenToggle.checked ? "1" : "0");
      });
    }

    const suffixRadios = document.querySelectorAll('input[name="file_suffix"]');
    const customInput = document.querySelector("#custom_suffix_input");
    const savedSuffix = localStorage.getItem("java_runner_file_suffix") || "java";
    suffixRadios.forEach(r => {
      if (r.value === savedSuffix || (r.value === "custom" && !["java","none"].includes(savedSuffix))) {
        r.checked = true;
        if (r.value === "custom" && !["java","none"].includes(savedSuffix)) {
          if (customInput) { customInput.style.display = ""; customInput.disabled = false; customInput.value = savedSuffix; }
        }
      }
      r.addEventListener("change", () => {
        if (r.value === "java") {
          localStorage.setItem("java_runner_file_suffix", "java");
          if (customInput) { customInput.style.display = "none"; customInput.disabled = true; }
        } else if (r.value === "none") {
          localStorage.setItem("java_runner_file_suffix", "none");
          if (customInput) { customInput.style.display = "none"; customInput.disabled = true; }
        }
      });
    });
    if (customInput) {
      customInput.addEventListener("input", () => {
        const v = customInput.value.trim();
        if (v) localStorage.setItem("java_runner_file_suffix", v.startsWith(".") ? v : "." + v);
      });
      // 点击「自定义后缀」radio 时聚焦输入框
      const customRadio = document.querySelector('input[name="file_suffix"][value="custom"]');
      if (customRadio) {
        customRadio.addEventListener("change", () => {
          if (customRadio.checked) {
            customInput.style.display = "";
            customInput.disabled = false;
            customInput.focus();
            const v = customInput.value.trim();
            if (v) localStorage.setItem("java_runner_file_suffix", v.startsWith(".") ? v : "." + v);
            else localStorage.setItem("java_runner_file_suffix", ".txt");
          }
        });
      }
    }

    // ── 骨架模板 ──
    const useTemplateToggle = document.querySelector("#use_template_toggle");
    const templateEditor = document.querySelector("#template_editor");
    const templateStatus = document.querySelector("#template_status");
    if (useTemplateToggle) {
      useTemplateToggle.checked = localStorage.getItem("java_runner_use_template") !== "0";
      useTemplateToggle.addEventListener("change", () => {
        localStorage.setItem("java_runner_use_template", useTemplateToggle.checked ? "1" : "0");
      });
    }
    let _templateSaveTimer = null;
    if (templateEditor && templateStatus) {
      // 加载模板
      fetch("/api/template")
        .then(r => r.json())
        .then(d => { if (d.ok && d.content) templateEditor.value = d.content; })
        .catch(() => {});
      // 输入后 1 秒自动保存
      templateEditor.addEventListener("input", () => {
        clearTimeout(_templateSaveTimer);
        _templateSaveTimer = setTimeout(async () => {
          try {
            const r = await fetch("/api/template", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: templateEditor.value }),
            });
            const d = await r.json();
            templateStatus.textContent = d.ok ? "✓ 已保存" : "✗ 保存失败";
            templateStatus.style.color = d.ok ? "" : "var(--red)";
            setTimeout(() => { templateStatus.textContent = "修改后自动保存"; templateStatus.style.color = ""; }, 2000);
          } catch (_) {}
        }, 1000);
      });
    }
  }

  function refreshAppearancePanel() {
    // 颜色预设
    const grid = document.querySelector("#preset_grid");
    if (grid) {
      const active = ThemeManager.getActive();
      let html = "";
      ThemeManager.getPresets().forEach(p => {
        const isActive = p.id === active;
        html += `<div class="preset-card preset-locked${isActive?" active":""}" data-theme-id="${p.id}" title="${p.name}">
          <span class="preset-tick">✓</span>
          <span class="preset-name">${p.name}</span>
        </div>`;
      });
      grid.innerHTML = html;
      grid.querySelectorAll(".preset-card").forEach(card => {
        card.addEventListener("click", () => {
          ThemeManager.applyTheme(card.dataset.themeId);
          refreshAppearancePanel();
          _updateBgMask();
        });
      });
    }

    // 自定义主题
    const cgrid = document.querySelector("#custom_grid");
    if (cgrid) {
      const active = ThemeManager.getActive();
      let html = "";
      ThemeManager.getCustomThemes().forEach(t => {
        const isActive = t.id === active;
        html += `<div class="preset-card${isActive?" active":""}" data-theme-id="${t.id}" title="${t.name}">
          <span class="preset-tick">✓</span>
          <span class="preset-name">${t.name}</span>
          <span class="preset-del" data-del="${t.id}">🗑</span>
        </div>`;
      });
      cgrid.innerHTML = html;
      cgrid.querySelectorAll(".preset-card").forEach(card => {
        card.addEventListener("click", (e) => {
          if (e.target.classList.contains("preset-del")) {
            ThemeManager.deleteCustom(e.target.dataset.del);
            refreshAppearancePanel();
            return;
          }
          ThemeManager.applyTheme(card.dataset.themeId);
          refreshAppearancePanel();
          _updateBgMask();
        });
      });
      // 双击编辑
      cgrid.querySelectorAll(".preset-card").forEach(card => {
        card.addEventListener("dblclick", (e) => {
          if (e.target.classList.contains("preset-del")) return;
          openCustomEditor(card.dataset.themeId);
        });
      });
    }

    // 背景图 + 背景视频
    _refreshBgGrid();
    _refreshVideoGrid();
  }

  // ── 通用媒体网格渲染（图片 + 视频） ──
  const MEDIA_CFG = {
    image: {
      gridId: "bg_grid", listFn: "_bgList", dataKey: "images",
      noneTitle: "无背景图", hasFilter: true,
      cardContent: (item) => {
        const isGif = item.filename.toLowerCase().endsWith(".gif");
        return isGif ? '<span class="bg-gif-badge">GIF</span>' : "";
      },
      thumbStyle: (thumb) => thumb ? `background-image:url(data:image/jpeg;base64,${thumb})` : "background:var(--bg-tertiary)",
      delFn: "_bgDelete", activateFn: "_bgActivate",
      onActivate: (fn) => { _applyEditorBg(fn); try { localStorage.setItem("java_runner_bg_active_img", fn); } catch (_) {} },
      onClear: () => _applyEditorBg(""),
    },
    video: {
      gridId: "video_grid", listFn: "_videoList", dataKey: "videos",
      noneTitle: "无背景视频", hasFilter: false,
      cardContent: (item) => item.thumb ? "" : '<span style="font-size:18px;line-height:50px;text-align:center;display:block;">🎬</span>',
      thumbStyle: (thumb) => thumb ? `background-image:url(data:image/jpeg;base64,${thumb});background-size:cover;` : "background:var(--bg-tertiary)",
      delFn: "_videoDelete", activateFn: "_videoActivate",
      onActivate: (fn) => { if (fn) _applyEditorVideo(fn); else _stopVideo(); },
      onClear: () => _stopVideo(),
    },
  };

  async function _refreshMediaGrid(type) {
    const cfg = MEDIA_CFG[type];
    const grid = document.querySelector("#" + cfg.gridId);
    if (!grid) return;
    const data = await eval(cfg.listFn)();
    const active = data.active || "";

    let filter = "all";
    if (cfg.hasFilter) {
      const filterBtn = document.querySelector(".bg-filter-btn.active");
      filter = filterBtn ? filterBtn.dataset.filter : "all";
    }

    let html = "";
    html += `<div class="bg-card bg-none${!active ? " active" : ""}" data-filename="" title="${cfg.noneTitle}">
      <span class="bg-card-tick">✓</span>
      <span style="font-size:10px;line-height:50px;text-align:center;display:block;color:var(--text-dim);">无</span>
    </div>`;

    for (const item of data[cfg.dataKey] || []) {
      if (cfg.hasFilter) {
        const isGif = item.filename.toLowerCase().endsWith(".gif");
        if (filter === "gif" && !isGif) continue;
        if (filter === "static" && isGif) continue;
      }
      const isActive = item.filename === active;
      const thumbAttr = item.thumb ? ` data-thumb="${item.thumb.replace(/"/g, '&quot;')}"` : "";
      html += `<div class="bg-card${isActive ? " active" : ""}" style="${cfg.thumbStyle(item.thumb)}" data-filename="${item.filename}" title="${item.filename}"${thumbAttr} data-media-type="${type}">
        <span class="bg-card-tick">✓</span>
        ${cfg.cardContent(item)}
        <span class="bg-card-del" data-del="${item.filename}">✕</span>
      </div>`;
    }

    const uploadZone = grid.querySelector(".bg-upload-zone");
    grid.querySelectorAll(".bg-card").forEach(c => c.remove());
    if (uploadZone) uploadZone.insertAdjacentHTML("beforebegin", html);

    grid.onclick = async (e) => {
      const delBtn = e.target.closest(".bg-card-del");
      if (delBtn) {
        e.stopPropagation();
        const warnEl = document.querySelector("#delete_warn_toggle");
        const warnEnabled = warnEl ? warnEl.checked : true;
        if (warnEnabled && !confirm("确定要删除吗？此操作不可撤销。")) return;
        await eval(cfg.delFn)(delBtn.dataset.del);
        if (active === delBtn.dataset.del) cfg.onClear();
        _refreshMediaGrid(type);
        return;
      }
      const card = e.target.closest(".bg-card");
      if (card && card.dataset.filename !== undefined) {
        const fn = card.dataset.filename;
        await eval(cfg.activateFn)(fn);
        cfg.onActivate(fn);
        _refreshMediaGrid(type);
      }
    };

    // 点击预览（侧边面板）
    let _previewOpen = false;
    let _previewZoom = false;
    let _longPressTimer = null;
    const previewPanel = document.querySelector("#bg_preview_panel");
    const previewImg = document.querySelector("#bg_preview_img");
    const previewVid = document.querySelector("#bg_preview_video");
    const previewEmpty = previewPanel ? previewPanel.querySelector(".bg-preview-empty") : null;

    function _clearLongPress() {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      if (previewImg) previewImg.style.transform = "";
    }

    function _showPreview(filename, mediaType) {
      if (!previewPanel) return;
      previewPanel.style.display = "flex";
      _previewOpen = true; _previewZoom = false;
      if (previewImg) { previewImg.style.transform = ""; previewImg.style.objectFit = "contain"; }
      if (mediaType === "video") {
        if (previewImg) previewImg.style.display = "none";
        if (previewVid) { previewVid.style.display = ""; previewVid.src = `/api/background-videos/file/${encodeURIComponent(filename)}`; previewVid.play(); }
        if (previewEmpty) previewEmpty.style.display = "none";
      } else {
        if (previewVid) { previewVid.style.display = "none"; previewVid.pause(); }
        if (previewImg) { previewImg.style.display = ""; previewImg.src = `/api/backgrounds/file/${encodeURIComponent(filename)}`; }
        if (previewEmpty) previewEmpty.style.display = "none";
      }
    }

    function _closePreview() {
      if (!previewPanel) return;
      previewPanel.style.display = "none";
      previewPanel.classList.remove("zoomed");
      _previewOpen = false;
      _clearLongPress();
      if (previewVid) { previewVid.pause(); previewVid.src = ""; }
      if (previewImg) { previewImg.src = ""; previewImg.style.transform = ""; }
    }

    // 双击缩放
    if (previewPanel) {
      previewPanel.addEventListener("dblclick", (e) => {
        if (!_previewOpen) return;
        _previewZoom = !_previewZoom;
        const el = previewVid && previewVid.style.display !== "none" ? previewVid : previewImg;
        if (el) el.style.objectFit = _previewZoom ? "none" : "contain";
        previewPanel.classList.toggle("zoomed", _previewZoom);
      });
      // 长按放大（图片）
      if (previewImg) {
        previewImg.addEventListener("mousedown", (e) => {
          if (!_previewOpen) return;
          _clearLongPress();
          _longPressTimer = setTimeout(() => {
            previewImg.style.transform = "scale(1.8)";
            previewImg.style.transformOrigin = `${(e.offsetX / previewImg.offsetWidth) * 100}% ${(e.offsetY / previewImg.offsetHeight) * 100}%`;
          }, 400);
        });
        previewImg.addEventListener("mouseup", _clearLongPress);
        previewImg.addEventListener("mouseleave", _clearLongPress);
      }
    }

    grid.querySelectorAll(".bg-card").forEach(card => {
      card.addEventListener("click", (e) => {
        // 不拦截删除按钮的点击
        if (e.target.closest(".bg-card-del")) return;
        const filename = card.dataset.filename;
        const mediaType = card.dataset.mediaType;
        if (!filename || !mediaType) { _closePreview(); return; }
        _showPreview(filename, mediaType);
      });
    });
  }

  function _refreshBgGrid() { return _refreshMediaGrid("image"); }
  function _refreshVideoGrid() { return _refreshMediaGrid("video"); }

  async function _handleBgFile(file) {
    const imgLimit = parseInt(localStorage.getItem("java_runner_image_limit_mb")||"100") * 1024 * 1024;
    if (file.size > imgLimit) { alert(`图片不能超过 ${parseInt(localStorage.getItem("java_runner_image_limit_mb")||"100")}MB`); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await _bgUpload(file.name, reader.result);
      if (result.ok) {
        _refreshBgGrid();
        const st = document.querySelector("#settings_status");
        if (st) { st.textContent = "✓ 背景图已上传"; setTimeout(()=>{st.textContent="";},2000); }
      }
    };
    reader.readAsDataURL(file);
  }

  async function _handleVideoFile(file) {
    const vidLimit = parseInt(localStorage.getItem("java_runner_video_limit_mb")||"150") * 1024 * 1024;
    if (file.size > vidLimit) { alert(`视频不能超过 ${parseInt(localStorage.getItem("java_runner_video_limit_mb")||"150")}MB`); return; }
    const thumb = await _captureVideoFrame(file);
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await _videoUpload(file.name, reader.result, thumb);
      if (result.ok) { _refreshVideoGrid(); }
    };
    reader.readAsDataURL(file);
  }

  function _captureVideoFrame(file) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata"; video.muted = true; video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;
      let done = false;
      const finish = (b64) => { if (!done) { done = true; URL.revokeObjectURL(url); video.remove(); resolve(b64); } };
      video.addEventListener("loadeddata", () => { video.currentTime = 0.1; });
      video.addEventListener("seeked", () => {
        const canvas = document.createElement("canvas");
        canvas.width = 160; canvas.height = 90;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, 160, 90);
        const full = canvas.toDataURL("image/jpeg", 0.6);
        const pure = full.includes("base64,") ? full.split("base64,")[1] : full;
        finish(pure);
        canvas.remove();
      });
      video.addEventListener("error", () => finish(null));
      setTimeout(() => finish(null), 8000);
    });
  }

  function _applyEditorVideo(filename) {
    const video = document.querySelector("#editor_bg_video");
    const imgDiv = document.querySelector("#editor_bg_image");
    if (!video) return;
    if (imgDiv) imgDiv.style.backgroundImage = "";
    video.style.display = "";
    // 恢复填充方式
    try { video.style.objectFit = localStorage.getItem("java_runner_video_fill") || "cover"; } catch (_) {}
    // 先静音以通过浏览器 autoplay 策略
    video.muted = true;
    video.src = `/api/background-videos/file/${encodeURIComponent(filename)}`;
    // 等播放开始后再恢复用户音量设置
    video.onplay = () => {
      try {
        const vol = parseInt(localStorage.getItem("java_runner_video_volume") || "0");
        video.volume = vol / 100;
        video.muted = vol === 0;
      } catch (_) {}
      video.onplay = null;
    };
  }

  function _stopVideo() {
    const video = document.querySelector("#editor_bg_video");
    if (video) {
      video.pause();
      video.src = "";
      video.style.display = "none";
    }
  }

  // ── 获取当前激活的背景（image 或 video） ──
  function _currentBgActive() {
    try { return localStorage.getItem("java_runner_bg_active_img") || ""; } catch (_) { return ""; }
  }

  function _applyEditorBg(filename) {
    _stopVideo();
    const imgDiv = document.querySelector("#editor_bg_image");
    if (!filename) {
      if (imgDiv) imgDiv.style.backgroundImage = "";
      return;
    }
    _ensureEditorBgOverlay();
    if (imgDiv) {
      imgDiv.style.backgroundImage = `url(/api/backgrounds/file/${encodeURIComponent(filename)})`;
      // 恢复填充方式
      try {
        const fill = localStorage.getItem("java_runner_image_fill") || "cover";
        imgDiv.style.backgroundSize = fill;
        imgDiv.style.backgroundPosition = "center center";
      } catch (_) {}
    }
  }

  function _ensureEditorBgOverlay() {
    if (document.querySelector("#editor_bg_overlay")) return;
    const editorPanel = document.querySelector("#editor_panel");
    if (!editorPanel) return;
    const overlay = document.createElement("div");
    overlay.id = "editor_bg_overlay";
    overlay.innerHTML = '<video id="editor_bg_video" loop muted autoplay playsinline style="display:none;"></video><div id="editor_bg_image"></div><div id="editor_bg_mask"></div>';
    // 插入为第一个子元素（在 CodeMirror 之下）
    editorPanel.insertBefore(overlay, editorPanel.firstChild);
    // 初始蒙版
    try {
      const v = parseFloat(localStorage.getItem("java_runner_mask_opacity")||"0.45");
      applyMaskOpacity(v);
    } catch (_) {}
  }

  function applyMaskOpacity(val) {
    const mask = document.querySelector("#editor_bg_mask");
    if (!mask) return;
    const bg = ThemeManager.getPrimaryBg() || "#1e1e1e";
    mask.style.backgroundColor = bg;
    mask.style.opacity = val;
  }

  function _updateBgMask() {
    // 主题切换后更新蒙版颜色
    setTimeout(() => {
      try {
        const v = parseFloat(localStorage.getItem("java_runner_mask_opacity")||"0.45");
        applyMaskOpacity(v);
      } catch (_) {}
    }, 50);
  }

  // ── 自定义主题编辑器 ──
  const EDIT_VARS = [
    { key: "--bg-primary",   label: "编辑器背景" },
    { key: "--bg-secondary", label: "面板背景" },
    { key: "--text",         label: "正文颜色" },
    { key: "--text-dim",     label: "次要文字" },
    { key: "--accent",       label: "强调色1" },
    { key: "--accent2",      label: "强调色2" },
    { key: "--border",       label: "边框色" },
    { key: "--red",          label: "错误色" },
  ];

  function openCustomEditor(themeId) {
    const modal = document.querySelector("#custom_editor_modal");
    if (!modal) return;
    _editingCustomId = themeId;
    const nameInput = document.querySelector("#custom_theme_name");
    const delBtn = document.querySelector("#btn_delete_custom");
    const fields = document.querySelector("#custom_color_fields");

    if (themeId) {
      delBtn.style.display = "";
      const t = ThemeManager.getCustomThemes().find(t => t.id === themeId);
      if (t) {
        if (nameInput) nameInput.value = t.name;
        if (fields) {
          let html = "";
          EDIT_VARS.forEach(v => {
            const val = t.colors[v.key] || "#000000";
            html += `<div class="color-row"><label>${v.label}</label><input type="color" data-var="${v.key}" value="${val}"><input type="text" data-var-txt="${v.key}" value="${val}"></div>`;
          });
          fields.innerHTML = html;
        }
      }
    } else {
      delBtn.style.display = "none";
      if (nameInput) nameInput.value = "";
      if (fields) {
        // 从当前主题取颜色
        const style = getComputedStyle(document.documentElement);
        let html = "";
        EDIT_VARS.forEach(v => {
          const val = style.getPropertyValue(v.key).trim() || "#000000";
          html += `<div class="color-row"><label>${v.label}</label><input type="color" data-var="${v.key}" value="${val}"><input type="text" data-var-txt="${v.key}" value="${val}"></div>`;
        });
        fields.innerHTML = html;
      }
    }

    // 颜色输入实时预览
    if (fields) {
      fields.querySelectorAll("input[type=color]").forEach(inp => {
        inp.addEventListener("input", () => {
          const txt = fields.querySelector(`[data-var-txt="${inp.dataset.var}"]`);
          if (txt) txt.value = inp.value;
          _previewFromFields(fields);
        });
      });
      fields.querySelectorAll("input[type=text]").forEach(inp => {
        inp.addEventListener("input", () => {
          const clr = fields.querySelector(`[data-var="${inp.dataset.varTxt}"]`);
          if (clr) clr.value = inp.value;
          _previewFromFields(fields);
        });
      });
    }

    modal.style.display = "flex";
  }

  function _previewFromFields(fields) {
    const colors = {};
    fields.querySelectorAll("input[type=color]").forEach(inp => {
      colors[inp.dataset.var] = inp.value;
    });
    ThemeManager.previewColors(colors);
  }

  function closeCustomEditor() {
    document.querySelector("#custom_editor_modal").style.display = "none";
    // 恢复当前主题
    ThemeManager.applyTheme(ThemeManager.getActive());
    _editingCustomId = null;
  }

  function saveCustomEditor() {
    const name = document.querySelector("#custom_theme_name")?.value.trim() || "未命名";
    const fields = document.querySelector("#custom_color_fields");
    if (!fields) return;
    const colors = {};
    fields.querySelectorAll("input[type=color]").forEach(inp => {
      colors[inp.dataset.var] = inp.value;
    });

    if (_editingCustomId) {
      ThemeManager.updateCustom(_editingCustomId, name, colors);
    } else {
      _editingCustomId = ThemeManager.createCustom(name, colors);
    }
    ThemeManager.applyTheme(_editingCustomId);
    closeCustomEditor();
    refreshAppearancePanel();
    _updateBgMask();
  }

  function deleteCustomEditor() {
    if (!_editingCustomId) return;
    ThemeManager.deleteCustom(_editingCustomId);
    closeCustomEditor();
    refreshAppearancePanel();
  }

  // ── 启动时初始化编辑器背景叠加层 ──
  function initBgOverlay() {
    _ensureEditorBgOverlay();
    // 根据上次模式加载背景
    const mode = localStorage.getItem("java_runner_bg_mode") || "image";
    if (mode === "video") {
      _videoList().then(data => {
        if (data.active) _applyEditorVideo(data.active);
      });
      // 恢复填充方式
      try {
        const fill = localStorage.getItem("java_runner_video_fill") || "cover";
        const video = document.querySelector("#editor_bg_video");
        if (video) video.style.objectFit = fill;
      } catch (_) {}
    } else {
      // 恢复图片填充方式
      try {
        const fill = localStorage.getItem("java_runner_image_fill") || "cover";
        const imgDiv = document.querySelector("#editor_bg_image");
        if (imgDiv) { imgDiv.style.backgroundSize = fill; imgDiv.style.backgroundPosition = "center center"; }
      } catch (_) {}
      _bgList().then(data => {
        if (data.active) { _applyEditorBg(data.active); try { localStorage.setItem("java_runner_bg_active_img", data.active); } catch (_) {} }
      });
    }
  }

  return {
    loadConfig, saveConfig, checkJavaPath, scanRelativeJdks, getConfig,
    initPanel, refreshPanel, openPanel, switchTab,
    applyMaskOpacity, initBgOverlay,
    _onThemeChanged: _updateBgMask,
  };
})();
