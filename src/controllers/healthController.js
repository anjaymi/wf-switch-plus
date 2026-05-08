'use strict';

const vscode = require('vscode');
const { checkContinueHealth, formatContinueHealthReport } = require('../continueHealth');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createHealthController({ context, installContinueSupport, startContinueHttpServer }) {
  async function runContinueHealthCheck(options = {}) {
    try { startContinueHttpServer(context); } catch (e) { console.warn('[wfSwitchPlus] continue http init failed:', e && e.message); }
    await wait(300);
    let health = await checkContinueHealth();
    if (health.ok) {
      if (options.interactive !== false) {
        const pick = await vscode.window.showInformationMessage('持续对话质检通过', '复制报告');
        if (pick === '复制报告') await vscode.env.clipboard.writeText(formatContinueHealthReport(health));
      }
      return health;
    }
    const report = formatContinueHealthReport(health);
    if (options.autoRepair) {
      const r = await installContinueSupport(context);
      await wait(500);
      health = await checkContinueHealth();
      if (options.interactive !== false) {
        if (health.ok) vscode.window.showInformationMessage(`持续对话已自动修复，本地 HTTP 端口: ${r.port || health.port}`);
        else vscode.window.showWarningMessage('自动修复后仍有异常：' + health.issues.join('；'));
      }
      return Object.assign(health, { repairResult: r });
    }
    if (options.interactive === false) return health;
    const pick = await vscode.window.showWarningMessage('持续对话质检发现异常：' + health.issues.join('；'), '自动修复', '复制报告', '打开控制台');
    if (pick === '自动修复') {
      const r = await installContinueSupport(context);
      await wait(500);
      health = await checkContinueHealth();
      if (health.ok) vscode.window.showInformationMessage(`持续对话已自动修复，本地 HTTP 端口: ${r.port || health.port}`);
      else vscode.window.showWarningMessage('自动修复后仍有异常：' + health.issues.join('；'));
    } else if (pick === '复制报告') {
      await vscode.env.clipboard.writeText(report);
      vscode.window.showInformationMessage('已复制持续对话质检报告');
    } else if (pick === '打开控制台') {
      try { await vscode.commands.executeCommand('wfSwitchPlus.panel.focus'); } catch { await vscode.commands.executeCommand('workbench.view.extension.wfSwitchPlusView'); }
    }
    return health;
  }

  async function promptContinueHealthIfBroken() {
    const health = await runContinueHealthCheck({ interactive: false });
    if (health.ok) return;
    const now = Date.now();
    const lastAt = Number(context.globalState.get('continueHealthPromptAt', 0) || 0);
    if (now - lastAt < 30 * 60 * 1000) return;
    await context.globalState.update('continueHealthPromptAt', now);
    const pick = await vscode.window.showWarningMessage('持续对话可能已失效：' + health.issues.join('；'), '自动修复', '查看质检');
    if (pick === '自动修复') await runContinueHealthCheck({ autoRepair: true, interactive: true });
    else if (pick === '查看质检') await runContinueHealthCheck({ interactive: true });
  }

  return { runContinueHealthCheck, promptContinueHealthIfBroken };
}

module.exports = { createHealthController };
