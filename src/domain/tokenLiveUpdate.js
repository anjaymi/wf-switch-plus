'use strict';

function buildTokenLiveUpdate({ stats, pricing, shared, currentEmail, modelState }) {
  const accounts = shared.accounts || [];
  const curKey = String(currentEmail || '').toLowerCase();
  const curAcc = accounts.find(a => a && a.email && String(a.email).toLowerCase() === curKey) || {};
  const dailyQuotaTokens = pricing.dailyQuotaTokens || 1;
  const dailyVals = accounts.map(a => a.daily).filter(v => v !== undefined && v !== null && !Number.isNaN(Number(v))).map(Number);
  const weeklyVals = accounts.map(a => a.weekly).filter(v => v !== undefined && v !== null && !Number.isNaN(Number(v))).map(Number);
  const avgDaily = dailyVals.length ? dailyVals.reduce((s, v) => s + v, 0) / dailyVals.length : null;
  const avgWeekly = weeklyVals.length ? weeklyVals.reduce((s, v) => s + v, 0) / weeklyVals.length : null;
  const usedRatio = avgDaily === null ? 0 : Math.max(0, 1 - avgDaily / 100);
  const aggregateDailyUsd = usedRatio * (pricing.dailyQuotaUsd || 0) * accounts.length;
  const aggregateDailyTokens = usedRatio * dailyQuotaTokens * accounts.length;
  const localTokens = stats.totalRealTokens || stats.totalEstimatedTokens || 0;
  const localCost = modelState && modelState.costKnown ? (modelState.estimatedCost || 0) : localTokens * pricing.blendedPer1M / 1e6;
  const best = accounts.reduce((bestAcc, cur) => {
    const bd = bestAcc && bestAcc.daily !== undefined ? Number(bestAcc.daily) : -1;
    const cd = cur && cur.daily !== undefined ? Number(cur.daily) : -1;
    return cd > bd ? cur : bestAcc;
  }, null);
  const avgRequestTokens = stats.totalRequests ? Math.round((stats.totalEstimatedTokens || 0) / stats.totalRequests) : 0;
  const last = stats.last || null;
  const hasReal = !!(stats.totalRealTokens || 0);
  const realItems = Array.isArray(stats.recentReal) ? stats.recentReal.filter(r => r && Number(r.total) > 0) : [];
  const obsTotal = hasReal ? (stats.totalRealTokens || 0) : (stats.totalEstimatedTokens || 0);
  const obsCount = hasReal ? (stats.realSamples || realItems.length || 0) : (stats.totalRequests || 0);
  const obsAvg = hasReal && obsCount ? Math.round(obsTotal / obsCount) : avgRequestTokens;
  const obsLast = hasReal ? (stats.lastReal || realItems[0] || null) : last;
  const obsLastTokens = obsLast ? (hasReal ? Number(obsLast.total || 0) : Number(obsLast.estimatedTokens || 0)) : 0;
  return {
    type: 'liveUpdate',
    heroTotalCost: localCost + aggregateDailyUsd,
    heroTotalTokens: localTokens + aggregateDailyTokens,
    aggregateDailyUsd,
    aggregateDailyTokens,
    localCost,
    localTokens,
    hasRealTokens: hasReal,
    realSamples: stats.realSamples || 0,
    accountCount: accounts.length,
    validAccountCount: accounts.filter(a => a.valid !== false).length,
    avgDaily: avgDaily === null ? null : Math.round(avgDaily),
    avgWeekly: avgWeekly === null ? null : Math.round(avgWeekly),
    poolDailyUsed: avgDaily === null ? 0 : Math.max(0, 100 - Math.round(avgDaily)),
    poolWeeklyUsed: avgWeekly === null ? 0 : Math.max(0, 100 - Math.round(avgWeekly)),
    currentEmail,
    currentDaily: curAcc && curAcc.daily !== undefined ? Number(curAcc.daily) : null,
    currentWeekly: curAcc && curAcc.weekly !== undefined ? Number(curAcc.weekly) : null,
    bestEmail: best && best.email || '',
    bestDaily: best && best.daily !== undefined ? Number(best.daily) : null,
    requests: stats.totalRequests || 0,
    savedTokens: stats.totalSavedTokens || 0,
    avgTokens: avgRequestTokens,
    lastTokens: last ? (last.estimatedTokens || 0) : 0,
    lastDetailsTokens: last ? (last.detailsTokens || 0) : 0,
    highRiskCount: stats.highRiskCount || 0,
    obsHasReal: hasReal,
    obsTotal,
    obsCount,
    obsAvg,
    obsLastTokens,
    obsLastSub: obsLast ? (hasReal ? 'raw ' + (obsLast.rawTotal || obsLast.total || 0) + '  样本 ' + (stats.realSamples || 0) + ' 条' : 'details ' + (obsLast.detailsTokens || 0) + '  高风险 ' + (stats.highRiskCount || 0) + ' 次') : '暂无记录',
    obsRisk: hasReal ? '真实样本' : (last ? ({ low: '低风险', medium: '中风险', high: '高风险' }[last.riskLevel] || '未知') : '无数据'),
    obsRiskColor: hasReal ? '#22c55e' : (last ? ({ low: '#22c55e', medium: '#f59e0b', high: '#ef4444' }[last.riskLevel] || '#94a3b8') : '#94a3b8'),
    obsRiskSub: hasReal ? '当前显示真实 Token 消耗样本' : (last && last.riskReasons && last.riskReasons.length ? last.riskReasons.join('，') : '当前上下文较轻'),
    model: modelState,
  };
}

module.exports = { buildTokenLiveUpdate };
