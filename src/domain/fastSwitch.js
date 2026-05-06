const vscode = require('vscode');
const { hackWindsurf, waitForLoginCommand, loginWithAuthTokenRetry, checkLoginStatus } = require('../windsurfAuth');

function getAccountToken(account) {
  if (!account || typeof account !== 'object') return '';
  return String(account.sessionToken || account.apiKey || account.accessToken || account.token || '').trim();
}

function sameAccount(login, account) {
  const cur = String(login && login.currentUser || '').toLowerCase();
  const email = String(account && account.email || '').toLowerCase();
  if (!cur || !email) return false;
  return cur === email || cur.includes(email) || email.includes(cur);
}

async function fastSwitchToAccount(account, options = {}) {
  if (!account || !account.email) return { ok: false, error: '账号为空' };
  const token = getAccountToken(account);
  if (!token) return { ok: false, error: '该账号缺少 sessionToken/apiKey，无法快速注入' };
  const patched = await hackWindsurf();
  const ready = await waitForLoginCommand(options.timeout || 12000, 'Zen 快速切号');
  if (!ready) return { ok: false, error: 'windsurf.loginWithAuthToken 命令未就绪', patched };
  const r = await loginWithAuthTokenRetry(token, options.retries || 2);
  if (!r.ok) return Object.assign({ patched }, r);
  await new Promise(resolve => setTimeout(resolve, options.verifyDelay || 1200));
  const login = await checkLoginStatus();
  return {
    ok: true,
    email: account.email,
    patched,
    landed: sameAccount(login, account),
    currentUser: login.currentUser || '',
  };
}

module.exports = {
  fastSwitchToAccount,
  getAccountToken,
};
