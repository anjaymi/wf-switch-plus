const vscode = require('vscode');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { getTokenDetailHtml } = require('./tokenDetailHtml');
const { detectCurrentModel, estimateModelCost, getModelInfo } = require('./modelCatalog');
const { ACCOUNT_MGR_DIR } = require('./shared/paths');
const { readSharedState: readSharedStateSync, writeSharedState } = require('./state/sharedState');

const TOKEN_USAGE_FILE = path.join(ACCOUNT_MGR_DIR, 'token-usage.json');
const QUOTA_BASELINE_KEY = 'quotaBaselineV1';

let refreshPanel = null;
let extContext = null;
let detailPanel = null;
let cachedModelState = null;
let cachedModelAt = 0;

function getCurrentModelState(stats, pricing) {
  const now = Date.now();
  const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
  const override = String(cfg.get('currentModelOverride', '') || '').trim();
  if (override) {
    cachedModelState = { id: override, info: getModelInfo(override), source: 'manual', detectedAt: now };
    cachedModelAt = now;
  } else if (!cachedModelState || cachedModelState.source === 'manual' || now - cachedModelAt > 10000) {
    cachedModelState = detectCurrentModel();
    cachedModelAt = now;
  }
  const modelId = cachedModelState && cachedModelState.id || '';
  const tokenTotal = stats && (stats.totalRealTokens || stats.totalEstimatedTokens) || 0;
  const cost = estimateModelCost(tokenTotal, modelId, {
    cached: pricing.mixCached,
    input: pricing.mixInput,
    output: pricing.mixOutput,
  });
  return Object.assign({}, cachedModelState || {}, {
    costKnown: !!(cost && cost.known),
    estimatedCost: cost && cost.cost || 0,
    blendedPer1M: cost && cost.blendedPer1M || 0,
    costSource: cost && cost.source || 'unknown',
    price: cost && cost.known ? {
      inputPer1M: cost.inputPer1M || 0,
      cachedPer1M: cost.cachedPer1M || 0,
      outputPer1M: cost.outputPer1M || 0,
      creditMultiplier: cost.creditMultiplier,
      officialLabel: cost.officialLabel || '',
      modelUid: cost.modelUid || modelId,
      denominator: cost.denominator || '1M tokens',
    } : null,
  });
}

function setTokenRefreshHandler(handler) {
  refreshPanel = typeof handler === 'function' ? handler : null;
}

function setTokenContext(ctx) { extContext = ctx; }

