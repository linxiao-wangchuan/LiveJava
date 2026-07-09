/**
 * 多 Tab 编辑器管理（骨架，后续步骤实现具体交互）
 */
const TabManager = (() => {
  let _tabs = [];
  let _activeIndex = 0;

  function init(containerSelector) {
    // 后续实现 Tab bar 初始化
  }

  function openTab(title, content, path) {
    const existing = _tabs.findIndex(t => t.path === path);
    if (existing >= 0) {
      _activeIndex = existing;
      return;
    }
    _tabs.push({ title, content, path, dirty: false });
    _activeIndex = _tabs.length - 1;
  }

  function closeTab(index) {
    if (_tabs.length <= 1) return;
    _tabs.splice(index, 1);
    if (_activeIndex >= _tabs.length) _activeIndex = _tabs.length - 1;
  }

  function getActive() {
    return _tabs[_activeIndex] || null;
  }

  function getTabs() { return _tabs; }

  return { init, openTab, closeTab, getActive, getTabs };
})();
