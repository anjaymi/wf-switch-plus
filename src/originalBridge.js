const vscode = require('vscode');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const ORIGINAL_ID = 'xy.wf-switch-ext';
const BRIDGE_VERSION = 2;
const BEGIN = '/* WF_PLUS_BRIDGE_BEGIN_v' + BRIDGE_VERSION + ' */';
const END = '/* WF_PLUS_BRIDGE_END_v' + BRIDGE_VERSION + ' */';
// 任意旧版本都用同一个匹配前缀清理
const ANY_BEGIN = /\/\* WF_PLUS_BRIDGE_BEGIN_v\d+ \*\//;
const ANY_END = /\/\* WF_PLUS_BRIDGE_END_v\d+ \*\//;

function buildBridgeSnippet() {
  // 这段代码会被写进原版 extension.js，运行在原版扩展 activate 函数体内
  // 同一文件 module/function scope 里能引用 panelProvider / localSwitchTo / getBundle 等标识符
  return [
    BEGIN,
    'try {',
    '  var _wfFs = require("fs"), _wfPath = require("path"), _wfOs = require("os");',
    '  var _wfDir = _wfPath.join(_wfOs.homedir(), ".wf-account-mgr");',
    '  var _wfFile = _wfPath.join(_wfDir, "wf-shared-state.json");',
    '  var _wfReqFile = _wfPath.join(_wfDir, "wf-bridge-request.json");',
    '  var _wfReplyFile = _wfPath.join(_wfDir, "wf-bridge-reply.json");',
    '  var _wfWatchKeys = { lastEmail: "currentEmail", quotaBaselineV1: "baselines", switchHistory: "switchHistory", myAccountsBundleV1: "bundle" };',
    '  function _wfReadShared() { try { if (_wfFs.existsSync(_wfFile)) return JSON.parse(_wfFs.readFileSync(_wfFile, "utf8")) || {}; } catch (e) {} return {}; }',
    '  function _wfWriteShared(patch) { try { var cur = _wfReadShared(); Object.assign(cur, patch); cur._wfLastSync = Date.now(); cur._wfBridge = "v' + BRIDGE_VERSION + '"; _wfFs.mkdirSync(_wfDir, { recursive: true }); _wfFs.writeFileSync(_wfFile, JSON.stringify(cur, null, 2), "utf8"); } catch (e) {} }',
    '  function _wfWriteReply(obj) { try { _wfFs.mkdirSync(_wfDir, { recursive: true }); _wfFs.writeFileSync(_wfReplyFile, JSON.stringify(Object.assign({ at: Date.now() }, obj), null, 2), "utf8"); } catch (e) {} }',
    '  var _wfOrigUpdate = context.globalState.update.bind(context.globalState);',
    '  context.globalState.update = function(key, value) {',
    '    var p = _wfOrigUpdate(key, value);',
    '    try { if (_wfWatchKeys[key]) { var patch = {}; patch[_wfWatchKeys[key]] = value; _wfWriteShared(patch); } } catch (e) {}',
    '    return p;',
    '  };',
    '  setTimeout(function() {',
    '    try {',
    '      var snap = {};',
    '      Object.keys(_wfWatchKeys).forEach(function(k) { var v = context.globalState.get(k); if (v !== undefined) snap[_wfWatchKeys[k]] = v; });',
    '      _wfWriteShared(snap);',
    '    } catch (e) {}',
    '  }, 1500);',
    '  // 请求轮询：伴生插件写入 wf-bridge-request.json，原版桥代码读到后执行原版函数',
    '  var _wfLastReq = 0;',
    '  setInterval(function() {',
    '    try {',
    '      if (!_wfFs.existsSync(_wfReqFile)) return;',
    '      var st = _wfFs.statSync(_wfReqFile);',
    '      if (!st || !st.mtimeMs || st.mtimeMs === _wfLastReq) return;',
    '      _wfLastReq = st.mtimeMs;',
    '      var req = {};',
    '      try { req = JSON.parse(_wfFs.readFileSync(_wfReqFile, "utf8")) || {}; } catch (e) { return; }',
    '      var action = req.action || "";',
    '      if (action === "refreshAccounts") {',
    '        try { if (typeof panelProvider !== "undefined" && panelProvider) { panelProvider.refresh(); panelProvider.loadAccounts(); _wfWriteReply({ action: action, ok: true }); } else { _wfWriteReply({ action: action, ok: false, error: "panelProvider 未就绪" }); } } catch (e) { _wfWriteReply({ action: action, ok: false, error: e && e.message }); }',
    '      } else if (action === "localSwitchTo" && req.email) {',
    '        try {',
    '          var bundle = (typeof getBundle === "function") ? getBundle(context) : null;',
    '          if (!bundle || !bundle.accounts || !bundle.accounts.length) { _wfWriteReply({ action: action, ok: false, error: "bundle 为空" }); return; }',
    '          var acc = bundle.accounts.find(function(a){ return a && a.email && String(a.email).toLowerCase() === String(req.email).toLowerCase(); });',
    '          if (!acc) { _wfWriteReply({ action: action, ok: false, error: "未找到 " + req.email }); return; }',
    '          if (typeof localSwitchTo !== "function") { _wfWriteReply({ action: action, ok: false, error: "localSwitchTo 不可用" }); return; }',
    '          Promise.resolve(localSwitchTo(context, acc)).then(function(r) { _wfWriteReply({ action: action, ok: !!(r && r.ok !== false), result: r, email: req.email }); }, function(e) { _wfWriteReply({ action: action, ok: false, error: e && e.message }); });',
    '        } catch (e) { _wfWriteReply({ action: action, ok: false, error: e && e.message }); }',
    '      } else if (action === "doSwitch") {',
    '        try { if (typeof doSwitch === "function") { Promise.resolve(doSwitch(req.email || undefined, req.opts || {})).then(function(){ _wfWriteReply({ action: action, ok: true }); }, function(e){ _wfWriteReply({ action: action, ok: false, error: e && e.message }); }); } else { _wfWriteReply({ action: action, ok: false, error: "doSwitch 不可用" }); } } catch (e) { _wfWriteReply({ action: action, ok: false, error: e && e.message }); }',
    '      }',
    '    } catch (e) {}',
    '  }, 800);',
    '} catch (e) { console.warn("[wf-switch][plus-bridge] inject failed:", e && e.message); }',
    END,
  ].join('\n');
}

