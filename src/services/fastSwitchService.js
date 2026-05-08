'use strict';

const vscode = require('vscode');
const { readSharedState, writeSharedState, findEffectiveAccount, getEffectiveAccounts } = require('../state/sharedState');
const { pickBestAccountByDaily, isWeeklyQuotaFrozen, getAccountFreezeReason } = require('../domain/accountSelector');
const { fastSwitchToAccount, getAccountToken } = require('../domain/fastSwitch');

function createFastSwitchService({ context, sendBridgeRequest, refreshPanel, refreshAccountsOverview, refreshDetailPanel }) {
  let inFlight = null;
  let inFlightEmail = '';

  async function runExclusive(email, fn) {
    const key = String(email || '').trim().toLowerCase();
    if (inFlight) {
      vscode.window.setStatusBarMessage('Zen 切号进行中' + (inFlightEmail ? '：' + inFlightEmail : '') + '，已忽略重复触发', 3000);
      return { ok: false, skipped: true, error: 'switch-in-flight' };
    }
    inFlightEmail = key;
    inFlight = Promise.resolve().then(fn);
    try {
      return await inFlight;
    } finally {
      inFlight = null;
      inFlightEmail = '';
    }
  }

  async function runPostSwitchHooks(email) {
    try { await sendBridgeRequest('refreshAccounts'); } catch (e) { console.warn('[wfSwitchPlus] zen post refresh failed:', e && e.message); }
    try { refreshPanel && refreshPanel(); } catch {}
    try { refreshAccountsOverview && refreshAccountsOverview(); } catch {}
    try { refreshDetailPanel && refreshDetailPanel(); } catch {}
    if (email) {
      try { await context.globalState.update('lastEmail', email); } catch {}
    }
  }

  async function switchBest(options = {}) {
    const best = pickBestAccountByDaily();
    if (!best) {
      vscode.window.showWarningMessage('没有可快速切换的账号（伴生桥未捕获 bundle、全部账号无效或周额度已冻结）');
      return { ok: false, error: 'no-account' };
    }
    if (!getAccountToken(best)) {
      vscode.window.showWarningMessage('账号 ' + best.email + ' 缺少 sessionToken/apiKey，无法 Zen 快速切号');
      return { ok: false, error: 'missing-token' };
    }
    const curEmail = readSharedState().currentEmail || context.globalState.get('lastEmail', '');
    if (curEmail && String(curEmail).toLowerCase() === String(best.email).toLowerCase()) {
      vscode.window.showInformationMessage('当前账号 ' + best.email + ' 已是日额度最高（' + best.daily + '%），无需快速切号');
      return { ok: true, skipped: true };
    }
    if (options.confirm !== false) {
      const pick = await vscode.window.showWarningMessage(
        'Zen 自动切号：将直接调用 Windsurf loginWithAuthToken 注入 ' + best.email + '，不主动重载窗口。失败时可回退原版桥切号。',
        { modal: true },
        'Zen 切换',
        '取消'
      );
      if (pick !== 'Zen 切换') return { ok: false, canceled: true };
    }
    return runExclusive(best.email, () => switchAccount(best, { fallbackStatus: true }));
  }

  async function switchPick() {
    const accounts = getEffectiveAccounts().filter(a => a && a.email && a.valid !== false && getAccountToken(a) && !isWeeklyQuotaFrozen(a));
    if (!accounts.length) {
      vscode.window.showWarningMessage('没有可 Zen 切换的账号（需要 token，且周额度不能为 0）');
      return { ok: false, error: 'no-token-account' };
    }
    const pick = await vscode.window.showQuickPick(accounts.map(a => ({
      label: String(a.email),
      description: '日 ' + (a.daily ?? '--') + '% · 周 ' + (a.weekly ?? '--') + '%',
      account: a,
    })), {
      placeHolder: '选择要 Zen 切换的账号（不主动重载窗口）',
      ignoreFocusOut: true,
    });
    if (!pick) return { ok: false, canceled: true };
    const confirm = await vscode.window.showWarningMessage(
      'Zen 切号：将直接调用 Windsurf loginWithAuthToken 注入 ' + pick.account.email + '。',
      { modal: true },
      'Zen 切换',
      '取消'
    );
    if (confirm !== 'Zen 切换') return { ok: false, canceled: true };
    return runExclusive(pick.account.email, () => switchAccount(pick.account, { fallback: false }));
  }

  async function switchByEmail(email) {
    const key = String(email || '').trim().toLowerCase();
    const account = findEffectiveAccount(key);
    if (!account) {
      vscode.window.showWarningMessage('未找到账号：' + email);
      return { ok: false, error: 'account-not-found' };
    }
    if (!getAccountToken(account)) {
      vscode.window.showWarningMessage('账号 ' + account.email + ' 缺少 sessionToken/apiKey，无法 Zen 切号');
      return { ok: false, error: 'missing-token' };
    }
    if (isWeeklyQuotaFrozen(account)) {
      vscode.window.showWarningMessage('账号 ' + account.email + ' 已冻结：' + (getAccountFreezeReason(account) || '不可切号'));
      return { ok: false, error: 'weekly-quota-frozen' };
    }
    return runExclusive(account.email, () => switchAccount(account));
  }

  async function switchAccount(account, options = {}) {
    const r = await fastSwitchToAccount(account);
    if (r.ok) {
      await writeSharedState({
        currentEmail: account.email,
        _wfLastSync: Date.now(),
        fastSwitchLast: {
          at: new Date().toISOString(),
          email: account.email,
          landed: !!r.landed,
          currentUser: r.currentUser || '',
        },
      });
      const msg = r.landed
        ? 'Zen 切号已落地：' + account.email
        : 'Zen 切号已发起：' + account.email + (r.currentUser ? '（当前登录态：' + r.currentUser + '）' : '');
      vscode.window.showInformationMessage(msg);
      await runPostSwitchHooks(account.email);
      return r;
    }
    if (options.fallback === false) {
      vscode.window.showErrorMessage('Zen 切号失败：' + (r.error || '未知'));
      return r;
    }
    const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
    if (cfg.get('fastSwitchFallbackToOriginal', true)) {
      if (options.fallbackStatus) vscode.window.setStatusBarMessage('Zen 切号失败，回退原版桥：' + (r.error || '未知'), 3500);
      const fallback = await sendBridgeRequest('localSwitchTo', { email: account.email });
      if (fallback.ok) {
        vscode.window.showInformationMessage((options.fallbackStatus ? '已回退原版桥切换到 ' : 'Zen 失败，已回退原版桥切换到 ') + account.email);
        await runPostSwitchHooks(account.email);
      } else {
        vscode.window.showErrorMessage('Zen 切号失败，原版桥回退也失败：' + (fallback.error || r.error || '未知'));
      }
      return Object.assign({ fallback }, r);
    }
    vscode.window.showErrorMessage('Zen 切号失败：' + (r.error || '未知'));
    return r;
  }

  return { switchBest, switchPick, switchByEmail };
}

module.exports = { createFastSwitchService };
