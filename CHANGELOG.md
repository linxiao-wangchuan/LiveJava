# 更新日志 (CHANGELOG)

> 每次备份自动在这里追加。想看详细备份列表 → [backup_log.md](backup_log.md)

---

## v2.2.1 (2026-07-17)

**新增**: 文件移动功能 — 右键文件弹窗选择目标目录或点击侧栏目录快速移动，Shift+右键重命名文件/目录。
**新增**: 移动模式切换 — 弹窗选择（默认，适合多文件）/ 点击目录（快速，适合少量目录），侧栏开关切换。
**新增**: 说明按钮 — 顶部「说明」弹窗列出全部快捷键和操作方法。
**新增**: 快捷键 — Alt+←→ 切换文件 Tab、Alt+W 关闭 Tab、Ctrl+B 折叠侧栏、Ctrl+S 手动保存、Esc 关闭弹窗。
**优化**: 侧栏折叠后保留 28px 窄条，点击即可展开，不再完全消失。
**优化**: 侧栏全面压缩垂直空间（padding/gap/height 缩减 ~30%），Tab 栏可折叠。
**优化**: 说明弹窗加宽至 600px、关键字放大 2px 更易读。
**调整**: 按钮名 README → 说明。

---

## v2.2.0 (2026-07-16)

**新增**: 编辑器语法预检（CodeMirror lint）— 引号不匹配、缺少分号、括号不匹配、常见拼写错误（Scanner/class/static/void 等 12 组）实时红色/黄色标注。
**新增**: 多 Tab 编辑器 — 多文件/项目模式下每个文件独立 Tab，切换即时不读盘，关闭 Tab 自动保存，全部 Tab 列表持久化到 localStorage 刷新恢复。
**新增**: 热重启不丢状态 — Socket.IO 断开自动无限重连 + 编辑器快照到 localStorage，服务器重启后前端自动恢复。
**新增**: 进程泄漏防护 — server.py 启动时自动 taskkill 残留的 java.exe/javac.exe 孤儿进程。
**优化**: 文件树展开状态持久化 — 用户手动展开/折叠的文件夹记住到 localStorage，刷新页面不再全部收拢。
**优化**: 文件树新建文件后自动展开祖先目录并滚动定位到新文件。
**修复**: WebSocket `Invalid frame header` 控制台刷屏 — 禁用 WebSocket 升级，仅用 polling 传输。
**调整**: backup.py 移除 30 个上限自动清理逻辑，所有历史备份永久保留。

---

## v2.1.3 (2026-07-14)

**修复**: 切文件竞态条件——自动保存改 `await` 串行执行，先等旧文件落盘再加载新文件，杜绝文件内容变空/被覆盖。
**修复**: `loadFileToEditor` 后显式 `clearHistory()`，切换文件后 Ctrl+Z 不再跳回上个文件。
**修复**: `_find_entry` 入口匹配先用相对路径精确比对，再退文件名，解决 `test2/Main.java` 被根目录 `Main.java` 抢走的问题。

---

## v2.1.2 (2026-07-11)

**修复**: `_auto_wrap_all` 三重兜底——裸片段完整包装、有类无package且位于子目录自动补package声明、有类有package原样不动。彻底解决旧版本遗留文件和新创建文件的包名冲突。

**优化**: 发布版根 `README.md` 加入主界面截图（`screenshot.png`），自动从 `main/attachments/` 复制到 `release/` 根目录。

---

## v2.1.1 (2026-07-10)

**修复**: `_auto_wrap_all` 现在根据文件所在目录自动生成 `package` 声明（如 `test/Main.java` → `package test;`），根目录文件无包，彻底解决不同子目录下同名类的编译冲突。

**修复**: `_clean_temp_dir()` 现在清理 `temp/out/` 目录，`reset_workspace()` 也同步清空编译输出，不再残留旧 `.class` 文件。

**修复**: Java 进程加 `-Xmx512m -Xms32m` 堆内存限制，解决 JDK8 在内存大的机器上自动估算出 16GB 堆导致 `Could not create JVM` 的问题。

---

## v2.1.0-release (2026-07-09)

**新增**: GPL v3 协议 — 项目根 `LICENSE` 文件 + 前端底部 `GPL v3` 链接。
**新增**: `release.py` 发布打包脚本 — 一键生成干净发布版（排除 config.json/temp/docs，保留 .git，创建 config.json.example + jdk 指引）。
**调整**: `requirements.txt` 移至 `main/` 目录内，便于 README 引用。
**新增**: `main/attachments/` 目录存放 README 截图资源。
**新增**: `main/README.md` 完整中文用户文档（含截图）+ 项目根 `README.md` 快速指引。
**发布**: 首次推送至 GitHub — `github.com/linxiao-wangchuan/LiveJava`（SSH 认证）。