function getOriginalEntryFile() {
  const ext = vscode.extensions.getExtension(ORIGINAL_ID);
  if (!ext) return null;
  try {
    const main = (ext.packageJSON && ext.packageJSON.main) || './extension.js';
    return path.join(ext.extensionPath, main.replace(/^\.\//, ''));
  } catch { return null; }
}

function stripExistingBridge(content) {
  // 删除任意历史版本桥代码
  let out = content;
  let safety = 5;
  while (safety-- > 0) {
    const begin = out.search(ANY_BEGIN);
    if (begin < 0) break;
    const after = out.slice(begin);
    const endRel = after.search(ANY_END);
    if (endRel < 0) break;
    const endTokenLen = (after.match(ANY_END) || [''])[0].length;
    const endAbs = begin + endRel + endTokenLen;
    out = out.slice(0, begin) + out.slice(endAbs);
    out = out.replace(/^\s*\n/, ''); // 收掉残留空行
  }
  return out;
}

async function getStatus() {
  const file = getOriginalEntryFile();
  if (!file) return { installed: false, injected: false, file: null, version: null };
  try {
    const content = await fs.readFile(file, 'utf8');
    const m = content.match(ANY_BEGIN);
    const ext = vscode.extensions.getExtension(ORIGINAL_ID);
    return {
      installed: true,
      injected: !!m,
      file,
      version: (ext && ext.packageJSON && ext.packageJSON.version) || '',
      bridgeMarker: m ? m[0] : '',
      currentBridgeMarker: BEGIN,
    };
  } catch (e) {
    return { installed: true, injected: false, file, version: '', error: e.message };
  }
}

async function injectBridge() {
  const file = getOriginalEntryFile();
  if (!file) return { ok: false, error: '未检测到原版插件 ' + ORIGINAL_ID };
  let content;
  try { content = await fs.readFile(file, 'utf8'); }
  catch (e) { return { ok: false, error: '读取原版 extension.js 失败：' + e.message }; }
  // 如果当前桥已是最新版，跳过
  if (content.includes(BEGIN) && content.includes(END)) {
    return { ok: true, alreadyInjected: true, file };
  }
  // 移除旧版本桥
  let next = stripExistingBridge(content);
  // 寻找 activate 函数体起点
  const re = /(function\s+activate\s*\(\s*context\s*\)\s*\{)/;
  const m = next.match(re);
  if (!m) return { ok: false, error: '未找到 activate(context) 入口，无法注入桥' };
  const insertAt = m.index + m[0].length;
  const snippet = '\n' + buildBridgeSnippet() + '\n';
  next = next.slice(0, insertAt) + snippet + next.slice(insertAt);
  try { await fs.writeFile(file, next, 'utf8'); }
  catch (e) { return { ok: false, error: '写入原版 extension.js 失败（可能权限不足）：' + e.message }; }
  return { ok: true, file };
}

async function removeBridge() {
  const file = getOriginalEntryFile();
  if (!file) return { ok: false, error: '未检测到原版插件 ' + ORIGINAL_ID };
  let content;
  try { content = await fs.readFile(file, 'utf8'); }
  catch (e) { return { ok: false, error: '读取失败：' + e.message }; }
  if (!ANY_BEGIN.test(content)) return { ok: true, removed: false, file };
  const next = stripExistingBridge(content);
  await fs.writeFile(file, next, 'utf8');
  return { ok: true, removed: true, file };
}

// 在原版已安装但未注入或版本不一致时自动注入
async function ensureBridgeAuto() {
  const file = getOriginalEntryFile();
  if (!file) return { ok: false, skipped: true };
  if (!fsSync.existsSync(file)) return { ok: false, skipped: true };
  try {
    const content = fsSync.readFileSync(file, 'utf8');
    if (content.includes(BEGIN) && content.includes(END)) return { ok: true, alreadyInjected: true };
  } catch { /* fallthrough */ }
  return injectBridge();
}

module.exports = { ORIGINAL_ID, BRIDGE_VERSION, getStatus, injectBridge, removeBridge, ensureBridgeAuto, getOriginalEntryFile };
