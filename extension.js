const vscode = require('vscode');
const pkg = require('./package.json');
const { initContinueSupport, openContinueDialog, installContinueSupport, installBuiltinContinuePs1, configureWfContinueGlobalRules, copyClaudeContextMcpConfig, startContinueHttpServer, stopContinueHttpServer, getContinueScriptPath } = require('./src/continueSupport');
const { setTokenRefreshHandler, setTokenContext, showTokenUsageStats, resetTokenUsageStats, readTokenUsageStatsSync, getPricingConfig, refreshDetailPanel } = require('./src/tokenEstimator');
const { hackWindsurf, checkLoginStatus } = require('./src/windsurfAuth');
const { getPlusPanelHtml, getPlusPanelLiveData } = require('./src/plusPanelHtml');
const { getAccountsOverviewHtml } = require('./src/accountsOverviewHtml');
const originalBridge = require('./src/originalBridge');
const { readSharedState, writeSharedState, findBundleAccount } = require('./src/state/sharedState');
const { sendBridgeRequest } = require('./src/state/bridgeRequest');
const { pickBestAccountByDaily } = require('./src/domain/accountSelector');
const { exportAllTokens } = require('./src/domain/tokenExporter');
const { ACCOUNTS, PLUS_PANEL } = require('./src/shared/messageTypes');

let accountsOverviewPanel = null;
function renderAccountsOverview(context) {
  if (!accountsOverviewPanel) return;
  const shared = readSharedState();
  const baselines = context.globalState.get('quotaBaselineV1', {}) || {};
  const currentEmail = (shared.currentEmail) || context.globalState.get('lastEmail', '');
  accountsOverviewPanel.webview.html = getAccountsOverviewHtml({
    shared,
    baselines,
    currentEmail,
    bridgeInjected: !!bridgeStatusCache.injected,
  });
}
async function openAccountsOverview(context) {
  if (accountsOverviewPanel) { try { accountsOverviewPanel.reveal(vscode.ViewColumn.Active); } catch {} renderAccountsOverview(context); return; }
  accountsOverviewPanel = vscode.window.createWebviewPanel('wfSwitchPlusAccounts', 'WF 增强：账号总览', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  accountsOverviewPanel.onDidDispose(() => { accountsOverviewPanel = null; });
  accountsOverviewPanel.webview.onDidReceiveMessage(async (msg) => {
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
      } else if (msg.type === ACCOUNTS.REFRESH_VIA_BRIDGE) {
        const r = await sendBridgeRequest('refreshAccounts');
        if (r.ok) vscode.window.setStatusBarMessage('已请求原版刷新账号', 2000);
        else vscode.window.showWarningMessage('调用原版刷新失败：' + (r.error || '未知'));
      } else if (msg.type === ACCOUNTS.SWITCH_TO && msg.payload) {
        const email = String(msg.payload);
        const r = await sendBridgeRequest('localSwitchTo', { email });
        if (r.ok) vscode.window.showInformationMessage('已请求切换到 ' + email + '，原版会重置指纹并重载窗口');
        else vscode.window.showErrorMessage('切换失败：' + (r.error || '未知'));
      } else if (msg.type === ACCOUNTS.VIEW_TOKEN && msg.payload) {
        const acc = findBundleAccount(String(msg.payload));
        if (!acc) { vscode.window.showWarningMessage('伴生桥未捕获该账号 token'); return; }
        accountsOverviewPanel?.webview.postMessage({ type: ACCOUNTS.SHOW_TOKEN, payload: acc });
        return;
      } else if (msg.type === ACCOUNTS.COPY_TOKEN && msg.payload) {
        const acc = findBundleAccount(String(msg.payload));
        if (!acc || !acc.sessionToken) { vscode.window.showWarningMessage('该账号缺少 sessionToken'); return; }
        await vscode.env.clipboard.writeText(acc.sessionToken);
        vscode.window.setStatusBarMessage('已复制 ' + acc.email + ' 的 sessionToken', 2500);
        return;
      } else if (msg.type === ACCOUNTS.EXPORT_TOKENS) {
        const r = await exportAllTokens(String(msg.payload || 'clipboard'));
        if (r.ok) vscode.window.showInformationMessage(r.message);
        else vscode.window.showErrorMessage('导出失败：' + r.error);
        return;
      } else if (msg.type === ACCOUNTS.TOAST && msg.payload) {
        vscode.window.setStatusBarMessage(String(msg.payload), 1500);
        return;
      } else if (msg.type === ACCOUNTS.SMART_SWITCH) {
        const best = pickBestAccountByDaily();
        if (!best) { vscode.window.showWarningMessage('没有可切换的账号（bundle 为空或都无效）'); return; }
        const curEmail = (readSharedState().currentEmail) || context.globalState.get('lastEmail', '');
        if (curEmail && String(curEmail).toLowerCase() === String(best.email).toLowerCase()) {
          vscode.window.showInformationMessage('当前账号 ' + best.email + ' 已是日额度最高，无需切换');
          return;
        }
        const r = await sendBridgeRequest('localSwitchTo', { email: best.email });
        if (r.ok) vscode.window.showInformationMessage('已自动切换到日额度最高账号：' + best.email);
        else vscode.window.showErrorMessage('自动切换失败：' + (r.error || '未知'));
      }
    } catch (e) {
      vscode.window.showErrorMessage('账号总览操作失败：' + (e && e.message || e));
    }
    renderAccountsOverview(context);
  });
  renderAccountsOverview(context);
}

