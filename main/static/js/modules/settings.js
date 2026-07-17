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
  async function _videoUpload(filename, base64Data) {
    const r = await fetch("/api/background-videos/upload", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({filename,data:base64Data}) });
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
    else switchTab("env");
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
      if (!_config) _config = await loadConfig();
      const javaCfg = {...(_config?.java||{})};
      const history = [...(javaCfg.path_history||[])];
      if (!history.find(e => e.path === path)) {
        history.unshift({path, added_at: new Date().toISOString().slice(0,10), invalid_count:0});
        javaCfg.path_history = history;
        await saveConfig({..._config, java:javaCfg});
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
    if (ok) { if(st){st.textContent="✓ 设置已保存";setTimeout(()=>{st.textContent="";},2000);} }
    else { if(st){st.textContent="✗ 保存失败";st.style.color="var(--red)";setTimeout(()=>{st.textContent="";st.style.color="";},3000);} }
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

  async function _refreshBgGrid() {
    const grid = document.querySelector("#bg_grid");
    if (!grid) return;
    const data = await _bgList();
    const active = data.active || "";
    let html = "";
    // "无" 选项：清空背景图
    html += `<div class="bg-card bg-none${!active?" active":""}" data-filename="" title="无背景图">
      <span class="bg-card-tick">✓</span>
      <span style="font-size:10px;line-height:50px;text-align:center;display:block;color:var(--text-dim);">无</span>
    </div>`;
    for (const img of data.images || []) {
      const isActive = img.filename === active;
      const bgStyle = img.thumb ? `background-image:url(data:image/jpeg;base64,${img.thumb})` : "background:var(--bg-tertiary)";
      html += `<div class="bg-card${isActive?" active":""}" style="${bgStyle}" data-filename="${img.filename}" title="${img.filename}">
        <span class="bg-card-tick">✓</span>
        <span class="bg-card-del" data-del="${img.filename}">✕</span>
      </div>`;
    }
    // 保留上传区
    const uploadZone = grid.querySelector(".bg-upload-zone");
    // 清除旧的 bg-card
    grid.querySelectorAll(".bg-card").forEach(c => c.remove());
    if (uploadZone) uploadZone.insertAdjacentHTML("beforebegin", html);
    // 绑定事件
    grid.querySelectorAll(".bg-card").forEach(card => {
      card.addEventListener("click", async (e) => {
        if (e.target.classList.contains("bg-card-del")) {
          await _bgDelete(e.target.dataset.del);
          if (active === e.target.dataset.del) _applyEditorBg("");
          _refreshBgGrid();
          return;
        }
        const fn = card.dataset.filename;
        await _bgActivate(fn);
        _applyEditorBg(fn);
        try { localStorage.setItem("java_runner_bg_active_img", fn); } catch (_) {}
        _refreshBgGrid();
      });
    });
  }

  async function _handleBgFile(file) {
    if (file.size > 50*1024*1024) { alert("图片不能超过 50MB"); return; }
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

  // ── 视频处理 ──
  async function _handleVideoFile(file) {
    if (file.size > 150*1024*1024) { alert("视频不能超过 150MB"); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = await _videoUpload(file.name, reader.result);
      if (result.ok) {
        _refreshVideoGrid();
      }
    };
    reader.readAsDataURL(file);
  }

  async function _refreshVideoGrid() {
    const grid = document.querySelector("#video_grid");
    if (!grid) return;
    const data = await _videoList();
    const active = data.active || "";
    let html = "";
    // "无" 选项
    html += `<div class="bg-card bg-none${!active?" active":""}" data-filename="" title="无背景视频">
      <span class="bg-card-tick">✓</span>
      <span style="font-size:10px;line-height:50px;text-align:center;display:block;color:var(--text-dim);">无</span>
    </div>`;
    for (const v of data.videos || []) {
      const isActive = v.filename === active;
      html += `<div class="bg-card${isActive?" active":""}" style="background:var(--bg-tertiary)" data-filename="${v.filename}" title="${v.filename}">
        <span class="bg-card-tick">✓</span>
        <span style="font-size:18px;line-height:50px;text-align:center;display:block;">🎬</span>
        <span class="bg-card-del" data-del="${v.filename}">✕</span>
      </div>`;
    }
    const uploadZone = grid.querySelector(".bg-upload-zone");
    grid.querySelectorAll(".bg-card").forEach(c => c.remove());
    if (uploadZone) uploadZone.insertAdjacentHTML("beforebegin", html);
    grid.querySelectorAll(".bg-card").forEach(card => {
      card.addEventListener("click", async (e) => {
        if (e.target.classList.contains("bg-card-del")) {
          await _videoDelete(e.target.dataset.del);
          if (active === e.target.dataset.del) _stopVideo();
          _refreshVideoGrid();
          return;
        }
        const fn = card.dataset.filename;
        await _videoActivate(fn);
        if (fn) _applyEditorVideo(fn); else _stopVideo();
        _refreshVideoGrid();
      });
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
    _stopVideo();  // 图片模式，关视频
    const imgDiv = document.querySelector("#editor_bg_image");
    if (!filename) {
      if (imgDiv) imgDiv.style.backgroundImage = "";
      return;
    }
    // 确保 overlay 存在
    _ensureEditorBgOverlay();
    if (imgDiv) imgDiv.style.backgroundImage = `url(/api/backgrounds/file/${encodeURIComponent(filename)})`;
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
      _bgList().then(data => {
        if (data.active) { _applyEditorBg(data.active); try { localStorage.setItem("java_runner_bg_active_img", data.active); } catch (_) {} }
      });
    }
  }

  return {
    loadConfig, saveConfig, checkJavaPath, scanRelativeJdks, getConfig,
    initPanel, refreshPanel, openPanel, switchTab,
    applyMaskOpacity, initBgOverlay,
  };
})();
