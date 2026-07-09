/**
 * 文件树组件（骨架，后续步骤实现具体交互）
 */
const FileTree = (() => {
  let _container = null;
  let _data = [];

  function init(containerSelector) {
    _container = document.querySelector(containerSelector);
  }

  function render(treeData) {
    if (!_container) return;
    _data = treeData;
    _container.innerHTML = _buildTree(treeData);
  }

  function _buildTree(items) {
    if (!items || !items.length) return '<div class="tree-empty">(empty)</div>';
    let html = '<ul class="tree-list">';
    for (const item of items) {
      html += '<li class="tree-item">';
      if (item.type === "dir") {
        html += `<span class="tree-folder">📁 ${_esc(item.name)}</span>`;
        if (item.children) {
          html += _buildTree(item.children);
        }
      } else {
        html += `<span class="tree-file" data-path="${_esc(item.path)}">📄 ${_esc(item.name)}</span>`;
      }
      html += '</li>';
    }
    html += '</ul>';
    return html;
  }

  function _esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return { init, render };
})();