let panelProvider = null;
let myInstanceId = '__plus__';

async function runOriginalCommand(command) {
  const exists = (await vscode.commands.getCommands(true)).includes(command);
  if (!exists) {
    vscode.window.showWarningMessage(`未检测到原版命令 ${command}，请先安装并启用 WF 一键换号原版插件`);
    return;
  }
  return vscode.commands.executeCommand(command);
}

async function selfCheck() {
  const commands = await vscode.commands.getCommands(true);
  const required = ['wfSwitch.switch', 'wfSwitch.activate', 'wfSwitch.hack', 'wfSwitch.newInstance'];
  const missing = required.filter(c => !commands.includes(c));
  const login = await checkLoginStatus();
  const stats = readTokenUsageStatsSync();
  const lines = [
    `插件: ${pkg.displayName} ${pkg.version}`,
    `原版命令: ${missing.length ? '缺失 ' + missing.join(', ') : '已检测到'}`,
    `Codeium 登录: ${login.isLoggedIn ? '是 ' + (login.currentUser || '') : '否'}`,
    `持续对话脚本: ${getContinueScriptPath()}`,
    `Token 统计: ${stats.totalRequests || 0} 次`,
  ];
  const pick = await vscode.window.showInformationMessage('WF 增强自检完成', '复制报告');
  if (pick === '复制报告') {
    await vscode.env.clipboard.writeText(lines.join('\n'));
    vscode.window.showInformationMessage('已复制 WF 增强自检报告');
  }
  return lines;
}

function promptInstallContinueSupport(context) {
  const versionKey = 'continueSetupPromptVersion';
  const mutedKey = 'continueSetupPromptMuted';
  if (context.globalState.get(mutedKey, false)) return;
  if (context.globalState.get(versionKey, '') === pkg.version) return;
  setTimeout(async () => {
    try {
      const pick = await vscode.window.showInformationMessage(
        'WF 增强建议安装持续对话规则与本地 HTTP，用于回合结束弹窗、附件上传和自动回复。',
        '安装规则与 HTTP',
        '打开控制台',
        '稍后',
        '不再提示'
      );
      if (pick === '安装规则与 HTTP') {
        const r = await installContinueSupport(context);
        if (r.ok) {
          await context.globalState.update(versionKey, pkg.version);
          vscode.window.showInformationMessage(`已安装持续对话支持，本地 HTTP 端口: ${r.port}`);
        } else {
          vscode.window.showErrorMessage(`安装持续对话支持失败: ${r.error}`);
        }
      } else if (pick === '打开控制台') {
        await context.globalState.update(versionKey, pkg.version);
        try { await vscode.commands.executeCommand('wfSwitchPlus.panel.focus'); } catch { await vscode.commands.executeCommand('workbench.view.extension.wfSwitchPlusView'); }
      } else if (pick === '不再提示') {
        await context.globalState.update(mutedKey, true);
      } else if (pick === '稍后') {
        await context.globalState.update(versionKey, pkg.version);
      }
    } catch (e) {
      console.warn('[wfSwitchPlus] continue setup prompt failed:', e && e.message);
    }
  }, 1200);
}

