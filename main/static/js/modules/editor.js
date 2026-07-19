/**
 * CodeMirror 编辑器管理 — 支持语法预检 (lint)
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
    lint: { getAnnotations: javaLint, async: false },
    extraKeys: {
      "Ctrl-/": "toggleComment",
      "Cmd-/": "toggleComment",
    },
  };

  // ── Java 基础语法检测 ──
  function javaLint(text) {
    const found = [];
    if (!text || !text.trim()) return found;

    const lines = text.split("\n");
    let braceDepth = 0;
    let parenDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      const lineNum = i; // 0-indexed for CodeMirror

      // 跳过空行和纯注释行
      if (!line || line.startsWith("//") || line.startsWith("*") || line === "*/") {
        continue;
      }

      // 跳过 import / package / annotation
      if (line.startsWith("import ") || line.startsWith("package ") || line.startsWith("@")) {
        continue;
      }

      // ── 引号不匹配 ──
      // 统计行内的双引号（忽略转义的）
      const quotes = (line.match(/(?<!\\)"/g) || []).length;
      if (quotes % 2 !== 0) {
        found.push({
          from: CodeMirror.Pos(lineNum, 0),
          to:   CodeMirror.Pos(lineNum, line.length),
          message: "引号不匹配 — 缺少 \" 或多了 \"",
          severity: "error",
        });
        continue; // 引号有问题时跳过后面的检查
      }

      // ── 去除字符串字面量后再检查 ──
      const stripped = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');

      // ── 缺少分号 ──
      const lastChar = stripped.slice(-1);
      const looksLikeStatement =
        lastChar !== ";" &&
        lastChar !== "{" &&
        lastChar !== "}" &&
        lastChar !== "(" &&
        lastChar !== ")" &&
        lastChar !== "," &&
        !stripped.endsWith("*/") &&
        !stripped.startsWith("//") &&
        !stripped.startsWith("/*") &&
        !stripped.startsWith("* ") &&
        line.length > 1;

      if (looksLikeStatement) {
        // 排除一些不需要分号的行
        const isControl =
          /^(if|else|for|while|do|switch|case|default|try|catch|finally|synchronized)\b/.test(stripped) &&
          (stripped.endsWith("{") || stripped.endsWith("}") || line.endsWith("{"));
        const isClassOrMethod =
          /^(public|private|protected|static|class|interface|enum|void|int|boolean|String|double|float|char|long|short|byte)\s/.test(stripped) &&
          line.endsWith("{");
        const isAnnotation = line.startsWith("@");

        if (!isControl && !isClassOrMethod && !isAnnotation) {
          found.push({
            from: CodeMirror.Pos(lineNum, raw.length),
            to:   CodeMirror.Pos(lineNum, raw.length),
            message: "可能缺少分号 ;",
            severity: "warning",
          });
        }
      }

      // ── 括号/大括号深度追踪 ──
      for (const ch of stripped) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
        if (ch === "(") parenDepth++;
        if (ch === ")") parenDepth--;
      }

      // ── 明显的拼写错误（用单词边界避免子串误匹配，如 clas 不应在 class 里命中） ──
      const typos = [
        { wrong: "Scannner", right: "Scanner" },
        { wrong: "system.out", right: "System.out" },
        { wrong: "system.in", right: "System.in" },
        { wrong: "pubic", right: "public" },
        { wrong: "prnitln", right: "println" },
        { wrong: "prnit", right: "print" },
      ];
      for (const t of typos) {
        const idx = raw.indexOf(t.wrong);
        if (idx >= 0) {
          found.push({
            from: CodeMirror.Pos(lineNum, idx),
            to:   CodeMirror.Pos(lineNum, idx + t.wrong.length),
            message: `拼写错误？你是想写 "${t.right}" 吗？`,
            severity: "warning",
          });
        }
      }

      // 单词级拼写检查（\b 边界，避免 clas 误匹配 class）
      const wordTypos = [
        { wrong: "Sting", right: "String" },
        { wrong: "clas", right: "class" },
        { wrong: "stati", right: "static" },
        { wrong: "viod", right: "void" },
        { wrong: "lenght", right: "length" },
        { wrong: "Legnth", right: "length" },
      ];
      for (const t of wordTypos) {
        const re = new RegExp("\\b" + t.wrong + "\\b");
        const m = raw.match(re);
        if (m) {
          found.push({
            from: CodeMirror.Pos(lineNum, m.index),
            to:   CodeMirror.Pos(lineNum, m.index + t.wrong.length),
            message: `拼写错误？你是想写 "${t.right}" 吗？`,
            severity: "warning",
          });
        }
      }
    }

    // ── 全局括号不匹配 ──
    if (braceDepth > 0) {
      found.push({
        from: CodeMirror.Pos(0, 0),
        to:   CodeMirror.Pos(0, 0),
        message: `大括号不匹配：多了 ${braceDepth} 个 { 没有对应的 }`,
        severity: "error",
      });
    } else if (braceDepth < 0) {
      found.push({
        from: CodeMirror.Pos(0, 0),
        to:   CodeMirror.Pos(0, 0),
        message: `大括号不匹配：多了 ${Math.abs(braceDepth)} 个 } 没有对应的 {`,
        severity: "error",
      });
    }
    if (parenDepth !== 0) {
      found.push({
        from: CodeMirror.Pos(lines.length - 1, 0),
        to:   CodeMirror.Pos(lines.length - 1, 0),
        message: `括号不匹配，检查 ( 和 ) 数量`,
        severity: "error",
      });
    }

    return found;
  }

  // 注册 lint helper
  if (typeof CodeMirror !== "undefined" && CodeMirror.registerHelper) {
    CodeMirror.registerHelper("lint", "text/x-java", javaLint);
  }

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

  // ── Tab 模式代理 ──
  let _tabMode = false;

  function useTabMode() {
    _tabMode = true;
    // 隐藏单文件编辑器的 CodeMirror 包装元素
    if (_cm) {
      const wrapper = _cm.getWrapperElement();
      if (wrapper) wrapper.style.display = "none";
    }
  }

  function useSingleMode() {
    _tabMode = false;
    // 恢复单文件编辑器的 CodeMirror 包装元素
    if (_cm) {
      const wrapper = _cm.getWrapperElement();
      if (wrapper) wrapper.style.display = "";
      _cm.refresh();
    }
  }

  function _activeEditor() {
    if (_tabMode && typeof TabManager !== "undefined" && TabManager.isEnabled()) {
      const ed = TabManager.getActiveEditor();
      if (ed) return ed;
    }
    return _cm;
  }

  function getValue()       { const e = _activeEditor(); return e ? e.getValue() : ""; }
  function setValue(code)   { const e = _activeEditor(); if (e) e.setValue(code); }
  function focus()          { const e = _activeEditor(); if (e) e.focus(); }
  function setCursor(line)  { const e = _activeEditor(); if (e) e.setCursor(line, 0); }
  function getLineCount()   { const e = _activeEditor(); return e ? e.lineCount() : 0; }
  function get()            { return _activeEditor(); }

  function onChange(fn)     { if (_cm) _cm.on("change", fn); }

  // 创建一个独立的 CodeMirror 实例（Tab 用）
  function createInstance(container, initialCode) {
    const cfg = Object.assign({}, DEFAULTS);
    // 跟随当前 CodeMirror 主题，避免亮色/暗色混乱
    if (_cm && _cm.getOption("theme")) {
      cfg.theme = _cm.getOption("theme");
    }
    const cm = CodeMirror(container, cfg);
    cm.setValue(initialCode || "");
    cm.setSize("100%", "100%");
    return cm;
  }

  return { init, getValue, setValue, focus, setCursor, getLineCount, get, onChange,
           createInstance, useTabMode, useSingleMode };
})();