function estimateTextTokens(text) {
  const s = String(text || '');
  if (!s) return 0;
  const cjk = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const kana = (s.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const hangul = (s.match(/[\uac00-\ud7af]/g) || []).length;
  const word = (s.match(/[A-Za-z]+/g) || []).reduce((a, w) => a + w.length, 0);
  const digit = (s.match(/[0-9]+/g) || []).reduce((a, w) => a + w.length, 0);
  const whitespace = (s.match(/\s/g) || []).length;
  const symbols = s.length - cjk - kana - hangul - word - digit - whitespace;
  const tokens =
    cjk * 1.0 +          // 中文 ≈ 1 char / token
    kana * 0.9 +         // 假名
    hangul * 0.9 +       // 谚文
    word / 4 +           // 英文词 ≈ 4 char / token
    digit / 3 +          // 数字 ≈ 3 char / token
    whitespace / 6 +     // 空白字符
    symbols / 2.5;       // 代码/标点/符号
  return Math.max(1, Math.ceil(tokens));
}

// 附件估算：文件用大小/2 估算 char → token；图片按 OpenAI 近似公式
function estimateAttachmentTokens(att) {
  if (!att || !att.path) return 0;
  try {
    const st = fsSync.statSync(att.path);
    if (!st.isFile()) return 0;
    if (att.type === 'image') {
      // 基础 85 + 每 512 像素瓦片 ~170；没法读像素时按文件大小近似：每 1KB ≈ 25 tokens
      return 85 + Math.ceil(st.size / 1024) * 25;
    }
    // 文本文件：1 字节 ≈ 0.25 token（英文偏向），中文密集文件也不会超 1 token/byte
    return Math.ceil(st.size * 0.3);
  } catch { return 0; }
}

function estimateAttachmentsTokens(list) {
  if (!Array.isArray(list) || !list.length) return 0;
  return list.reduce((sum, a) => sum + estimateAttachmentTokens(a), 0);
}

function getTokenUsageDefault() {
  return {
    version: 1,
    totalRequests: 0,
    totalEstimatedTokens: 0,
    totalRealTokens: 0,
    realSamples: 0,
    realOffsets: {},
    totalDetailsTokens: 0,
    longDetailsCount: 0,
    highRiskCount: 0,
    lastAt: '',
    last: null,
    lastReal: null,
    recent: [],
    recentReal: [],
  };
}

function readTokenUsageStatsSync() {
  try {
    if (!fsSync.existsSync(TOKEN_USAGE_FILE)) return getTokenUsageDefault();
    return Object.assign(getTokenUsageDefault(), JSON.parse(fsSync.readFileSync(TOKEN_USAGE_FILE, 'utf8')));
  } catch {
    return getTokenUsageDefault();
  }
}

async function writeTokenUsageStats(stats) {
  await fs.mkdir(ACCOUNT_MGR_DIR, { recursive: true });
  await fs.writeFile(TOKEN_USAGE_FILE, JSON.stringify(stats, null, 2), 'utf8');
}

async function recordContinueTokenUsage(body = {}) {
  const reason = String(body.reason || '');
  const details = String(body.details || '');
  const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
  const savePoints = cfg.get('enableSavePoints', true);
  const baseContextTokens = Math.max(0, Number(cfg.get('baseContextTokens', 2000) || 0));
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const reasonTokens = estimateTextTokens(reason);
  const detailsTokens = estimateTextTokens(details);
  const attachmentTokens = estimateAttachmentsTokens(attachments);
  const visibleTokens = reasonTokens + detailsTokens + attachmentTokens;
  const estimatedTokens = visibleTokens + baseContextTokens;
  const baselineDetailsTokens = Math.max(detailsTokens, savePoints ? 120 : detailsTokens);
  const savedTokens = Math.max(0, baselineDetailsTokens - detailsTokens);
  const riskScore = Math.min(100, Math.round(
    Math.min(detailsTokens / 600, 1) * 50 +
    Math.min(attachmentTokens / 2000, 1) * 30 +
    Math.min(visibleTokens / 4000, 1) * 20
  ));
  const riskLevel = riskScore >= 70 ? 'high' : (riskScore >= 35 ? 'medium' : 'low');
  const riskReasons = [];
  if (detailsTokens > 300) riskReasons.push('details 过长');
  if (attachmentTokens > 2000) riskReasons.push('附件偏大');
  if (visibleTokens > 3000) riskReasons.push('单次可观测上下文偏大');
  if (!savePoints) riskReasons.push('省积分模式未开启');
  const item = {
    at: new Date().toISOString(),
    reasonChars: reason.length,
    detailsChars: details.length,
    reasonTokens,
    detailsTokens,
    attachmentTokens,
    attachmentCount: attachments.length,
    baseContextTokens,
    visibleTokens,
    estimatedTokens,
    savedTokens,
    savePoints,
    longDetails: detailsTokens > 300,
    riskScore,
    riskLevel,
    riskReasons,
  };
  const pricing = getPricingConfig();
  const modelState = getCurrentModelState({ totalEstimatedTokens: estimatedTokens }, pricing);
  item.modelId = modelState && modelState.id || '';
  item.modelName = modelState && modelState.info && modelState.info.name || item.modelId || '';
  item.modelCredit = modelState && modelState.info && modelState.info.credit;
  item.modelCost = estimateModelCost(estimatedTokens, item.modelId, {
    cached: pricing.mixCached,
    input: pricing.mixInput,
    output: pricing.mixOutput,
  }).cost || 0;
  const stats = readTokenUsageStatsSync();
  stats.totalRequests += 1;
  stats.totalEstimatedTokens += estimatedTokens;
  stats.totalSavedTokens += savedTokens;
  stats.totalDetailsTokens += detailsTokens;
  if (item.longDetails) stats.longDetailsCount += 1;
  if (item.riskLevel === 'high') stats.highRiskCount = (stats.highRiskCount || 0) + 1;
  stats.lastAt = item.at;
  stats.last = item;
  stats.recent = [item, ...(Array.isArray(stats.recent) ? stats.recent : [])].slice(0, 50);
  await writeTokenUsageStats(stats);
  if (item.longDetails) {
    vscode.window.setStatusBarMessage(`WF Token 检查：details 约 ${detailsTokens} tokens，建议开启省积分模式`, 5000);
  }
  if (refreshPanel) refreshPanel();
  try { renderDetail(); } catch {}
  return item;
}

async function recordRealTokenUsage(body = {}) {
  const total = Math.max(0, Number(body.total || 0));
  if (!total) return null;
  const cascadeId = String(body.cascadeId || '');
  const offset = Math.max(0, Number(body.offset || 0));
  const stats = readTokenUsageStatsSync();
  stats.realOffsets = stats.realOffsets && typeof stats.realOffsets === 'object' ? stats.realOffsets : {};
  let delta = total;
  if (cascadeId) {
    const prev = stats.realOffsets[cascadeId];
    if (prev && Number(prev.offset || 0) === offset) {
      const prevTotal = Math.max(0, Number(prev.total || 0));
      if (total <= prevTotal) return null;
      delta = total - prevTotal;
    }
  }
  const item = {
    at: new Date().toISOString(),
    cascadeId,
    offset,
    total: delta,
    rawTotal: total,
    entryCount: Math.max(0, Number(body.entryCount || 0)),
    aggregatedByField: body.aggregatedByField || {},
    source: String(body.source || ''),
    auto: !!body.auto,
  };
  if (cascadeId) {
    stats.realOffsets[cascadeId] = { offset, total, at: item.at };
  }
  stats.totalRealTokens = Math.max(0, Number(stats.totalRealTokens || 0)) + delta;
  stats.realSamples = Math.max(0, Number(stats.realSamples || 0)) + 1;
  stats.lastReal = item;
  stats.recentReal = [item, ...(Array.isArray(stats.recentReal) ? stats.recentReal : [])].slice(0, 50);
  await writeTokenUsageStats(stats);
  if (refreshPanel) refreshPanel();
  try { renderDetail(); } catch {}
  return item;
}

function buildTokenUsageSummary() {
  const stats = readTokenUsageStatsSync();
  const avg = stats.totalRequests ? Math.round(stats.totalEstimatedTokens / stats.totalRequests) : 0;
  const last = stats.last;
  return [
    `请求次数: ${stats.totalRequests}`,
    `估算总 token: ${stats.totalEstimatedTokens}`,
    `真实总 token: ${stats.totalRealTokens || 0}`,
    `估算节约 token: ${stats.totalSavedTokens}`,
    `平均每次: ${avg}`,
    `长 details 次数: ${stats.longDetailsCount}`,
    last ? `最近一次: ${last.estimatedTokens} tokens（details ${last.detailsTokens}）` : '最近一次: 无',
  ].join('\n');
}

function renderDetail() {
  if (!detailPanel) return;
  const stats = readTokenUsageStatsSync();
  const pricing = getPricingConfig();
  const localBaselines = extContext ? getQuotaBaselines(extContext) : {};
  const shared = readSharedStateSync();
  const baselines = Object.assign({}, shared.baselines || {}, localBaselines);
  const currentEmail = shared.currentEmail || (extContext && extContext.globalState.get('lastEmail', '')) || '';
  const bundleAccounts = (shared && shared.bundle && Array.isArray(shared.bundle.accounts)) ? shared.bundle.accounts : [];
  const modelState = getCurrentModelState(stats, pricing);
  detailPanel.webview.html = getTokenDetailHtml({ stats, pricing, baselines, currentEmail, bundleAccounts, modelState });
}

async function showTokenUsageStats() {
  if (detailPanel) { try { detailPanel.reveal(vscode.ViewColumn.Active); } catch {} renderDetail(); return; }
  detailPanel = vscode.window.createWebviewPanel('wfSwitchPlusTokenDetail', 'WF 增强：Token 详情', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  detailPanel.onDidDispose(() => { detailPanel = null; });
  detailPanel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg || !msg.type) return;
    try {
      if (msg.type === 'requestRefresh') {
        try {
          const _s = readTokenUsageStatsSync();
          const _p = getPricingConfig();
          const _shared = readSharedStateSync();
          const _bAccs = (_shared && _shared.bundle && Array.isArray(_shared.bundle.accounts)) ? _shared.bundle.accounts.filter(a=>a&&a.email) : [];
          const _curEmail = _shared.currentEmail || (extContext && extContext.globalState.get('lastEmail', '')) || '';
          const _curKey = String(_curEmail || '').toLowerCase();
          const _curAcc = _bAccs.find(a => a && a.email && String(a.email).toLowerCase() === _curKey) || {};
          const _dq = _p.dailyQuotaTokens || 1;
          const _dVals = _bAccs.map(a=>a.daily).filter(v=>v!==undefined&&v!==null&&!Number.isNaN(Number(v))).map(Number);
          const _wVals = _bAccs.map(a=>a.weekly).filter(v=>v!==undefined&&v!==null&&!Number.isNaN(Number(v))).map(Number);
          const _avg = _dVals.length ? _dVals.reduce((s,v)=>s+v,0)/_dVals.length : null;
          const _avgW = _wVals.length ? _wVals.reduce((s,v)=>s+v,0)/_wVals.length : null;
          const _usedR = _avg===null ? 0 : Math.max(0,1-_avg/100);
          const _aggUsd = _usedR*(_p.dailyQuotaUsd||0)*_bAccs.length;
          const _aggTok = _usedR*_dq*_bAccs.length;
          const _localTokens = (_s.totalRealTokens || _s.totalEstimatedTokens || 0);
          const _modelState = getCurrentModelState(_s, _p);
          const _localCost = _modelState && _modelState.costKnown ? (_modelState.estimatedCost || 0) : _localTokens*_p.blendedPer1M/1e6;
          const _best = _bAccs.reduce((best, cur) => {
            const bd = best && best.daily !== undefined ? Number(best.daily) : -1;
            const cd = cur && cur.daily !== undefined ? Number(cur.daily) : -1;
            return cd > bd ? cur : best;
          }, null);
          const _avgReq = _s.totalRequests ? Math.round((_s.totalEstimatedTokens||0) / _s.totalRequests) : 0;
          const _last = _s.last || null;
          const _hasReal = !!(_s.totalRealTokens || 0);
          const _realItems = Array.isArray(_s.recentReal) ? _s.recentReal.filter(r => r && Number(r.total) > 0) : [];
          const _obsTotal = _hasReal ? (_s.totalRealTokens || 0) : (_s.totalEstimatedTokens || 0);
          const _obsCount = _hasReal ? (_s.realSamples || _realItems.length || 0) : (_s.totalRequests || 0);
          const _obsAvg = _hasReal && _obsCount ? Math.round(_obsTotal / _obsCount) : _avgReq;
          const _obsLast = _hasReal ? (_s.lastReal || _realItems[0] || null) : _last;
          const _obsLastTokens = _obsLast ? (_hasReal ? Number(_obsLast.total || 0) : Number(_obsLast.estimatedTokens || 0)) : 0;
          detailPanel.webview.postMessage({
            type:'liveUpdate',
            heroTotalCost: _localCost+_aggUsd,
            heroTotalTokens: _localTokens+_aggTok,
            aggregateDailyUsd: _aggUsd,
            aggregateDailyTokens: _aggTok,
            localCost: _localCost,
            localTokens: _localTokens,
            hasRealTokens: !!(_s.totalRealTokens || 0),
            realSamples: _s.realSamples || 0,
            accountCount: _bAccs.length,
            validAccountCount: _bAccs.filter(a => a.valid !== false).length,
            avgDaily: _avg===null?null:Math.round(_avg),
            avgWeekly: _avgW===null?null:Math.round(_avgW),
            poolDailyUsed: _avg===null?0:Math.max(0,100-Math.round(_avg)),
            poolWeeklyUsed: _avgW===null?0:Math.max(0,100-Math.round(_avgW)),
            currentEmail: _curEmail,
            currentDaily: _curAcc && _curAcc.daily!==undefined ? Number(_curAcc.daily) : null,
            currentWeekly: _curAcc && _curAcc.weekly!==undefined ? Number(_curAcc.weekly) : null,
            bestEmail: _best && _best.email || '',
            bestDaily: _best && _best.daily!==undefined ? Number(_best.daily) : null,
            requests: _s.totalRequests||0,
            savedTokens: _s.totalSavedTokens||0,
            avgTokens: _avgReq,
            lastTokens: _last ? (_last.estimatedTokens||0) : 0,
            lastDetailsTokens: _last ? (_last.detailsTokens||0) : 0,
            highRiskCount: _s.highRiskCount||0,
            obsHasReal: _hasReal,
            obsTotal: _obsTotal,
            obsCount: _obsCount,
            obsAvg: _obsAvg,
            obsLastTokens: _obsLastTokens,
            obsLastSub: _obsLast ? (_hasReal ? 'raw ' + (_obsLast.rawTotal || _obsLast.total || 0) + '  样本 ' + (_s.realSamples || 0) + ' 条' : 'details ' + (_obsLast.detailsTokens || 0) + '  高风险 ' + (_s.highRiskCount || 0) + ' 次') : '暂无记录',
            obsRisk: _hasReal ? '真实样本' : (_last ? ({ low: '低风险', medium: '中风险', high: '高风险' }[_last.riskLevel] || '未知') : '无数据'),
            obsRiskColor: _hasReal ? '#22c55e' : (_last ? ({ low: '#22c55e', medium: '#f59e0b', high: '#ef4444' }[_last.riskLevel] || '#94a3b8') : '#94a3b8'),
            obsRiskSub: _hasReal ? '当前显示真实 Token 消耗样本' : (_last && _last.riskReasons && _last.riskReasons.length ? _last.riskReasons.join('，') : '当前上下文较轻'),
            model: _modelState,
          });
        } catch {}
        return;
      } else if (msg.type === 'setManualModel') {
        const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
        const cur = String(cfg.get('currentModelOverride', '') || '');
        const val = await vscode.window.showInputBox({
          prompt: '手动指定当前模型 ID；留空可清除手动指定，恢复自动探测',
          value: cur,
          placeHolder: '例如 claude-opus-4-7-medium / gpt-5.5-high',
          ignoreFocusOut: true,
        });
        if (val === undefined) return;
        await cfg.update('currentModelOverride', String(val || '').trim(), vscode.ConfigurationTarget.Global);
        cachedModelState = null;
        cachedModelAt = 0;
        vscode.window.setStatusBarMessage(val ? '已手动指定当前模型: ' + String(val).trim() : '已清除手动模型指定', 2500);
      } else if (msg.type === 'clearStats') {
        await resetTokenUsageStats();
      } else if (msg.type === 'resetAllBaselines') {
        if (extContext) await resetQuotaBaseline(extContext, '');
        vscode.window.showInformationMessage('已重置全部账号基线');
      } else if (msg.type === 'resetCurrentBaseline') {
        const email = extContext ? extContext.globalState.get('lastEmail', '') : '';
        if (extContext && email) await resetQuotaBaseline(extContext, email);
        vscode.window.showInformationMessage(email ? `已重置 ${email} 基线` : '当前未识别账号');
      } else if (msg.type === 'refreshAll' || msg.type === 'refreshCurrent') {
        try { await vscode.commands.executeCommand('wfSwitch.refreshAccounts'); } catch {}
        vscode.window.setStatusBarMessage('已请求原版刷新账号额度', 2500);
      } else if (msg.type === 'importClipboard') {
        const text = await vscode.env.clipboard.readText();
        try {
          const data = JSON.parse(text || '{}');
          await writeSharedState({ baselines: data.baselines || {}, currentEmail: data.currentEmail || '' });
          vscode.window.showInformationMessage('已从剪贴板导入共享账号状态');
        } catch (e) {
          vscode.window.showErrorMessage('剪贴板内容不是合法 JSON：' + (e && e.message || e));
        }
      }
    } catch (e) {
      vscode.window.showErrorMessage('Token 详情操作失败: ' + (e && e.message || e));
    }
    renderDetail();
    if (refreshPanel) refreshPanel();
  });
  renderDetail();
}

