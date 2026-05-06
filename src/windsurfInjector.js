'use strict';

// 向 Windsurf 内置扩展 (codeium.windsurf) 的 dist/extension.js 注入最小桥代码，
// 把 ExtensionServer 实例（含 csrfToken）和 LanguageServerManager 实例（含 process.address）
// 暴露到 globalThis.__wfPlusBridge__，供 wf-switch-plus 读取真实 token 消耗数据。
//
// 只做两处单点表达式级替换，不影响业务逻辑。幂等、可回滚。

const vscode = require('vscode');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const WINDSURF_EXT_ID = 'codeium.windsurf';
const BRIDGE_VERSION = 1;
const HEADER_BEGIN = '/* WF_PLUS_WS_BRIDGE_BEGIN_v' + BRIDGE_VERSION + ' */';
const HEADER_END = '/* WF_PLUS_WS_BRIDGE_END_v' + BRIDGE_VERSION + ' */';
const ANY_HEADER_BEGIN = /\/\* WF_PLUS_WS_BRIDGE_BEGIN_v\d+ \*\//;
const ANY_HEADER_END = /\/\* WF_PLUS_WS_BRIDGE_END_v\d+ \*\//;

// 锚点 1：ExtensionServer 构造函数体
// 原：this.csrfToken=A,this._context=e
// 改：this.csrfToken=A,((globalThis.__wfPlusBridge__=globalThis.__wfPlusBridge__||{_version:1}).extensionServer=this),this._context=e
const ANCHOR1_ORIG = 'this.csrfToken=A,this._context=e';
const ANCHOR1_PATCH = 'this.csrfToken=A,((globalThis.__wfPlusBridge__=globalThis.__wfPlusBridge__||{_version:1}).extensionServer=this),this._context=e';

// 锚点 2：LanguageServerManager 创建 connectTransport 处
// 原：baseUrl:`http://${this.process.address}`
// 改：baseUrl:((globalThis.__wfPlusBridge__=globalThis.__wfPlusBridge__||{_version:1}).lsManager=this,`http://${this.process.address}`)
const ANCHOR2_ORIG = 'baseUrl:`http://${this.process.address}`';
const ANCHOR2_PATCH = 'baseUrl:((globalThis.__wfPlusBridge__=globalThis.__wfPlusBridge__||{_version:1}).lsManager=this,`http://${this.process.address}`)';

// 可选的文件头部标记（用来快速识别是否已注入，不参与执行）
function headerBlock() {
  return HEADER_BEGIN + 'var _wfPlusInjected=1;' + HEADER_END;
}