---

## v2.1.0 (2026-07-08)

**新增**: 批量自动包装——编译时扫描全部 .java 文件，裸片段自动以文件名作类名包装成独立类（Cat.java → `public class Cat { ... }`），彻底解决混合文件编译报错。

**新增**: 三个独立自动包装开关（侧栏）。临时单文件：控制编译时是否包装；临时多文件/项目：仅控制新建文件是否套模板，编译时始终自动包装兜底。

**新增**: 外储模板 `main/java_template.txt`，`${class_name}` 占位符，新建文件自动填类名。用户可自行编辑模板加署名。

**新增**: 文件树目录折叠/展开——顶层展开、深层默认折叠，▶/▼ 箭头独立控制，不影响目录选中。

**新增**: 设置页面 UI 重做——JDK 模式改为横向 Tab 栏（环境/路径/相对），每个模式独立卡片，当前生效路径 + Java 版本双行显示。

**新增**: `active_path` 配置字段，明确记录用户选择的 JDK 路径，解决「选 JDK8 实际跑了 JDK24」的优先级错乱。

**修复**: `resolve_java()` 启动时把检测结果写回 `config.json`，设置页不再显示「未配置」。

**修复**: 路径历史「添加」按钮改为即时写入 `config.json`，不依赖保存按钮，关设置、重启服务器都不丢。

**修复**: 项目目录恢复统一 `_ensure_project_dir()`，覆盖 tree/read/write/create/delete/run 全部 API，debug 重启内存不丢。

**修复**: `reset_workspace()` 加 3 次重试 + 逐文件强制删除，解决 Windows 文件锁导致清空失败。

**优化**: 全部 `prompt`/`confirm`/`alert` 替换为内联交互（确认条、输入条、目录选择器、状态文字）。

**优化**: 控制台 `max-width: 100%` + `overflow-x: auto` + `word-break: break-word`，编辑器 `max-width: 55%` + `overflow: hidden`，长路径不撑变形。

**优化**: 模式切换独立——单文件、多文件、项目模式各存各的，互不污染内容。

---

## v2.0.3 (2026-07-05)

**新增**: 前端工具栏显示 Java 版本（`/api/java-version`）。

**修复**: 设置路径历史——浏览按钮创建 `<option>` 前先追加再赋值，避免 `select.value` 无匹配时失效。

**修复**: WebSocket 500 报错——客户端传输改为 `["polling", "websocket"]` polling 优先。

**新增**: 文件树选中蓝色高亮。点击文件时自动取其父目录作为新建文件/文件夹的目标位置。

**新增**: 内联输入条替代 `prompt()` 弹窗（文件/目录/项目路径输入）。

**新增**: 文件删除（🗑 按钮）+ 清空工作区 + 右键菜单。

**修复**: 多文件/项目模式切文件自动存盘 + 运行前自动存盘。

**修复**: 项目模式 `project_workspace` 补 `create_dir`/`delete` API。

---

## v2.0.2 (2026-07-02)

**修复**: `kill_process()` 加固——先关 stdin 管道、再杀进程、等 3 秒、最后关 stdout/stderr。无限循环能一把摁死。

**修复**: `on_stop_code`/`on_connect`/`on_disconnect` 补 `data=None` 参数。

**修复**: 控制台 `white-space: pre` + `word-break: normal` + `line-height: 1.6`。

**新增**: `changelog.py` 交互式更新日志查看器 + 分页。

---

## v2.0.1 (2026-07-01)

**修复**: 后台线程 emit 请求上下文报错。新增 `_safe_emit()` + 模块级 `_sio` 实例。

---

## v2.0 (2026-07-01)

**重构**: 后端模块化（core/web/workspace），前端 JS 7 模块，CSS 变量主题系统。
**新增**: 三种运行模式、黑白双主题、JDK 三模式设置、左侧栏+文件树、config.json、docs 双文档。

---

## v1.1.1 (2026-07-01)

**修复**: `start.bat` 中文乱码 → 纯 ASCII。

---

## v1.1 (2026-07-01)

**修复**: UTF-8 增量解码器（中文不乱码）+ JVM 编码参数。
**新增**: 自动包装开关 + 导入包区域。

---

## v1.0 (2026-07-01)

**初始版本**: Flask + SocketIO + CodeMirror。写代码→运行→实时输出，Scanner 交互输入。