async function resetTokenUsageStats() {
  await writeTokenUsageStats(getTokenUsageDefault());
  if (refreshPanel) refreshPanel();
  vscode.window.showInformationMessage('已重置 WF Token 估算统计');
}

// 额度基线：记录首次观察到的账号 daily/weekly，作为本轮增量基准
function getQuotaBaselines(context) {
  return context.globalState.get(QUOTA_BASELINE_KEY, {}) || {};
}

async function updateQuotaBaseline(context, email, snap) {
  if (!email || !snap) return;
  const key = String(email).toLowerCase();
  const map = getQuotaBaselines(context);
  if (!map[key]) {
    map[key] = { email: key, daily: snap.daily, weekly: snap.weekly, at: Date.now() };
    await context.globalState.update(QUOTA_BASELINE_KEY, map);
  }
}

// 读取美元定价与混合比例，计算 blended rate 和每日 token 上限
async function updateQuotaBaselinesBulk(context, accounts) {
  if (!Array.isArray(accounts) || !accounts.length) return { changed: 0 };
  const map = getQuotaBaselines(context);
  let changed = 0;
  for (const a of accounts) {
    if (!a || typeof a.daily !== 'number' || typeof a.weekly !== 'number') continue;
    if (a.local) continue; // 本地导入账号没有真实额度信息
    const key = String(a.email).toLowerCase();
    const prev = map[key];
    if (!prev) {
      map[key] = { email: key, daily: a.daily, weekly: a.weekly, at: Date.now() };
      changed++;
    } else if (a.daily > prev.daily + 1) {
      // 额度刷新（例如跨日回满），重置为当前值，避免出现负增量
      map[key] = { email: key, daily: a.daily, weekly: a.weekly, at: Date.now() };
      changed++;
    }
  }
  if (changed) await context.globalState.update(QUOTA_BASELINE_KEY, map);
  return { changed };
}

