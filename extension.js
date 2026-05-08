const vscode = require('vscode');
const pkg = require('./package.json');
const { initContinueSupport, openContinueDialog, installContinueSupport, installBuiltinContinuePs1, configureWfContinueGlobalRules, copyClaudeContextMcpConfig, startContinueHttpServer, stopContinueHttpServer, getContinueScriptPath } = require('./src/continueSupport');
const { setTokenRefreshHandler, setTokenContext, showTokenUsageStats, resetTokenUsageStats, readTokenUsageStatsSync, getPricingConfig, refreshDetailPanel, recordRealTokenUsage } = require('./src/tokenEstimator');
const modelCatalog = require('./src/modelCatalog');
const windsurfInjector = require('./src/windsurfInjector');
const windsurfInternals = require('./src/windsurfInternals');
const { hackWindsurf, checkLoginStatus } = require('./src/windsurfAuth');
const { getPlusPanelHtml, getPlusPanelLiveData } = require('./src/plusPanelHtml');
const originalBridge = require('./src/originalBridge');
const { readSharedState, buildEffectiveShared, findEffectiveAccount, getEffectiveAccounts } = require('./src/state/sharedState');
const { sendBridgeRequest } = require('./src/state/bridgeRequest');
const { pickBestAccountByDaily } = require('./src/domain/accountSelector');
const { createAccountsController } = require('./src/controllers/accountsController');
const { createQuickActionsController } = require('./src/controllers/quickActionsController');
const { createHealthController } = require('./src/controllers/healthController');
const { createFastSwitchService } = require('./src/services/fastSwitchService');

let panelProvider = null;
let accountsController = null;
let fastSwitchService = null;
let quickActionsController = null;
let healthController = null;
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

function getPanelHtml() {
  const stats = readTokenUsageStatsSync();
  const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
  const shared = buildEffectiveShared(readSharedState());
  const bundleAccounts = getEffectiveAccounts(shared);
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
  const shared = buildEffectiveShared(readSharedState());
  const bundleAccounts = getEffectiveAccounts(shared);
  return getPlusPanelLiveData({
    stats,
    pricing: getPricingConfig(),
    bundleAccounts,
  });
}

