const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

async function hackWindsurf() {
  const candidates = [
    path.join(vscode.env.appRoot, 'extensions/windsurf/dist/extension.js'),
    path.join(vscode.env.appRoot, '../_/resources/app/extensions/windsurf/dist/extension.js'),
  ];
  let modified = false;
  for (const p of candidates) {
    try { await fs.access(p); } catch { continue; }
    let content = await fs.readFile(p, 'utf-8');
    if (content.includes('handleAuthToken(acc)')) continue;

    const RE = /LOGIN_WITH_AUTH_TOKEN,\(\)=>\{(\w+)\.provideAuthToken\(\)\}/;
    const m = content.match(RE);
    if (!m) continue;
    const v = m[1];
    content = content.replace(RE, `LOGIN_WITH_AUTH_TOKEN,(acc)=>{acc?${v}.handleAuthToken(acc):${v}.provideAuthToken()}`);
    if (content.includes(`${v}.handleAuthToken(acc)`)) {
      await fs.writeFile(p, content);
      modified = true;
    }
  }
  return modified;
}

async function resetDeviceFingerprint() {
  const result = { ok: true, files: [], errors: [] };
  try {
    const platform = process.platform;
    let baseDir;
    if (platform === 'win32') {
      baseDir = path.join(process.env.APPDATA || '', 'Windsurf');
    } else if (platform === 'darwin') {
      baseDir = path.join(os.homedir(), 'Library', 'Application Support', 'Windsurf');
    } else {
      baseDir = path.join(os.homedir(), '.config', 'Windsurf');
    }

    const sha256 = () => crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
    const sha512 = () => crypto.createHash('sha512').update(crypto.randomBytes(64)).digest('hex');
    const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (crypto.randomBytes(1)[0] & 0x0f) | (c === 'x' ? 0 : 0x40);
      return (c === 'x' ? r & 0x0f : (r & 0x03) | 0x08).toString(16);
    });

    const newMachineId    = sha256();
    const newMacMachineId = sha512();
    const newDevDeviceId  = uuid();
    const newSqmId        = `{${uuid().toUpperCase()}}`;
    const nowUtc          = new Date().toUTCString();

    const storagePath = path.join(baseDir, 'User', 'globalStorage', 'storage.json');
    try {
      let data = {};
      try { data = JSON.parse(await fs.readFile(storagePath, 'utf-8')); } catch (_) {}
      data['telemetry.machineId']          = newMachineId;
      data['telemetry.devDeviceId']        = newDevDeviceId;
      data['telemetry.sqmId']              = newSqmId;
      data['telemetry.macMachineId']       = newMacMachineId;
      data['telemetry.firstSessionDate']   = nowUtc;
      data['telemetry.currentSessionDate'] = nowUtc;
      await fs.writeFile(storagePath, JSON.stringify(data, null, 2));
      result.files.push('storage.json');
    } catch (e) { result.errors.push('storage.json: ' + e.message); }

    try {
      await fs.writeFile(path.join(baseDir, 'machineid'), newMachineId);
      result.files.push('machineid');
    } catch (_) {}

    return result;
  } catch (e) {
    console.error('[wfSwitch] 重置指纹失败:', e.message);
    result.ok = false;
    result.errors.push(e.message);
    return result;
  }
}

async function tryActivateWindsurfExtensions() {
  try {
    const exts = vscode.extensions.all.filter(e => /windsurf|codeium/i.test(e.id));
    for (const ext of exts) {
      if (!ext.isActive) {
        try { await ext.activate(); } catch (e) { console.log('[wfSwitch] activate', ext.id, 'failed:', e.message); }
      }
    }
  } catch (e) { console.log('[wfSwitch] tryActivateWindsurfExtensions error:', e.message); }
}

async function waitForLoginCommand(timeoutMs = 30000, tag = '') {
  const start = Date.now();
  let lastNotify = 0;
  await tryActivateWindsurfExtensions();
  while (Date.now() - start < timeoutMs) {
    const cmds = await vscode.commands.getCommands(true);
    if (cmds.includes('windsurf.loginWithAuthToken')) return true;
    const elapsed = Date.now() - start;
    if (elapsed - lastNotify >= 10000) {
      lastNotify = elapsed;
      await tryActivateWindsurfExtensions();
      if (tag) {
        vscode.window.setStatusBarMessage(`⏳ ${tag}：等待 Windsurf 命令就绪 ${Math.round(elapsed/1000)}s / ${Math.round(timeoutMs/1000)}s…`, 3000);
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function checkLoginStatus() {
  try {
    const session = await vscode.authentication.getSession('codeium', [], { createIfNone: false });
    if (session) {
      return { isLoggedIn: true, currentUser: session.account?.label || session.account?.id || '' };
    }
  } catch (e) {
    console.log('[wfSwitch] checkLoginStatus error:', e.message);
  }
  return { isLoggedIn: false };
}

async function loginWithAuthTokenRetry(token, maxRetries = 3) {
  let lastErr = null;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await vscode.commands.executeCommand('windsurf.loginWithAuthToken', token);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.log(`[wfSwitch] loginWithAuthToken 第 ${i} 次失败: ${e.message}`);
      if (i < maxRetries) await new Promise(r => setTimeout(r, 1500));
    }
  }
  return { ok: !lastErr, error: lastErr?.message };
}

module.exports = {
  hackWindsurf,
  resetDeviceFingerprint,
  waitForLoginCommand,
  checkLoginStatus,
  loginWithAuthTokenRetry,
};

