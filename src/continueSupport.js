const vscode = require('vscode');
const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { recordContinueTokenUsage } = require('./tokenEstimator');
const { getContinueDialogHtml } = require('./continueDialogHtml');
const { isEndConversationText, savePastedImage, writeContinueRequest, buildContinuePrompt } = require('./continueAttachments');
const { getWorkspaceInfo, registerContinueWindow, unregisterContinueWindow, ensureWfContinuePortFile } = require('./continueRegistry');
const { installBuiltinContinuePs1, configureWfContinueGlobalRules, copyClaudeContextMcpConfig, getContinueScriptPath } = require('./continueRules');
const { CONTINUE_DIALOG } = require('./shared/messageTypes');

let continueHttpServer = null;
let activeContinueRequest = null;
let continueHttpPort = null;
let manualContinuePanel = null;
let continueRegistryTimer = null;
let getInstanceId = () => 'unknown';

const WF_CONTINUE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'wf-switch-continue');
const WF_CONTINUE_PORT = 34501;
const WF_CONTINUE_PORT_END = 34550;
const WF_SECRET_FILE = path.join(WF_CONTINUE_DIR, '.wf_switch_continue_secret');

function initContinueSupport(options = {}) {
  if (typeof options.getInstanceId === 'function') getInstanceId = options.getInstanceId;
}

function openContinueDialog(context, requestContext = {}) {
  if (!requestContext.httpMode && manualContinuePanel) {
    try {
      manualContinuePanel.reveal(vscode.ViewColumn.Beside);
      return undefined;
    } catch {
      try {
        manualContinuePanel.reveal(vscode.ViewColumn.Active);
        return undefined;
      } catch {
        manualContinuePanel = null;
      }
    }
  }
  let panel;
  try {
    panel = vscode.window.createWebviewPanel('wfSwitchContinue', 'WF 继续对话/上传附件', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
  } catch (_) {
    panel = vscode.window.createWebviewPanel('wfSwitchContinue', 'WF 继续对话/上传附件', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  }
  if (!requestContext.httpMode) manualContinuePanel = panel;
  const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
  const autoReply = {
    enabled: !!cfg.get('autoReplyEnabled', false) && !!requestContext.httpMode,
    text: String(cfg.get('autoReplyText', '继续') || '继续'),
    delaySec: Math.max(0, Math.min(60, Number(cfg.get('autoReplyDelaySec', 3) || 0))),
  };
  panel.webview.html = getContinueDialogHtml({
    workspace: getWorkspaceInfo(),
    requestContext,
    port: continueHttpPort || WF_CONTINUE_PORT,
    autoReply,
  });
  let settled = false;
  let resolveResult = null;
  const resultPromise = new Promise(resolve => { resolveResult = resolve; });
  const finish = result => {
    if (settled) return;
    settled = true;
    resolveResult(result);
  };
  panel.onDidDispose(() => {
    if (manualContinuePanel === panel) manualContinuePanel = null;
    finish({ should_continue: false, user_instruction: '', image_paths: [], attached_files: [] });
  }, null, context.subscriptions);
  panel.webview.onDidReceiveMessage(async msg => {
    try {
      if (msg.type === CONTINUE_DIALOG.READY) {
        panel.webview.postMessage({ type: CONTINUE_DIALOG.STATUS, text: '弹窗脚本已就绪' });
      } else if (msg.type === CONTINUE_DIALOG.PICK_FILES) {
        const isImage = msg.kind === 'image';
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          openLabel: isImage ? '选择图片' : '选择文件',
          filters: isImage ? { 图片: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] } : undefined,
        });
        panel.webview.postMessage({ type: CONTINUE_DIALOG.PICKED_FILES, kind: msg.kind || 'file', paths: (uris || []).map(u => u.fsPath) });
      } else if (msg.type === CONTINUE_DIALOG.PASTED_IMAGE) {
        const item = await savePastedImage(msg.dataUrl);
        panel.webview.postMessage({ type: CONTINUE_DIALOG.PASTED_IMAGE_SAVED, item });
        panel.webview.postMessage({ type: CONTINUE_DIALOG.STATUS, text: '图片已添加' });
      } else if (msg.type === CONTINUE_DIALOG.SUBMIT_CONTINUE) {
        await handleContinueSubmit(panel, requestContext, msg, finish);
      }
    } catch (e) {
      const text = e && e.message ? e.message : String(e);
      panel.webview.postMessage({ type: 'error', text });
      vscode.window.showErrorMessage('继续对话操作失败: ' + text);
    }
  }, null, context.subscriptions);
  return requestContext.httpMode ? resultPromise : undefined;
}

