'use strict';

const vscode = require('vscode');
const { getAccountsOverviewHtml } = require('../accountsOverviewHtml');
const { readSharedState, writeSharedState, buildEffectiveShared, findEffectiveAccount, mergeImportedAccounts } = require('../state/sharedState');
const { readXinghuoAccounts } = require('../domain/xinghuoImporter');
const { isWeeklyQuotaFrozen, getAccountFreezeReason } = require('../domain/accountSelector');
const { exportAllTokens } = require('../domain/tokenExporter');
const { ACCOUNTS } = require('../shared/messageTypes');

function createAccountsController({ context, getBridgeStatus, sendBridgeRequest, smartSwitch, switchTo }) {
  let panel = null;

  function getXinghuoImportPayload() {
    const result = readXinghuoAccounts();
    return {
      accounts: result.accounts.map(acc => ({
        email: acc.email,
        planName: acc.planName,
        daily: acc.daily,
        weekly: acc.weekly,
        valid: acc.valid,
        manualFrozen: acc.manualFrozen,
        sourceFile: acc.sourceFile,
      })),
      sources: result.sources,
    };
  }

  async function importSelectedXinghuoAccounts(selectedEmails) {
    const keys = new Set((Array.isArray(selectedEmails) ? selectedEmails : []).map(x => String(x || '').trim().toLowerCase()).filter(Boolean));
    if (!keys.size) {
      vscode.window.showWarningMessage('请至少选择一个星火账号');
      return { ok: false, imported: 0 };
    }
    const result = readXinghuoAccounts();
    if (!result.accounts.length) {
      const detail = result.sources.map(s => (s.ok ? 'OK ' + s.accountCount : (s.reason || 'failed')) + ' · ' + s.file).join('\n');
      vscode.window.showWarningMessage('未发现可导入的星火账号，请确认星火插件已生成 accounts.json', { modal: true, detail });
      return { ok: false, imported: 0 };
    }
    const selected = result.accounts.filter(acc => keys.has(String(acc.email || '').toLowerCase()));
    if (!selected.length) {
      vscode.window.showWarningMessage('所选星火账号已不存在，请重新打开导入弹窗');
      return { ok: false, imported: 0 };
    }
    const merged = await mergeImportedAccounts(selected);
    vscode.window.showInformationMessage('已从星火导入 ' + selected.length + ' 个账号（新增 ' + merged.added + '，更新 ' + merged.updated + '）');
    return { ok: true, imported: selected.length };
  }

  function render() {
    if (!panel) return;
    const shared = buildEffectiveShared(readSharedState());
    const baselines = context.globalState.get('quotaBaselineV1', {}) || {};
    const currentEmail = shared.currentEmail || context.globalState.get('lastEmail', '');
    const bridgeStatus = getBridgeStatus ? getBridgeStatus() : {};
    panel.webview.html = getAccountsOverviewHtml({
      shared,
      baselines,
      currentEmail,
      bridgeInjected: !!bridgeStatus.injected,
    });
  }

  async function open() {
    if (panel) {
      try { panel.reveal(vscode.ViewColumn.Active); } catch {}
      render();
      return;
    }
    panel = vscode.window.createWebviewPanel('wfSwitchPlusAccounts', 'WF 增强：账号总览', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    panel.onDidDispose(() => { panel = null; });
    panel.webview.onDidReceiveMessage(handleMessage);
    render();
  }

  async function handleMessage(msg) {
    if (!msg || !msg.type) return;
    try {
      if (msg.type === ACCOUNTS.REFRESH) {
        // noop, just rerender
      } else if (msg.type === ACCOUNTS.FOCUS_ORIGINAL_PANEL) {
        try { await vscode.commands.executeCommand('wfSwitch.panel.focus'); } catch { try { await vscode.commands.executeCommand('workbench.view.extension.wfSwitchView'); } catch {} }
      } else if (msg.type === ACCOUNTS.COPY_EMAIL && msg.payload) {
        await vscode.env.clipboard.writeText(String(msg.payload));
        vscode.window.setStatusBarMessage('已复制账号邮箱', 1500);
      } else if (msg.type === ACCOUNTS.RESET_BASELINE && msg.payload) {
        const map = context.globalState.get('quotaBaselineV1', {}) || {};
        const key = String(msg.payload).toLowerCase();
        if (map[key]) { delete map[key]; await context.globalState.update('quotaBaselineV1', map); }
        vscode.window.setStatusBarMessage('已重置该账号基线', 1500);
      } else if (msg.type === ACCOUNTS.RESET_ALL) {
        await context.globalState.update('quotaBaselineV1', {});
        vscode.window.setStatusBarMessage('已重置全部基线', 1500);
      } else if (msg.type === ACCOUNTS.IMPORT_CLIPBOARD) {
        const text = await vscode.env.clipboard.readText();
        try {
          const data = JSON.parse(text || '{}');
          await writeSharedState({ bundle: data.bundle || {}, baselines: data.baselines || {}, currentEmail: data.currentEmail || '' });
          vscode.window.showInformationMessage('已从剪贴板导入账号数据');
        } catch (e) {
          vscode.window.showErrorMessage('剪贴板内容不是合法 JSON：' + (e && e.message || e));
        }
      } else if (msg.type === ACCOUNTS.IMPORT_XINGHUO) {
        let payload;
        try {
          payload = getXinghuoImportPayload();
        } catch (e) {
          payload = { accounts: [], sources: [], error: e && e.message || String(e) };
        }
        await panel?.webview.postMessage({ type: ACCOUNTS.SHOW_XINGHUO_IMPORT, payload });
        return;
      } else if (msg.type === ACCOUNTS.IMPORT_XINGHUO_SELECTED) {
        await importSelectedXinghuoAccounts(msg.payload);
      } else if (msg.type === ACCOUNTS.REFRESH_VIA_BRIDGE) {
        const r = await sendBridgeRequest('refreshAccounts');
        if (r.ok) vscode.window.setStatusBarMessage('已请求原版刷新账号', 2000);
        else vscode.window.showWarningMessage('调用原版刷新失败：' + (r.error || '未知'));
      } else if (msg.type === ACCOUNTS.SWITCH_TO && msg.payload) {
        const email = String(msg.payload);
        const acc = findEffectiveAccount(email);
        if (isWeeklyQuotaFrozen(acc)) {
          vscode.window.showWarningMessage('账号 ' + email + ' 已冻结：' + (getAccountFreezeReason(acc) || '不可切号'));
          return;
        }
        const r = await switchTo(email);
        if (r.ok) vscode.window.showInformationMessage('已 Zen 切换到 ' + email);
        else vscode.window.showErrorMessage('切换失败：' + (r.error || '未知'));
      } else if (msg.type === ACCOUNTS.VIEW_TOKEN && msg.payload) {
        const acc = findEffectiveAccount(String(msg.payload));
        if (!acc) { vscode.window.showWarningMessage('伴生桥未捕获该账号 token'); return; }
        panel?.webview.postMessage({ type: ACCOUNTS.SHOW_TOKEN, payload: acc });
        return;
      } else if (msg.type === ACCOUNTS.COPY_TOKEN && msg.payload) {
        const acc = findEffectiveAccount(String(msg.payload));
        if (!acc || !acc.sessionToken) { vscode.window.showWarningMessage('该账号缺少 sessionToken'); return; }
        await vscode.env.clipboard.writeText(acc.sessionToken);
        vscode.window.setStatusBarMessage('已复制 ' + acc.email + ' 的 sessionToken', 2500);
        return;
      } else if (msg.type === ACCOUNTS.TOGGLE_FREEZE && msg.payload) {
        const email = String(msg.payload).trim();
        const key = email.toLowerCase();
        const shared = readSharedState();
        const map = Object.assign({}, shared.manualFrozenAccounts || {});
        const frozen = !!map[key];
        if (frozen) delete map[key];
        else map[key] = { email, frozenAt: Date.now() };
        await writeSharedState({ manualFrozenAccounts: map });
        vscode.window.setStatusBarMessage((frozen ? '已取消冻结 ' : '已手动冻结 ') + email, 2000);
      } else if (msg.type === ACCOUNTS.EXPORT_TOKENS) {
        const r = await exportAllTokens(String(msg.payload || 'clipboard'));
        if (r.ok) vscode.window.showInformationMessage(r.message);
        else vscode.window.showErrorMessage('导出失败：' + r.error);
        return;
      } else if (msg.type === ACCOUNTS.TOAST && msg.payload) {
        vscode.window.setStatusBarMessage(String(msg.payload), 1500);
        return;
      } else if (msg.type === ACCOUNTS.SMART_SWITCH) {
        await smartSwitch({ confirm: false });
      }
    } catch (e) {
      vscode.window.showErrorMessage('账号总览操作失败：' + (e && e.message || e));
    }
    render();
  }

  return {
    open,
    render,
    hasPanel: () => !!panel,
    importSelectedXinghuoAccounts,
  };
}

module.exports = { createAccountsController };