async function notifyStaleOriginalBridge(context, status) {
  if (!status || !status.installed || !status.injected) return;
  if (!status.currentBridgeMarker || status.bridgeMarker === status.currentBridgeMarker) return;
  const key = 'originalBridgeStalePrompt:' + status.currentBridgeMarker;
  if (context.globalState.get(key, false)) return;
  await context.globalState.update(key, true);
  const pick = await vscode.window.showWarningMessage(
    '原版伴生桥版本过旧，星火导入账号可能被原版刷新覆盖。请重注入伴生桥并重载 Windsurf。',
    '立即重注入',
    '稍后'
  );
  if (pick === '立即重注入') {
    const r = await originalBridge.injectBridge();
    if (r.ok) vscode.window.showInformationMessage(r.alreadyInjected ? '原版伴生桥已是最新版本' : '已重注入原版伴生桥，请重载 Windsurf 生效');
    else vscode.window.showErrorMessage('重注入失败：' + r.error);
    await refreshBridgeStatus();
  }
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
      continueHealthCheck: 'wfSwitchPlus.continueHealthCheck',
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
      quickActions: 'wfSwitchPlus.quickActions',
      focusOriginalPanel: 'wfSwitchPlus.focusOriginalPanel',
      smartSwitch: 'wfSwitchPlus.smartSwitch',
      fastSwitchBest: 'wfSwitchPlus.fastSwitchBest',
      fastSwitchPick: 'wfSwitchPlus.fastSwitchPick',
      refreshAccountsViaBridge: 'wfSwitchPlus.refreshAccountsViaBridge',
      refreshModelCatalog: 'wfSwitchPlus.refreshModelCatalog',
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
    if (msg.type === 'fastSwitchToEmail') {
      await fastSwitchService.switchByEmail(msg.email);
      this.refresh();
      return;
    }
    if (msg.type === 'batchActivateCodes') {
      await quickActionsController.batchActivateCodes(msg.codes);
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
  fastSwitchService = createFastSwitchService({
    context,
    sendBridgeRequest,
    refreshPanel: () => panelProvider?.refresh(),
    refreshAccountsOverview: () => accountsController?.render(),
    refreshDetailPanel,
  });
  quickActionsController = createQuickActionsController({ sendBridgeRequest });
  accountsController = createAccountsController({
    context,
    getBridgeStatus: () => bridgeStatusCache,
    sendBridgeRequest,
    smartSwitch: (options) => fastSwitchService.switchBest(options),
    switchTo: (email) => fastSwitchService.switchByEmail(email),
  });
  healthController = createHealthController({ context, installContinueSupport, startContinueHttpServer });
  setTokenRefreshHandler(() => panelProvider?.refresh());
  setTokenContext(context);
  // 启动时静默刷新一次官方模型价格表（解析 Windsurf 本地缓存，无网络请求）
  modelCatalog.refreshDynamicCatalog().then((r) => {
    if (r && r.ok) {
      console.log('[wfSwitchPlus] 已加载 Windsurf 官方价格表，模型数=' + r.models);
      panelProvider?.refresh();
    } else if (r && r.error) {
      console.warn('[wfSwitchPlus] 加载官方价格表失败：' + r.error);
    }
  }).catch((e) => console.warn('[wfSwitchPlus] 加载官方价格表异常：' + (e && e.message || e)));
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
    vscode.commands.registerCommand('wfSwitchPlus.continueHealthCheck', () => healthController.runContinueHealthCheck({ interactive: true })),
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
    vscode.commands.registerCommand('wfSwitchPlus.injectWindsurfBridge', async () => {
      const status = await windsurfInjector.getStatus();
      if (!status.installed) {
        vscode.window.showWarningMessage('未检测到 Windsurf 内置扩展，无法注入桥');
        return;
      }
      if (status.injected) {
        const pick = await vscode.window.showInformationMessage(
          'Windsurf 桥已注入（版本 ' + (status.bridgeMarker || '?') + '）。是否重新注入？',
          '重新注入', '取消'
        );
        if (pick !== '重新注入') return;
      } else {
        const pick = await vscode.window.showWarningMessage(
          '将修改 Windsurf 内置扩展的 extension.js 以暴露内部实例（csrfToken/LS 地址），供 wf-switch-plus 读取真实 Token 消耗。\n\n注入前会自动备份为 extension.js.wfplus.bak。修改完成后需要重启 Windsurf。\n\n继续？',
          { modal: true }, '注入', '取消'
        );
        if (pick !== '注入') return;
      }
      const r = await windsurfInjector.inject();
      if (r.ok) {
        const msg = r.alreadyInjected ? '桥已是最新版本，无需重新注入' : '注入成功，请重启 Windsurf 后验证';
        vscode.window.showInformationMessage(msg);
      } else {
        vscode.window.showErrorMessage('注入失败：' + r.error);
      }
    }),
    vscode.commands.registerCommand('wfSwitchPlus.removeWindsurfBridge', async () => {
      const pick = await vscode.window.showWarningMessage(
        '将从 Windsurf 内置扩展中移除 wf-switch-plus 注入桥，并恢复备份（若存在）。重启 Windsurf 后生效。',
        { modal: true }, '移除', '取消'
      );
      if (pick !== '移除') return;
      const r = await windsurfInjector.remove();
      if (r.ok) vscode.window.showInformationMessage(r.restoredFromBackup ? '已从备份恢复' : '已移除桥代码');
      else vscode.window.showErrorMessage('移除失败：' + r.error);
    }),
    vscode.commands.registerCommand('wfSwitchPlus.verifyWindsurfBridge', async () => {
      const injStatus = await windsurfInjector.getStatus();
      const diag = windsurfInternals.diagnose();
      const lines = [];
      lines.push('# Windsurf 桥验证');
      lines.push('');
      lines.push('生成时间：' + new Date().toISOString());
      lines.push('');
      lines.push('## 注入状态');
      lines.push('```json');
      lines.push(JSON.stringify(injStatus, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('## 运行时桥对象');
      lines.push('```json');
      lines.push(JSON.stringify(diag, null, 2));
      lines.push('```');
      lines.push('');
      const candidates = windsurfInternals.findTrajectoryCandidates();
      lines.push('## 当前会话候选');
      lines.push('- cascadeId 候选：' + candidates.cascadeIds.length);
      lines.push('- trajectoryId 候选：' + candidates.trajectoryIds.length);
      if (candidates.cascadeIds.length || candidates.trajectoryIds.length) {
        lines.push('```json');
        lines.push(JSON.stringify(candidates, null, 2));
        lines.push('```');
      }
      lines.push('');
      // 如果凭据 OK，试调一个无参 RPC（GetUserStatus）验证链路
      if (diag.credentials && diag.credentials.ok) {
        lines.push('## 试调 GetUserStatus（验证 gRPC 链路）');
        try {
          const { grpcUnary } = require('./src/windsurfGrpc');
          const { buildRequestWithEmptyMetadata } = require('./src/windsurfRpcProto');
          const buf = await grpcUnary({
            address: diag.credentials.lsAddress,
            csrfToken: (windsurfInternals.getCredentials() || {}).csrfToken,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            body: buildRequestWithEmptyMetadata(),
            timeout: 5000,
          });
          lines.push('- ok，响应 ' + buf.length + ' 字节');
        } catch (e) {
          lines.push('- 失败：' + e.message);
        }
      } else {
        lines.push('## 试调 GetUserStatus');
        lines.push('- 跳过（凭据未就绪）');
        if (diag.credentials && diag.credentials.reason === 'ls-not-started') {
          lines.push('- 提示：请先在 Windsurf 里打开一个 Cascade 对话，让 LS 子进程启动，再回来验证');
        }
      }
      const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    vscode.commands.registerCommand('wfSwitchPlus.readWindsurfTrajectoryTokens', async () => {
      const cred = windsurfInternals.getCredentials();
      if (!cred.ok) {
        vscode.window.showWarningMessage('Windsurf 桥凭据未就绪：' + (cred.reason || 'unknown'));
        return;
      }
      const cascadeId = await vscode.window.showInputBox({
        prompt: '输入 Windsurf Cascade trajectory/cascade id，用于读取真实 generator metadata token',
        placeHolder: '例如从 Windsurf 日志/侦察结果中复制的 cascadeId',
        ignoreFocusOut: true,
      });
      if (!cascadeId) return;
      const offsetStr = await vscode.window.showInputBox({
        prompt: 'generator_metadata_offset，首次读取填 0',
        value: '0',
        ignoreFocusOut: true,
      });
      if (offsetStr === undefined) return;
      const offset = Math.max(0, Number(offsetStr) || 0);
      const lines = [];
      lines.push('# Windsurf 真实 Token 读取');
      lines.push('');
      lines.push('- cascadeId: `' + cascadeId + '`');
      lines.push('- offset: `' + offset + '`');
      lines.push('- lsAddress: `' + cred.lsAddress + '`');
      lines.push('');
      try {
        const meta = await windsurfInternals.getTrajectoryMetadata(cascadeId, offset, { timeout: 10000 });
        const saved = await recordRealTokenUsage({
          cascadeId,
          offset,
          accountEmail: readSharedState().currentEmail || context.globalState.get('lastEmail', ''),
          total: meta && meta.total || 0,
          entryCount: meta && meta.entryCount || 0,
          aggregatedByField: meta && meta.aggregatedByField || {},
        });
        lines.push('## 解析结果');
        lines.push(saved ? '- 已写入真实 Token 样本统计' : '- 未写入统计（total 为 0）');
        lines.push('```json');
        lines.push(JSON.stringify(meta, null, 2));
        lines.push('```');
      } catch (e) {
        lines.push('## 调用失败');
        lines.push('```text');
        lines.push(e && e.stack || String(e));
        lines.push('```');
      }
      const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    vscode.commands.registerCommand('wfSwitchPlus.refreshModelCatalog', async () => {
      const r = await modelCatalog.refreshDynamicCatalog();
      if (r && r.ok) {
        vscode.window.showInformationMessage('已同步 Windsurf 官方模型价格，共 ' + r.models + ' 条');
        panelProvider?.refresh();
      } else {
        vscode.window.showWarningMessage('同步官方模型价格失败：' + (r && r.error || '未知'));
      }
    }),
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
    vscode.commands.registerCommand('wfSwitchPlus.openAccountsOverview', () => accountsController.open()),
    vscode.commands.registerCommand('wfSwitchPlus.checkOriginalUpdate', () => runOriginalCommand('wfSwitch.checkUpdate')),
    vscode.commands.registerCommand('wfSwitchPlus.refreshAccountsViaBridge', async () => {
      const r = await sendBridgeRequest('refreshAccounts');
      if (r.ok) vscode.window.setStatusBarMessage('已请求原版刷新账号', 2000);
      else vscode.window.showWarningMessage('调用原版刷新失败：' + (r.error || '未知'));
      accountsController?.render();
    }),
    vscode.commands.registerCommand('wfSwitchPlus.quickActions', () => quickActionsController.openQuickActions()),
    vscode.commands.registerCommand('wfSwitchPlus.smartSwitch', () => fastSwitchService.switchBest()),
    vscode.commands.registerCommand('wfSwitchPlus.fastSwitchBest', () => fastSwitchService.switchBest()),
    vscode.commands.registerCommand('wfSwitchPlus.fastSwitchPick', () => fastSwitchService.switchPick()),
    vscode.commands.registerCommand('wfSwitchPlus.focusOriginalPanel', async () => {
      try { await vscode.commands.executeCommand('wfSwitch.panel.focus'); }
      catch { try { await vscode.commands.executeCommand('workbench.view.extension.wfSwitchView'); } catch (e) { vscode.window.showWarningMessage('无法聚焦原版面板：' + (e && e.message || e)); } }
    }),
    { dispose: () => { try { stopContinueHttpServer(); } catch {} } }
  );

  // 真·实时刷新：每 5 秒重渲染所有 webview + 检查自动切号
  let lastSharedSig = '';
  let lastAutoSwitchAt = 0;
  let lastRealTokenSyncAt = 0;
  let realTokenSyncBusy = false;
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
      if (!realTokenSyncBusy && Date.now() - lastRealTokenSyncAt > 15000) {
        realTokenSyncBusy = true;
        lastRealTokenSyncAt = Date.now();
        windsurfInternals.resolveCascadeIdFromCandidates({ offset: 0, timeout: 2500 })
          .then(async (r) => {
            if (!r || !r.cascadeId || !r.meta || !r.meta.total) return;
            await recordRealTokenUsage({
              cascadeId: r.cascadeId,
              offset: r.offset || 0,
              accountEmail: readSharedState().currentEmail || context.globalState.get('lastEmail', ''),
              total: r.meta.total || 0,
              entryCount: r.meta.entryCount || 0,
              aggregatedByField: r.meta.aggregatedByField || {},
              source: r.source || 'auto-candidate',
              auto: true,
            });
          })
          .catch(() => {})
          .finally(() => { realTokenSyncBusy = false; });
      }
      if (sig !== lastSharedSig) {
        lastSharedSig = sig;
        panelProvider?.refresh();
        if (accountsController?.hasPanel()) accountsController.render();
      }
      // 自动按日额度切号
      const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
      if (!cfg.get('autoQuotaSwitch', false)) return;
      if (Date.now() - lastAutoSwitchAt < 5 * 60 * 1000) return; // 防抖 5 分钟
      const threshold = Math.max(1, Math.min(99, Number(cfg.get('autoQuotaThreshold', 15) || 15)));
      const curEmail = shared.currentEmail || context.globalState.get('lastEmail', '');
      const curAcc = curEmail ? findEffectiveAccount(curEmail) : null;
      if (!curAcc || curAcc.daily === undefined || curAcc.daily === null) return;
      if (Number(curAcc.daily) >= threshold) return;
      const best = pickBestAccountByDaily();
      if (!best || !best.email) return;
      if (String(best.email).toLowerCase() === String(curEmail).toLowerCase()) return;
      if ((Number(best.daily) || 0) <= Number(curAcc.daily) + 5) return; // 至少高 5 个百分点才值得切
      lastAutoSwitchAt = Date.now();
      vscode.window.setStatusBarMessage('⚡ 当前 ' + curEmail + ' 日额度 ' + curAcc.daily + '% < ' + threshold + '%，自动切到 ' + best.email, 4000);
      try {
        await fastSwitchService.switchBest({ confirm: false });
      } catch (e) { console.warn('[wfSwitchPlus] auto switch failed:', e && e.message); }
    } catch {}
  }, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(liveTimer) });
  installBuiltinContinuePs1().catch(() => {});
  try { startContinueHttpServer(context); } catch (e) { console.warn('[wfSwitchPlus] continue http init failed:', e.message); }
  promptInstallContinueSupport(context);
  setTimeout(() => healthController.promptContinueHealthIfBroken().catch(e => console.warn('[wfSwitchPlus] continue health prompt failed:', e && e.message)), 20000);
  const continueHealthTimer = setInterval(() => healthController.promptContinueHealthIfBroken().catch(() => {}), 5 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(continueHealthTimer) });
  // 自动注入伴生桥：原版在但桥版本不一致或缺失时静默更新
  originalBridge.ensureBridgeAuto()
    .then(async r => {
      if (r && r.ok && !r.alreadyInjected && !r.skipped) {
        vscode.window.showWarningMessage('已为原版插件注入/升级伴生桥。请重载 Windsurf，让账号刷新与星火账号保护生效。', '重载窗口')
          .then(pick => { if (pick === '重载窗口') vscode.commands.executeCommand('workbench.action.reloadWindow'); });
      }
    })
    .catch(e => console.warn('[wfSwitchPlus] bridge inject failed:', e && e.message))
    .finally(async () => {
      await refreshBridgeStatus();
      await notifyStaleOriginalBridge(context, bridgeStatusCache);
    });
}

function deactivate() {
  try { stopContinueHttpServer(); } catch {}
}

module.exports = { activate, deactivate };
