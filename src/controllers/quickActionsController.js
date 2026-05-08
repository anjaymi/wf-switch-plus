'use strict';

const vscode = require('vscode');

function createQuickActionsController({ sendBridgeRequest }) {
  async function batchActivateCodes(codes) {
    const list = Array.from(new Set((Array.isArray(codes) ? codes : String(codes || '').split(/[\s,，;；]+/))
      .map(v => String(v || '').trim())
      .filter(Boolean))).slice(0, 50);
    if (!list.length) {
      vscode.window.showWarningMessage('没有可提交的激活码');
      return { ok: false, error: 'empty-codes' };
    }
    let ok = 0;
    const failed = [];
    for (const code of list) {
      vscode.window.setStatusBarMessage('正在提交激活码 ' + (ok + failed.length + 1) + '/' + list.length, 2000);
      const r = await sendBridgeRequest('activateCdk', { code });
      if (r.ok) ok += 1;
      else failed.push({ code, error: r.error || '未知' });
    }
    if (failed.length) {
      const msg = '激活码提交完成：成功 ' + ok + '，失败 ' + failed.length + '。' + (failed[0].error || '');
      vscode.window.showWarningMessage(msg, '重新注入桥').then(pick => {
        if (pick === '重新注入桥') vscode.commands.executeCommand('wfSwitchPlus.injectOriginalBridge');
      });
    } else {
      vscode.window.showInformationMessage('激活码批量提交完成：成功 ' + ok + ' 条');
    }
    return { ok: failed.length === 0, success: ok, failed };
  }

  async function openQuickActions() {
    const items = [
      { label: '$(zap) Zen 选择账号快切', description: '选择任意已捕获 token 的账号，不主动重载窗口', command: 'wfSwitchPlus.fastSwitchPick' },
      { label: '$(rocket) 切到日额度最高账号', description: 'Zen 优先，失败回退原版桥', command: 'wfSwitchPlus.smartSwitch' },
      { label: '$(sync) 刷新原版账号数据', description: '通过伴生桥调用原版 refreshAccounts', command: 'wfSwitchPlus.refreshAccountsViaBridge' },
      { label: '$(account) 打开账号总览', description: '查看账号池、额度和 token 概览', command: 'wfSwitchPlus.openAccountsOverview' },
      { label: '$(graph) 打开 Token 详情', description: '查看真实优先 token 面板', command: 'wfSwitchPlus.showTokenUsageStats' },
      { label: '$(plug) 验证 Windsurf 桥状态', description: '检查主包桥和候选会话信息', command: 'wfSwitchPlus.verifyWindsurfBridge' },
    ];
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'WF 增强快捷弹窗（自带，不依赖原版面板）',
      ignoreFocusOut: true,
    });
    if (!pick) return;
    await vscode.commands.executeCommand(pick.command);
  }

  return { batchActivateCodes, openQuickActions };
}

module.exports = { createQuickActionsController };