let bridgeStatusCache = { installed: false, injected: false };
function getPanelHtml() {
  const stats = readTokenUsageStatsSync();
  const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
  const shared = readSharedState();
  const bundleAccounts = (shared && shared.bundle && Array.isArray(shared.bundle.accounts)) ? shared.bundle.accounts : [];
  return getPlusPanelHtml({
    stats,
    pricing: getPricingConfig(),
    pkg,
    bundleAccounts,
    originalInstalled: !!vscode.extensions.getExtension('xy.wf-switch-ext'),
    bridgeInjected: !!bridgeStatusCache.injected,
    autoReplyEnabled: !!cfg.get('autoReplyEnabled', false),
    autoReplyText: String(cfg.get('autoReplyText', '继续') || '继续'),
    autoReplyDelaySec: Math.max(0, Math.min(60, Number(cfg.get('autoReplyDelaySec', 3) || 0))),
    saveTokenMode: !!cfg.get('enableSavePoints', true),
    autoQuotaSwitch: !!cfg.get('autoQuotaSwitch', false),
    autoQuotaThreshold: Math.max(1, Math.min(99, Number(cfg.get('autoQuotaThreshold', 15) || 15))),
  });
}

function getPanelLiveData() {
  const stats = readTokenUsageStatsSync();
  const shared = readSharedState();
  const bundleAccounts = (shared && shared.bundle && Array.isArray(shared.bundle.accounts)) ? shared.bundle.accounts : [];
  return getPlusPanelLiveData({
    stats,
    pricing: getPricingConfig(),
    bundleAccounts,
  });
}

async function refreshBridgeStatus() {
  try { bridgeStatusCache = await originalBridge.getStatus(); } catch { bridgeStatusCache = { installed: false, injected: false }; }
  panelProvider?.refresh();
}

class PlusPanelProvider {
  constructor(context) { this.context = context; this.view = null; }
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getPanelHtml();
    view.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
  }
  refresh() {
    if (this.view) this.view.webview.html = getPanelHtml();
  }
  async handleMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'requestRefresh' || msg.type === 'requestSpark') {
      try {
        const data = getPanelLiveData();
        if (msg.type === 'requestSpark') {
          this.view?.webview.postMessage({ type: 'sparkUpdate', payload: data.sparkPayload });
        } else {
          this.view?.webview.postMessage(Object.assign({ type: 'plusLiveUpdate' }, data));
        }
      } catch {}
      return;
    }
    const map = {
      switch: 'wfSwitchPlus.switch',
      activate: 'wfSwitchPlus.activate',
      newInstance: 'wfSwitchPlus.newInstance',
      openSettings: 'wfSwitchPlus.openSettings',
      hack: 'wfSwitchPlus.hack',
      continueDialog: 'wfSwitchPlus.continueDialog',
      installContinueSupport: 'wfSwitchPlus.installContinueSupport',
      configureContinueRules: 'wfSwitchPlus.configureContinueRules',
      copyContinueScriptPath: 'wfSwitchPlus.copyContinueScriptPath',
      copyClaudeContextMcpConfig: 'wfSwitchPlus.copyClaudeContextMcpConfig',
      showTokenUsageStats: 'wfSwitchPlus.showTokenUsageStats',
      resetTokenUsageStats: 'wfSwitchPlus.resetTokenUsageStats',
      toggleAutoReply: 'wfSwitchPlus.toggleAutoReply',
      toggleSaveToken: 'wfSwitchPlus.toggleSaveToken',
      toggleAutoQuotaSwitch: 'wfSwitchPlus.toggleAutoQuotaSwitch',
      setQuotaThreshold: 'wfSwitchPlus.setQuotaThreshold',
      setAutoReplyPhrase: 'wfSwitchPlus.setAutoReplyPhrase',
      selfCheck: 'wfSwitchPlus.selfCheck',
      injectOriginalBridge: 'wfSwitchPlus.injectOriginalBridge',
      removeOriginalBridge: 'wfSwitchPlus.removeOriginalBridge',
      openAccountsOverview: 'wfSwitchPlus.openAccountsOverview',
      checkOriginalUpdate: 'wfSwitchPlus.checkOriginalUpdate',
      focusOriginalPanel: 'wfSwitchPlus.focusOriginalPanel',
      smartSwitch: 'wfSwitchPlus.smartSwitch',
      refreshAccountsViaBridge: 'wfSwitchPlus.refreshAccountsViaBridge',
    };
    console.log('[wfSwitchPlus] panel msg:', msg.type);
    if (msg.type === 'savePhrase') {
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      const text = String(msg.text || '').trim();
      const delay = Math.max(0, Math.min(60, Number(msg.delay) || 0));
      if (text) await cfg.update('autoReplyText', text, vscode.ConfigurationTarget.Global);
      await cfg.update('autoReplyDelaySec', delay, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage('已更新自动回复短语', 2000);
      this.refresh();
      return;
    }
    if (msg.type === 'setConfig' && typeof msg.key === 'string') {
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      await cfg.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
      if (msg.key === 'enableSavePoints') await configureWfContinueGlobalRules();
      vscode.window.setStatusBarMessage(`wfSwitchPlus.${msg.key} 已更新`, 2000);
    } else if (map[msg.type]) {
      const cmd = map[msg.type];
      vscode.window.setStatusBarMessage(`执行 ${cmd} ...`, 1500);
      try {
        await vscode.commands.executeCommand(cmd);
      } catch (e) {
        vscode.window.showErrorMessage(`${cmd} 执行失败：` + (e && e.message || e));
      }
    } else {
      vscode.window.showWarningMessage('未处理的面板消息类型：' + msg.type);
    }
    this.refresh();
  }
}

