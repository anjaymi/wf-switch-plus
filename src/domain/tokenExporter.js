const fs = require('fs');
const path = require('path');
const os = require('os');
const vscode = require('vscode');
const { readSharedState } = require('../state/sharedState');

function buildExportPayload() {
  const shared = readSharedState();
  const accs = (shared && shared.bundle && Array.isArray(shared.bundle.accounts)) ? shared.bundle.accounts : [];
  const list = accs.filter(a => a && a.email).map(a => ({
    email: a.email,
    sessionToken: a.sessionToken || '',
    auth1Token: a.auth1Token || '',
    accountId: a.accountId || '',
    orgId: a.orgId || '',
    planName: a.planName || '',
    daily: a.daily ?? null,
    weekly: a.weekly ?? null,
    planEndUnix: a.planEndUnix || 0,
    valid: a.valid !== false,
  }));
  return {
    exportedAt: new Date().toISOString(),
    cdkCode: (shared.bundle && shared.bundle.cdkCode) || '',
    count: list.length,
    accounts: list,
  };
}

async function exportAllTokens(target) {
  try {
    const payload = buildExportPayload();
    if (!payload.count) return { ok: false, error: '伴生桥未捕获 bundle' };
    const json = JSON.stringify(payload, null, 2);
    if (target === 'file') {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), 'wf-tokens-' + Date.now() + '.json')),
        filters: { JSON: ['json'] },
        saveLabel: '导出 Token JSON',
      });
      if (!uri) return { ok: false, error: '已取消' };
      await fs.promises.writeFile(uri.fsPath, json, 'utf8');
      return { ok: true, message: '已导出 ' + payload.count + ' 个账号 Token 到 ' + uri.fsPath };
    }
    await vscode.env.clipboard.writeText(json);
    return { ok: true, message: '已复制 ' + payload.count + ' 个账号 Token 到剪贴板' };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

module.exports = { exportAllTokens, buildExportPayload };