async function resetQuotaBaseline(context, email) {
  const key = String(email || '').toLowerCase();
  const map = getQuotaBaselines(context);
  if (key && map[key]) {
    delete map[key];
  } else if (!key) {
    for (const k of Object.keys(map)) delete map[k];
  }
  await context.globalState.update(QUOTA_BASELINE_KEY, map);
}

function getPricingConfig() {
  const cfg = vscode.workspace.getConfiguration('wfSwitchPlus');
  const dailyQuotaUsd = Math.max(0, Number(cfg.get('dailyQuotaUsd', 24.48) || 0));
  const weeklyQuotaUsd = Math.max(0, Number(cfg.get('weeklyQuotaUsd', 48.86) || 0));
  const priceInput = Math.max(0, Number(cfg.get('pricing.inputPer1M', 5) || 0));
  const priceCached = Math.max(0, Number(cfg.get('pricing.cachedPer1M', 0.364) || 0));
  const priceOutput = Math.max(0, Number(cfg.get('pricing.outputPer1M', 25) || 0));
  let mixC = Math.max(0, Number(cfg.get('tokenMix.cached', 0.5) || 0));
  let mixI = Math.max(0, Number(cfg.get('tokenMix.input', 0.3) || 0));
  let mixO = Math.max(0, Number(cfg.get('tokenMix.output', 0.2) || 0));
  const sum = mixC + mixI + mixO || 1;
  mixC /= sum; mixI /= sum; mixO /= sum; // 归一化，避免用户填和不为 1
  const blendedPer1M = mixC * priceCached + mixI * priceInput + mixO * priceOutput;
  const manualDailyTokens = Math.max(0, Number(cfg.get('dailyQuotaTokens', 0) || 0));
  const dailyQuotaTokens = manualDailyTokens > 0
    ? manualDailyTokens
    : (blendedPer1M > 0 ? Math.round(dailyQuotaUsd / blendedPer1M * 1_000_000) : 0);
  return { dailyQuotaUsd, weeklyQuotaUsd, priceInput, priceCached, priceOutput,
    mixCached: mixC, mixInput: mixI, mixOutput: mixO, blendedPer1M, dailyQuotaTokens, manualDailyTokens };
}

// 对所有账号批量更新基线，并在额度刷新时自动重置（cur.daily 明显大于 baseline.daily 视为新周期）
function refreshDetailPanel() { try { renderDetail(); } catch {} }

module.exports = {
  refreshDetailPanel,
  setTokenRefreshHandler, setTokenContext, estimateTextTokens, estimateAttachmentTokens, estimateAttachmentsTokens, getTokenUsageDefault, readTokenUsageStatsSync, writeTokenUsageStats, recordContinueTokenUsage, recordRealTokenUsage, buildTokenUsageSummary, showTokenUsageStats, resetTokenUsageStats, getQuotaBaselines, updateQuotaBaseline, updateQuotaBaselinesBulk, resetQuotaBaseline, getPricingConfig };