function activate(context) {
  console.log('[wfSwitchPlus] 扩展已激活');
  initContinueSupport({ getInstanceId: () => myInstanceId });
  panelProvider = new PlusPanelProvider(context);
  setTokenRefreshHandler(() => panelProvider?.refresh());
  setTokenContext(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('wfSwitchPlus.panel', panelProvider),
    vscode.commands.registerCommand('wfSwitchPlus.openPanel', () => vscode.commands.executeCommand('wfSwitchPlus.panel.focus')),
    vscode.commands.registerCommand('wfSwitchPlus.switch', () => runOriginalCommand('wfSwitch.switch')),
    vscode.commands.registerCommand('wfSwitchPlus.activate', () => runOriginalCommand('wfSwitch.activate')),
    vscode.commands.registerCommand('wfSwitchPlus.newInstance', () => runOriginalCommand('wfSwitch.newInstance')),
    vscode.commands.registerCommand('wfSwitchPlus.openSettings', () => runOriginalCommand('wfSwitch.openSettings')),
    vscode.commands.registerCommand('wfSwitchPlus.hack', async () => {
      const modified = await hackWindsurf();
      vscode.window.showInformationMessage(modified ? '已应用补丁，请重载窗口' : '补丁已存在或未找到可修改入口');
    }),
    vscode.commands.registerCommand('wfSwitchPlus.continueDialog', () => {
      try { openContinueDialog(context); }
      catch (e) { vscode.window.showErrorMessage('打开继续对话弹窗失败: ' + (e && e.message || e)); }
    }),
    vscode.commands.registerCommand('wfSwitchPlus.copyContinueScriptPath', async () => {
      await installBuiltinContinuePs1();
      await vscode.env.clipboard.writeText(getContinueScriptPath());
      vscode.window.showInformationMessage(`已复制继续对话脚本路径: ${getContinueScriptPath()}`);
    }),
    vscode.commands.registerCommand('wfSwitchPlus.installContinueSupport', async () => {
      const r = await installContinueSupport(context);
      if (r.ok) vscode.window.showInformationMessage(`已安装持续对话支持，本地 HTTP 端口: ${r.port}`);
      else vscode.window.showErrorMessage(`安装持续对话支持失败: ${r.error}`);
    }),
    vscode.commands.registerCommand('wfSwitchPlus.configureContinueRules', async () => {
      const r = await configureWfContinueGlobalRules();
      if (r.ok) vscode.window.showInformationMessage(`已配置 WF 继续对话全局规则: ${r.file}`);
      else vscode.window.showErrorMessage(`配置 WF 继续对话全局规则失败: ${r.error}`);
    }),
    vscode.commands.registerCommand('wfSwitchPlus.copyClaudeContextMcpConfig', copyClaudeContextMcpConfig),
    vscode.commands.registerCommand('wfSwitchPlus.showTokenUsageStats', showTokenUsageStats),
    vscode.commands.registerCommand('wfSwitchPlus.resetTokenUsageStats', resetTokenUsageStats),
    vscode.commands.registerCommand('wfSwitchPlus.toggleSaveToken', async () => {
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      const cur = !!cfg.get('enableSavePoints', true);
      await cfg.update('enableSavePoints', !cur, vscode.ConfigurationTarget.Global);
      try { await configureWfContinueGlobalRules(); } catch {}
      vscode.window.setStatusBarMessage('节约 Token 模式 ' + (!cur ? '已开启' : '已关闭'), 2000);
      panelProvider?.refresh();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.toggleAutoQuotaSwitch', async () => {
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      const cur = !!cfg.get('autoQuotaSwitch', false);
      await cfg.update('autoQuotaSwitch', !cur, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage('无感切号 ' + (!cur ? '已开启（后台监控）' : '已关闭'), 2500);
      panelProvider?.refresh();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.setQuotaThreshold', async () => {
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      const cur = Number(cfg.get('autoQuotaThreshold', 15) || 15);
      const val = await vscode.window.showInputBox({
        prompt: '日额度低于多少 % 时自动切到最高账号（1-99）',
        value: String(cur), ignoreFocusOut: true,
        validateInput: v => {
          const n = Number(v);
          return (Number.isFinite(n) && n >= 1 && n <= 99) ? null : '请输入 1-99 的整数';
        },
      });
      if (val === undefined) return;
      await cfg.update('autoQuotaThreshold', Math.max(1, Math.min(99, Number(val))), vscode.ConfigurationTarget.Global);
      panelProvider?.refresh();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.toggleAutoReply', async () => {
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      const cur = !!cfg.get('autoReplyEnabled', false);
      await cfg.update('autoReplyEnabled', !cur, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`继续对话固定短语自动回复已${!cur ? '开启' : '关闭'}`);
      panelProvider?.refresh();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.setAutoReplyPhrase', async () => {
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      const cur = String(cfg.get('autoReplyText', '继续') || '继续');
      const text = await vscode.window.showInputBox({ prompt: '输入继续对话自动回复固定短语', value: cur, ignoreFocusOut: true });
      if (!text) return;
      await cfg.update('autoReplyText', text.trim(), vscode.ConfigurationTarget.Global);
      const delay = await vscode.window.showInputBox({ prompt: '自动回复前等待秒数（0-60）', value: String(cfg.get('autoReplyDelaySec', 3)), ignoreFocusOut: true });
      if (delay !== undefined && delay !== '') {
        await cfg.update('autoReplyDelaySec', Math.max(0, Math.min(60, Number(delay) || 0)), vscode.ConfigurationTarget.Global);
      }
      vscode.window.showInformationMessage('已更新继续对话固定回复短语');
      panelProvider?.refresh();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.selfCheck', selfCheck),
    vscode.commands.registerCommand('wfSwitchPlus.injectOriginalBridge', async () => {
      const r = await originalBridge.injectBridge();
      if (r.ok) {
        vscode.window.showInformationMessage(r.alreadyInjected ? '原版伴生桥已注入（最新版）' : '已向原版插件注入伴生桥，请重载窗口生效');
      } else {
        vscode.window.showErrorMessage('注入失败：' + r.error);
      }
      await refreshBridgeStatus();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.removeOriginalBridge', async () => {
      const r = await originalBridge.removeBridge();
      if (r.ok) {
        vscode.window.showInformationMessage(r.removed ? '已移除原版伴生桥，请重载窗口生效' : '原版未发现伴生桥，无需移除');
      } else {
        vscode.window.showErrorMessage('移除失败：' + r.error);
      }
      await refreshBridgeStatus();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.openAccountsOverview', () => openAccountsOverview(context)),
    vscode.commands.registerCommand('wfSwitchPlus.checkOriginalUpdate', () => runOriginalCommand('wfSwitch.checkUpdate')),
    vscode.commands.registerCommand('wfSwitchPlus.refreshAccountsViaBridge', async () => {
      const r = await sendBridgeRequest('refreshAccounts');
      if (r.ok) vscode.window.setStatusBarMessage('已请求原版刷新账号', 2000);
      else vscode.window.showWarningMessage('调用原版刷新失败：' + (r.error || '未知'));
      renderAccountsOverview(context);
    }),
    vscode.commands.registerCommand('wfSwitchPlus.smartSwitch', async () => {
      const best = pickBestAccountByDaily();
      if (!best) { vscode.window.showWarningMessage('没有可切换的账号（伴生桥未捕获 bundle 或全部账号无效）'); return; }
      const curEmail = (readSharedState().currentEmail) || context.globalState.get('lastEmail', '');
      if (curEmail && String(curEmail).toLowerCase() === String(best.email).toLowerCase()) {
        vscode.window.showInformationMessage('当前账号 ' + best.email + ' 已是日额度最高（' + best.daily + '%），无需切换');
        return;
      }
      const pick = await vscode.window.showInformationMessage('将切换到日额度最高账号：' + best.email + '（' + (best.daily ?? '--') + '%），原版会重置指纹并重载窗口。', '确认切换', '取消');
      if (pick !== '确认切换') return;
      const r = await sendBridgeRequest('localSwitchTo', { email: best.email });
      if (r.ok) vscode.window.showInformationMessage('已请求切换到 ' + best.email);
      else vscode.window.showErrorMessage('自动切换失败：' + (r.error || '未知'));
    }),
    vscode.commands.registerCommand('wfSwitchPlus.focusOriginalPanel', async () => {
      try { await vscode.commands.executeCommand('wfSwitch.panel.focus'); }
      catch { try { await vscode.commands.executeCommand('workbench.view.extension.wfSwitchView'); } catch (e) { vscode.window.showWarningMessage('无法聚焦原版面板：' + (e && e.message || e)); } }
    }),
    { dispose: () => { try { stopContinueHttpServer(); } catch {} } }
  );

  // 真·实时刷新：每 5 秒重渲染所有 webview + 检查自动切号
  let lastSharedSig = '';
  let lastAutoSwitchAt = 0;
  const liveTimer = setInterval(async () => {
    try {
      const shared = readSharedState();
      const sig = JSON.stringify({
        b: shared._wfLastSync || 0,
        e: shared.currentEmail || '',
        c: shared.bundle ? (Array.isArray(shared.bundle.accounts) ? shared.bundle.accounts.length : 0) : 0,
        d: shared.bundle && Array.isArray(shared.bundle.accounts) ? shared.bundle.accounts.map(a => a && a.daily).join(',') : '',
      });
      // detail panel 每次都刷新（不依赖签名），保证实时数据
      try { refreshDetailPanel && refreshDetailPanel(); } catch {}
      if (sig !== lastSharedSig) {
        lastSharedSig = sig;
        panelProvider?.refresh();
        if (accountsOverviewPanel) renderAccountsOverview(context);
      }
      // 自动按日额度切号
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      if (!cfg.get('autoQuotaSwitch', false)) return;
      if (Date.now() - lastAutoSwitchAt < 5 * 60 * 1000) return; // 防抖 5 分钟
      const threshold = Math.max(1, Math.min(99, Number(cfg.get('autoQuotaThreshold', 15) || 15)));
      const curEmail = shared.currentEmail || context.globalState.get('lastEmail', '');
      const curAcc = curEmail ? findBundleAccount(curEmail) : null;
      if (!curAcc || curAcc.daily === undefined || curAcc.daily === null) return;
      if (Number(curAcc.daily) >= threshold) return;
      const best = pickBestAccountByDaily();
      if (!best || !best.email) return;
      if (String(best.email).toLowerCase() === String(curEmail).toLowerCase()) return;
      if ((Number(best.daily) || 0) <= Number(curAcc.daily) + 5) return; // 至少高 5 个百分点才值得切
      lastAutoSwitchAt = Date.now();
      vscode.window.setStatusBarMessage('⚡ 当前 ' + curEmail + ' 日额度 ' + curAcc.daily + '% < ' + threshold + '%，自动切到 ' + best.email, 4000);
      try { await sendBridgeRequest('localSwitchTo', { email: best.email }); } catch (e) { console.warn('[wfSwitchPlus] auto switch failed:', e && e.message); }
    } catch {}
  }, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(liveTimer) });
  installBuiltinContinuePs1().catch(() => {});
  try { startContinueHttpServer(context); } catch (e) { console.warn('[wfSwitchPlus] continue http init failed:', e.message); }
  promptInstallContinueSupport(context);
  // 自动注入伴生桥：原版在但桥版本不一致或缺失时静默更新
  originalBridge.ensureBridgeAuto()
    .then(r => { if (r && r.ok && !r.alreadyInjected && !r.skipped) vscode.window.setStatusBarMessage('已为原版插件注入伴生桥，重载后启用真实账号同步', 4000); })
    .catch(e => console.warn('[wfSwitchPlus] bridge inject failed:', e && e.message))
    .finally(() => refreshBridgeStatus());
}

function deactivate() {
  try { stopContinueHttpServer(); } catch {}
}

module.exports = { activate, deactivate };
