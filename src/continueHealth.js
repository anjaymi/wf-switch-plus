const fs = require('fs').promises;
const fsSync = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');

const WF_CONTINUE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'wf-switch-continue');
const WF_CONTINUE_PS1 = path.join(WF_CONTINUE_DIR, 'wf-switch-continue.ps1');
const WF_PORT_FILE = path.join(WF_CONTINUE_DIR, '.wf_switch_continue_port');
const WF_WINDOWS_FILE = path.join(WF_CONTINUE_DIR, 'windows.json');
const WINDSURF_GLOBAL_RULES_FILE = path.join(os.homedir(), '.codeium', 'windsurf', 'memories', 'global_rules.md');

function readText(file) {
  try { return fsSync.existsSync(file) ? fsSync.readFileSync(file, 'utf8') : ''; } catch { return ''; }
}

function readPort() {
  const text = readText(WF_PORT_FILE).trim();
  const port = Number(text);
  return Number.isInteger(port) && port > 0 ? port : 0;
}

function canConnect(port, timeoutMs = 700) {
  return new Promise(resolve => {
    if (!port) { resolve(false); return; }
    const socket = new net.Socket();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function readFreshWindows() {
  try {
    if (!fsSync.existsSync(WF_WINDOWS_FILE)) return [];
    const data = JSON.parse(await fs.readFile(WF_WINDOWS_FILE, 'utf8'));
    const now = Date.now();
    return (Array.isArray(data.windows) ? data.windows : []).filter(w => w && now - Number(w.updatedAtMs || 0) < 120000);
  } catch {
    return [];
  }
}

async function checkContinueHealth() {
  const scriptExists = fsSync.existsSync(WF_CONTINUE_PS1);
  const scriptText = readText(WF_CONTINUE_PS1);
  const scriptLooksValid = /BEGIN USER INSTRUCTION|last_instruction|\/continue/.test(scriptText);
  const rulesText = readText(WINDSURF_GLOBAL_RULES_FILE);
  const rulesInstalled = rulesText.includes('PRIORITY RULE - wf-switch-continue') && rulesText.includes('wf-switch-continue.ps1');
  const port = readPort();
  const httpReachable = await canConnect(port);
  const windows = await readFreshWindows();
  const issues = [];
  if (!scriptExists) issues.push('持续对话脚本缺失');
  else if (!scriptLooksValid) issues.push('持续对话脚本内容异常');
  if (!rulesInstalled) issues.push('全局继续对话规则缺失或不是最新版');
  if (!port) issues.push('本地 HTTP 端口文件缺失');
  else if (!httpReachable) issues.push(`本地 HTTP 端口不可连接: ${port}`);
  if (!windows.length) issues.push('当前窗口未注册到持续对话窗口表');
  return {
    ok: issues.length === 0,
    issues,
    script: WF_CONTINUE_PS1,
    rules: WINDSURF_GLOBAL_RULES_FILE,
    port,
    portFile: WF_PORT_FILE,
    windowsFile: WF_WINDOWS_FILE,
    httpReachable,
    windowsCount: windows.length,
  };
}

function formatContinueHealthReport(health) {
  const h = health || {};
  return [
    `持续对话质检: ${h.ok ? '通过' : '异常'}`,
    `脚本: ${h.script || WF_CONTINUE_PS1}`,
    `规则: ${h.rules || WINDSURF_GLOBAL_RULES_FILE}`,
    `端口: ${h.port || '未检测到'}`,
    `HTTP: ${h.httpReachable ? '可连接' : '不可连接'}`,
    `窗口注册: ${h.windowsCount || 0}`,
    `问题: ${(h.issues || []).length ? h.issues.join('；') : '无'}`,
  ].join('\n');
}

module.exports = { checkContinueHealth, formatContinueHealthReport };