function getWindsurfEntryFile() {
  const ex = vscode.extensions.getExtension(WINDSURF_EXT_ID);
  if (!ex) return null;
  try {
    const main = (ex.packageJSON && ex.packageJSON.main) || 'dist/extension.js';
    return path.join(ex.extensionPath, main.replace(/^\.\//, ''));
  } catch { return null; }
}

function backupFile(file) {
  const bak = file + '.wfplus.bak';
  if (!fsSync.existsSync(bak)) {
    try { fsSync.copyFileSync(file, bak); return bak; } catch { return null; }
  }
  return bak;
}

function restoreFromBackup(file) {
  const bak = file + '.wfplus.bak';
  if (fsSync.existsSync(bak)) {
    try { fsSync.copyFileSync(bak, file); return true; } catch { return false; }
  }
  return false;
}

function removeAnyHeader(s) {
  let out = s;
  let safety = 5;
  while (safety-- > 0) {
    const beginIdx = out.search(ANY_HEADER_BEGIN);
    if (beginIdx < 0) break;
    const after = out.slice(beginIdx);
    const endRel = after.search(ANY_HEADER_END);
    if (endRel < 0) break;
    const endTokenLen = (after.match(ANY_HEADER_END) || [''])[0].length;
    const endAbs = beginIdx + endRel + endTokenLen;
    out = out.slice(0, beginIdx) + out.slice(endAbs);
  }
  return out;
}

async function getStatus() {
  const file = getWindsurfEntryFile();
  if (!file) return { installed: false, injected: false, file: null };
  try {
    const content = await fs.readFile(file, 'utf8');
    const m = content.match(ANY_HEADER_BEGIN);
    const ex = vscode.extensions.getExtension(WINDSURF_EXT_ID);
    const anchor1Count = (content.split(ANCHOR1_ORIG).length - 1);
    const anchor1Patched = content.includes(ANCHOR1_PATCH);
    const anchor2Count = (content.split(ANCHOR2_ORIG).length - 1);
    const anchor2Patched = content.includes(ANCHOR2_PATCH);
    return {
      installed: true,
      injected: !!m,
      file,
      size: content.length,
      windsurfVersion: ex && ex.packageJSON && ex.packageJSON.version || '',
      anchor1: { origCount: anchor1Count, patched: anchor1Patched },
      anchor2: { origCount: anchor2Count, patched: anchor2Patched },
      bridgeMarker: m ? m[0] : '',
    };
  } catch (e) {
    return { installed: true, injected: false, file, error: e.message };
  }
}

async function inject() {
  const file = getWindsurfEntryFile();
  if (!file) return { ok: false, error: '未检测到 ' + WINDSURF_EXT_ID + '（Windsurf 内置扩展）' };
  let content;
  try { content = await fs.readFile(file, 'utf8'); }
  catch (e) { return { ok: false, error: '读取 Windsurf extension.js 失败：' + e.message }; }

  // 幂等：已是当前版本就跳过
  if (content.includes(HEADER_BEGIN) && content.includes(ANCHOR1_PATCH) && content.includes(ANCHOR2_PATCH)) {
    return { ok: true, alreadyInjected: true, file };
  }

  // 清掉旧版本 header
  let next = removeAnyHeader(content);

  // 锚点必须存在且未被其他版本改过
  const a1Count = next.split(ANCHOR1_ORIG).length - 1;
  if (a1Count !== 1) {
    return { ok: false, error: '锚点 1 命中 ' + a1Count + ' 次（期望 1 次）。Windsurf 版本可能变更，请联系插件作者更新。' };
  }
  const a2Count = next.split(ANCHOR2_ORIG).length - 1;
  if (a2Count !== 1) {
    return { ok: false, error: '锚点 2 命中 ' + a2Count + ' 次（期望 1 次）。' };
  }

  // 备份
  backupFile(file);

  // 应用补丁
  next = next.replace(ANCHOR1_ORIG, ANCHOR1_PATCH);
  next = next.replace(ANCHOR2_ORIG, ANCHOR2_PATCH);
  // 头部标记
  next = headerBlock() + '\n' + next;

  try { await fs.writeFile(file, next, 'utf8'); }
  catch (e) {
    // 可能权限不足 — 尝试回滚
    try { restoreFromBackup(file); } catch {}
    return { ok: false, error: '写入 Windsurf extension.js 失败（很可能是权限不足，请以管理员启动 Windsurf 后再试，或退出 Windsurf 后用管理员命令行注入）：' + e.message };
  }
  return { ok: true, file, backup: file + '.wfplus.bak' };
}

async function remove() {
  const file = getWindsurfEntryFile();
  if (!file) return { ok: false, error: '未检测到 Windsurf' };
  // 若有备份，直接从备份还原
  if (restoreFromBackup(file)) {
    return { ok: true, restoredFromBackup: true, file };
  }
  // 没备份则手动逆操作
  let content;
  try { content = await fs.readFile(file, 'utf8'); }
  catch (e) { return { ok: false, error: '读取失败：' + e.message }; }
  let next = removeAnyHeader(content);
  next = next.split(ANCHOR1_PATCH).join(ANCHOR1_ORIG);
  next = next.split(ANCHOR2_PATCH).join(ANCHOR2_ORIG);
  try { await fs.writeFile(file, next, 'utf8'); }
  catch (e) { return { ok: false, error: '写入失败：' + e.message }; }
  return { ok: true, file };
}

module.exports = {
  WINDSURF_EXT_ID,
  BRIDGE_VERSION,
  getWindsurfEntryFile,
  getStatus,
  inject,
  remove,
};
