// HTML/属性安全工具：禁止裸字符串拼接进 HTML 属性
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 把任意 JS 值序列化为可安全嵌入 HTML 双引号属性内的 JS 字符串字面量。
// 例如 escapeAttrArg("o'brien") => "'o\\u0027brien'"，可直接用在
// onclick="send('foo', ${escapeAttrArg(value)})" 而不会破坏属性边界。
function escapeAttrArg(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // JSON 化后用 \uXXXX 转义所有可能破坏 HTML 属性的字符
  const json = JSON.stringify(String(value));
  // 把 JSON 字符串里的 " 改成单引号包，把单引号、<、>、& 也用 \u 转义
  // 避免 onclick="..." 属性边界冲突
  const inner = json
    .slice(1, -1) // 去掉外层双引号
    .replace(/'/g, '\\u0027')
    .replace(/"/g, '\\u0022')
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  return "'" + inner + "'";
}

module.exports = { escapeHtml, escapeAttrArg };