async function handleContinueSubmit(panel, requestContext, msg, finish) {
  const instruction = String(msg.instruction || '').trim();
  const action = msg.action === 'end' || isEndConversationText(instruction) ? 'end' : 'continue';
  const selectedAttachments = (Array.isArray(msg.attachments) ? msg.attachments : []).map(a => ({
    type: a.type || (/\.(png|jpe?g|gif|bmp|webp|svg|ico)$/i.test(a.path || '') ? 'image' : 'file'),
    mode: msg.mode || 'path',
    path: a.path,
  }));
  const pastedAttachments = (Array.isArray(msg.pastedImages) ? msg.pastedImages : []).map(a => {
    if (msg.imageMode === 'base64') return { ...a, mode: 'base64' };
    const { base64, ...rest } = a || {};
    return { ...rest, mode: 'path' };
  });
  const attachments = [...selectedAttachments, ...pastedAttachments];
  const payload = {
    action,
    instruction: action === 'end' ? '' : (instruction || '继续'),
    attachments: action === 'end' ? [] : attachments,
    mode: msg.mode || 'path',
    imageMode: msg.imageMode || 'path',
    createdAt: new Date().toISOString(),
    source: 'wf-switch-ext',
  };
  if (action === 'end') {
    if (!requestContext.httpMode) {
      const file = await writeContinueRequest(payload);
      vscode.window.showInformationMessage(`手动调试已写入结束状态: ${file}`);
    }
    finish({ should_continue: false, user_instruction: '', image_paths: [], attached_files: [] });
    panel.dispose();
    return;
  }
  if (requestContext.httpMode) {
    panel.webview.postMessage({ type: CONTINUE_DIALOG.STATUS, text: '已提交给当前 Cascade 对话' });
  } else {
    const file = await writeContinueRequest(payload);
    await vscode.env.clipboard.writeText(buildContinuePrompt(payload));
    panel.webview.postMessage({ type: CONTINUE_DIALOG.STATUS, text: `手动调试已写入并复制: ${file}` });
    vscode.window.showInformationMessage(`手动调试已写入结构化请求并复制 Prompt: ${file}`);
  }
  finish({
    should_continue: true,
    user_instruction: instruction || requestContext.reason || '继续',
    image_paths: attachments.filter(a => a.type === 'image' && a.path).map(a => a.path),
    attached_files: attachments.filter(a => a.type !== 'image' && a.path).map(a => a.path),
  });
  if (requestContext.httpMode) panel.dispose();
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data || {});
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

async function readWfContinueSecret() {
  try {
    if (!fsSync.existsSync(WF_SECRET_FILE)) return '';
    return String(await fs.readFile(WF_SECRET_FILE, 'utf8')).trim();
  } catch {
    return '';
  }
}

async function installContinueSupport(context) {
  await installBuiltinContinuePs1();
  if (!continueHttpServer) startContinueHttpServer(context);
  const r = await configureWfContinueGlobalRules();
  if (!r.ok) return r;
  return { ok: true, file: r.file, port: continueHttpPort || WF_CONTINUE_PORT, script: getContinueScriptPath() };
}

function withTimeout(promise, ms, fallback) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(v => {
      clearTimeout(timer);
      resolve(v);
    }, () => {
      clearTimeout(timer);
      resolve(fallback);
    });
  });
}

function startContinueHttpServer(context) {
  if (continueHttpServer) return;
  let port = WF_CONTINUE_PORT;
  continueHttpServer = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Secret',
        });
        res.end();
        return;
      }
      if (req.method !== 'POST' || !String(req.url || '').startsWith('/continue')) {
        sendJson(res, 404, { error: 'not_found' });
        return;
      }
      const expectedSecret = await readWfContinueSecret();
      const actualSecret = String(req.headers['x-auth-secret'] || '').trim();
      if (expectedSecret && actualSecret && expectedSecret !== actualSecret) {
        sendJson(res, 401, { should_continue: false, error: 'invalid_secret' });
        return;
      }
      if (activeContinueRequest) {
        sendJson(res, 409, { should_continue: false, error: 'continue_dialog_busy' });
        return;
      }
      const body = await readRequestBody(req);
      try { await recordContinueTokenUsage(body); } catch (e) { console.warn('[wfSwitch] token usage record failed:', e.message); }
      activeContinueRequest = openContinueDialog(context, {
        httpMode: true,
        reason: body.reason || '',
        details: body.details || body.reason || '',
        workspace: body.workspace || '',
      });
      const result = await withTimeout(activeContinueRequest, 295000, {
        should_continue: false,
        error: 'timeout',
        user_instruction: '',
        image_paths: [],
        attached_files: [],
      });
      activeContinueRequest = null;
      sendJson(res, 200, result || { should_continue: false });
    } catch (e) {
      activeContinueRequest = null;
      sendJson(res, 500, { should_continue: false, error: e && e.message ? e.message : String(e) });
    }
  });
  continueHttpServer.on('error', e => {
    console.warn('[wfSwitch] continue http server failed:', e.message);
  });
  listenContinueServer(port);
}

function listenContinueServer(port) {
  continueHttpServer.once('error', e => {
    if (e && e.code === 'EADDRINUSE' && port < WF_CONTINUE_PORT_END) {
      listenContinueServer(port + 1);
      return;
    }
    console.warn('[wfSwitch] continue http server failed:', e.message);
    continueHttpServer = null;
  });
  continueHttpServer.listen(port, '127.0.0.1', () => {
    continueHttpPort = port;
    console.log(`[wfSwitch] continue http server listening on 127.0.0.1:${port}`);
    ensureWfContinuePortFile(port).catch(() => {});
    registerContinueWindow(port, getInstanceId()).catch(() => {});
    if (continueRegistryTimer) clearInterval(continueRegistryTimer);
    continueRegistryTimer = setInterval(() => registerContinueWindow(port, getInstanceId()).catch(() => {}), 30000);
  });
}

function stopContinueHttpServer() {
  if (!continueHttpServer) return;
  if (continueRegistryTimer) clearInterval(continueRegistryTimer);
  continueRegistryTimer = null;
  unregisterContinueWindow(getInstanceId()).catch(() => {});
  try { continueHttpServer.close(); } catch {}
  continueHttpServer = null;
  activeContinueRequest = null;
  continueHttpPort = 0;
}

module.exports = {
  initContinueSupport,
  openContinueDialog,
  installContinueSupport,
  installBuiltinContinuePs1,
  configureWfContinueGlobalRules,
  copyClaudeContextMcpConfig,
  startContinueHttpServer,
  stopContinueHttpServer,
  getContinueScriptPath,
};

