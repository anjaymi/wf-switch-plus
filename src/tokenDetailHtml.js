function fmtToken(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}
function fmtUsd(value) { return '$' + Number(value || 0).toFixed(2); }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const SVG = {
  refresh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  reset: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  paste: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  trend: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
};

function ringPath(percent) {
  const p = Math.max(0, Math.min(100, percent));
  const c = 2 * Math.PI * 28; // r=28
  const off = c * (1 - p / 100);
  return { dasharray: c.toFixed(2), dashoffset: off.toFixed(2) };
}

function ringSvg(percent, color, label, sub, idPrefix) {
  const r = ringPath(percent);
  const pctId = idPrefix ? ` id="${idPrefix}-pct"` : '';
  const subId = idPrefix ? ` id="${idPrefix}-sub"` : '';
  const barId = idPrefix ? ` id="${idPrefix}-bar"` : '';
  return `<div class="ring"><svg viewBox="0 0 70 70" width="70" height="70"><circle cx="35" cy="35" r="28" stroke="rgba(148,163,184,.18)" stroke-width="6" fill="none"/><circle${barId} cx="35" cy="35" r="28" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${r.dasharray}" stroke-dashoffset="${r.dashoffset}" transform="rotate(-90 35 35)"/></svg><div class="ring-text"><div class="ring-pct"${pctId}>${percent}<span>%</span></div><div class="ring-lbl">${label}</div></div></div><div class="ring-sub"${subId}>${sub}</div>`;
}

function getTokenDetailHtml({ stats, pricing, baselines, currentEmail, bundleAccounts, modelState }) {
  const totalCost = stats.totalEstimatedTokens * pricing.blendedPer1M / 1_000_000;
  const model = modelState || {};
  const modelInfo = model.info || {};
  const modelPrice = modelInfo.price || null;
  const map = baselines || {};
  const accs = Array.isArray(bundleAccounts) ? bundleAccounts.filter(a => a && a.email) : [];
  const validAccs = accs.filter(a => a.valid !== false);
  const accountCount = validAccs.length || Object.keys(map).length;
  const dailyVals = accs.map(a => a.daily).filter(v => v !== undefined && v !== null && !Number.isNaN(Number(v))).map(Number);
  const weeklyVals = accs.map(a => a.weekly).filter(v => v !== undefined && v !== null && !Number.isNaN(Number(v))).map(Number);
  const avgDaily = dailyVals.length ? Math.round(dailyVals.reduce((s, v) => s + v, 0) / dailyVals.length) : null;
  const avgWeekly = weeklyVals.length ? Math.round(weeklyVals.reduce((s, v) => s + v, 0) / weeklyVals.length) : null;
  // 全账号"已用"：100 - 平均剩余；当作池整体用度
  const totalDailyUsed = avgDaily === null ? 0 : (100 - avgDaily);
  const totalWeeklyUsed = avgWeekly === null ? 0 : (100 - avgWeekly);
  // 估算全账号累计美元（每个账号视为日额度 dailyQuotaUsd × 已用比例）
  const aggregateDailyUsd = avgDaily === null ? 0 : (totalDailyUsed / 100) * (pricing.dailyQuotaUsd || 0) * accs.length;
  const aggregateDailyTokens = avgDaily === null ? 0 : (totalDailyUsed / 100) * (pricing.dailyQuotaTokens || 0) * accs.length;
  const heroTotalTokens = (stats.totalEstimatedTokens || 0) + aggregateDailyTokens;
  const bestAcc = accs.reduce((best, cur) => {
    const bd = best && best.daily !== undefined ? Number(best.daily) : -1;
    const cd = cur.daily !== undefined ? Number(cur.daily) : -1;
    return cd > bd ? cur : best;
  }, null);
  const baselineEntries = Object.values(map);
  const earliestAt = baselineEntries.length ? Math.min(...baselineEntries.map(b => b.at || Date.now())) : 0;
  const earliest = earliestAt ? new Date(earliestAt).toLocaleString('zh-CN') : '无';
  const curKey = String(currentEmail || '').toLowerCase();
  const bundleCur = accs.find(a => a && a.email && String(a.email).toLowerCase() === curKey);
  const cur = bundleCur || map[curKey];
  const dailyLeft = cur ? cur.daily : null;
  const weeklyLeft = cur ? cur.weekly : null;
  const dailyUsed = dailyLeft === null ? 0 : Math.max(0, 100 - dailyLeft);
  const weeklyUsed = weeklyLeft === null ? 0 : Math.max(0, 100 - weeklyLeft);
  const last = stats.last || null;
  const avg = stats.totalRequests ? Math.round(stats.totalEstimatedTokens / stats.totalRequests) : 0;
  const riskMap = { low: '低风险', medium: '中风险', high: '高风险' };
  const riskColor = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
  const lastRisk = last ? (riskMap[last.riskLevel] || '未知') : '无数据';
  const lastRiskColor = last ? (riskColor[last.riskLevel] || '#94a3b8') : '#94a3b8';

  const css = `
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",var(--vscode-font-family),sans-serif;color:#e2e8f0;background:radial-gradient(120% 80% at 0% 0%,#1e1b4b 0%,#0a0f1f 38%,#04060c 100%);min-height:100vh;padding:28px 32px;font-size:13px;line-height:1.55}
    .wrap{max-width:1080px;margin:0 auto}
    .page-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px;gap:18px;flex-wrap:wrap}
    .page-title{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
    .page-title .icon{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 18px rgba(99,102,241,.4)}
    .page-sub{font-size:12px;color:#94a3b8;margin-top:6px;max-width:560px}

    .pill{font-size:11px;padding:4px 10px;border-radius:999px;display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,.14);color:#4ade80;border:1px solid rgba(34,197,94,.3);font-weight:500}
    .pill.warn{background:rgba(245,158,11,.14);color:#fbbf24;border-color:rgba(245,158,11,.3)}
    .pill.dim{background:rgba(148,163,184,.12);color:#cbd5e1;border-color:rgba(148,163,184,.25)}
    .pill .dot{width:6px;height:6px;border-radius:999px;background:currentColor}

    .hero{position:relative;border-radius:20px;padding:28px 32px;background:linear-gradient(135deg,rgba(99,102,241,.18),rgba(139,92,246,.14) 55%,rgba(236,72,153,.10));border:1px solid rgba(148,163,184,.18);overflow:hidden;margin-bottom:18px}
    .hero:before{content:"";position:absolute;inset:0;background:radial-gradient(60% 60% at 100% 0%,rgba(139,92,246,.3),transparent 70%);pointer-events:none}
    .hero-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:32px;position:relative}
    .hero-label{font-size:11px;color:#cbd5e1;text-transform:uppercase;letter-spacing:.12em;font-weight:600}
    .hero-value{font-size:54px;font-weight:850;color:#fff;letter-spacing:-.03em;line-height:1.05;margin-top:6px;background:linear-gradient(135deg,#fbbf24,#f97316 70%,#ec4899);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .hero-value .unit{font-size:18px;font-weight:600;color:#cbd5e1;margin-left:10px;-webkit-text-fill-color:#cbd5e1;background:none}
    .hero-meta{display:flex;gap:22px;margin-top:14px;flex-wrap:wrap;font-size:12.5px;color:#cbd5e1}
    .hero-meta b{color:#fff;font-weight:600}
    .hero-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;justify-content:flex-end}
    .btn{appearance:none;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.55);color:#e2e8f0;border-radius:10px;padding:8px 13px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s;font-weight:500}
    .btn:hover{border-color:rgba(99,102,241,.55);background:rgba(99,102,241,.12);transform:translateY(-1px)}
    .btn .ic{display:flex;color:#a78bfa}
    .btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent;color:#fff;font-weight:600;box-shadow:0 4px 14px rgba(99,102,241,.35)}
    .btn-primary:hover{filter:brightness(1.08);background:linear-gradient(135deg,#6366f1,#8b5cf6)}
    .btn-primary .ic{color:#fff}

    .card{position:relative;border-radius:18px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.12);padding:22px 24px;margin-bottom:14px;backdrop-filter:blur(22px)}
    .card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:12px;flex-wrap:wrap}
    .card-title{font-size:14px;font-weight:700;color:#f1f5f9;display:flex;align-items:center;gap:9px;letter-spacing:.005em}
    .card-title .icon-pill{width:28px;height:28px;border-radius:9px;background:rgba(139,92,246,.18);color:#a78bfa;display:flex;align-items:center;justify-content:center}
    .card-title.blue .icon-pill{background:rgba(96,165,250,.18);color:#60a5fa}
    .card-title.amber .icon-pill{background:rgba(251,191,36,.18);color:#fbbf24}
    .card-actions{display:flex;gap:8px}

    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}

    .stat{position:relative;border-radius:14px;background:linear-gradient(180deg,rgba(30,41,59,.55),rgba(15,23,42,.5));border:1px solid rgba(148,163,184,.12);padding:16px 18px;overflow:hidden;transition:all .2s}
    .stat:hover{border-color:rgba(139,92,246,.4);transform:translateY(-2px)}
    .stat .glow{position:absolute;inset:0;background:radial-gradient(60% 80% at 100% 0%,var(--gc,rgba(139,92,246,.18)),transparent 60%);pointer-events:none}
    .stat-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;font-weight:600;display:flex;align-items:center;gap:6px;position:relative}
    .stat-value{font-size:30px;font-weight:850;color:#fff;margin-top:6px;letter-spacing:-.02em;line-height:1.05;position:relative}
    .stat-value.usd{background:linear-gradient(135deg,#fbbf24,#f97316);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .stat-value.purple{color:#a78bfa}
    .stat-value.green{color:#4ade80}
    .stat-value.red{color:#f87171}
    .stat-sub{font-size:11.5px;color:#94a3b8;margin-top:6px;position:relative}
    .stat .bar{margin-top:10px;height:5px;border-radius:999px;background:rgba(148,163,184,.12);overflow:hidden;position:relative}
    .stat .bar>span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#6366f1,#a78bfa,#ec4899);transition:width .4s}

    .ring-card{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px;border-radius:14px;background:linear-gradient(180deg,rgba(30,41,59,.55),rgba(15,23,42,.5));border:1px solid rgba(148,163,184,.12)}
    .ring{position:relative;width:70px;height:70px}
    .ring-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .ring-pct{font-size:18px;font-weight:800;color:#fff}
    .ring-pct span{font-size:11px;color:#94a3b8;margin-left:1px}
    .ring-lbl{font-size:9.5px;color:#94a3b8;margin-top:-2px}
    .ring-sub{font-size:11px;color:#cbd5e1;margin-top:8px;text-align:center}

    .foot{font-size:11.5px;color:#94a3b8;margin-top:14px;line-height:1.7}
    .foot code{background:rgba(15,23,42,.7);padding:2px 7px;border-radius:5px;border:1px solid rgba(148,163,184,.16);font-family:ui-monospace,Consolas,monospace;color:#e2e8f0;font-size:11px}
  `;

  return `<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style></head><body><div class="wrap">

    <div class="page-head">
      <div>
        <div class="page-title"><span class="icon">${SVG.bolt}</span>Token 详情面板</div>
        <div class="page-sub">真实账单以 Windsurf 官方为准。隐藏推理 token 不可观测，本页通过混合定价 (cached/input/output) 估算可见上下文用量，并结合伴生桥同步真实额度。</div>
      </div>
      <div class="hero-actions">
        <button class="btn" onclick="send('refreshAll')"><span class="ic">${SVG.refresh}</span>全部刷新</button>
        <button class="btn" onclick="send('resetAllBaselines')"><span class="ic">${SVG.reset}</span>重置全部基线</button>
      </div>
    </div>

    <div class="hero">
      <div class="hero-grid">
        <div>
          <div class="hero-label">本期累计花费（实时）</div>
          <div class="hero-value" id="hv-total">${fmtUsd(totalCost + aggregateDailyUsd)}<span class="unit" id="hv-tok">  ${fmtToken(heroTotalTokens)} tok</span></div>
          <div class="hero-meta">
            <span>池估 <b id="hv-pool-usd">${fmtUsd(aggregateDailyUsd)}</b> / <b id="hv-pool-tok">${fmtToken(aggregateDailyTokens)}</b> tok</span>
            <span>伴生 <b id="hv-local-usd">${fmtUsd(totalCost)}</b> / <b id="hv-local-tok">${fmtToken(stats.totalEstimatedTokens)}</b> tok</span>
            <span><b id="hv-acc-cnt">${accs.length || accountCount}</b> 账号 · 平均日剩余 <b id="hv-avg-daily">${avgDaily===null?'--':avgDaily+'%'}</b></span>
            <span><b id="hv-req-cnt">${stats.totalRequests || 0}</b> 次脚本请求 · blended <b>${pricing.blendedPer1M.toFixed(3)}</b> $/1M</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap">
          <span class="pill"><i class="dot"></i>真实账号</span>
          <span class="pill dim"><i class="dot"></i>${(pricing.mixCached*100).toFixed(0)}/${(pricing.mixInput*100).toFixed(0)}/${(pricing.mixOutput*100).toFixed(0)} 混合</span>
          <span class="pill dim"><i class="dot"></i>最早基线 ${earliest}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title blue"><span class="icon-pill">${SVG.trend}</span>当前模型 & 价格<span class="pill ${model.id ? '' : 'warn'}" style="margin-left:6px"><i class="dot"></i>${model.id ? '已探测' : '未捕获'}</span></div>
        <div class="card-actions"><button class="btn" onclick="send('setManualModel')"><span class="ic">${SVG.edit}</span>手动设置</button><button class="btn" onclick="send('requestRefresh')"><span class="ic">${SVG.refresh}</span>重新探测</button></div>
      </div>
      <div class="grid-4">
        <div class="stat"><div class="stat-label">当前模型</div><div class="stat-value green" id="model-name" style="font-size:18px">${escapeHtml(modelInfo.name || model.id || '未捕获')}</div><div class="stat-sub" id="model-id">${escapeHtml(model.id || '未捕获当前选择，可点击手动设置')}</div></div>
        <div class="stat"><div class="stat-label">权益倍率</div><div class="stat-value purple" id="model-credit">${modelInfo.credit !== undefined ? modelInfo.credit + 'x' : '--'}</div><div class="stat-sub" id="model-provider">${escapeHtml(modelInfo.provider || 'unknown')}</div></div>
        <div class="stat"><div class="stat-label">价格 / 1M Token</div><div class="stat-value usd" id="model-price">${modelPrice ? '$' + modelPrice.inputPer1M + ' / $' + modelPrice.cachedPer1M + ' / $' + modelPrice.outputPer1M : '待补'}</div><div class="stat-sub">input / cached / output</div></div>
        <div class="stat"><div class="stat-label">按当前模型估算</div><div class="stat-value usd" id="model-cost">${model.costKnown ? fmtUsd(model.estimatedCost) : '--'}</div><div class="stat-sub" id="model-cost-sub">${model.costKnown ? 'blended ' + model.blendedPer1M.toFixed(3) + ' $/1M' : '暂无该模型官方价目'}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><span class="icon-pill">${SVG.bolt}</span>全账号 Token 用度池<span class="pill ${accs.length ? '' : 'warn'}" style="margin-left:6px"><i class="dot"></i>${accs.length ? '已捕获 ' + accs.length + ' 账号' : '伴生桥未捕获 bundle'}</span></div>
        <div class="card-actions"><button class="btn" onclick="send('refreshAll')"><span class="ic">${SVG.refresh}</span>调用原版刷新</button></div>
      </div>
      <div class="grid-3">
        <div class="ring-card">${ringSvg(totalDailyUsed, '#f59e0b', '日池已耗', `平均剩余 ${avgDaily===null?'--':avgDaily+'%'}`, 'pool-daily')}</div>
        <div class="ring-card">${ringSvg(totalWeeklyUsed, '#60a5fa', '周池已耗', `平均剩余 ${avgWeekly===null?'--':avgWeekly+'%'}`, 'pool-weekly')}</div>
        <div class="stat" style="--gc:rgba(34,197,94,.18)"><div class="glow"></div>
          <div class="stat-label">推荐切换</div>
          <div class="stat-value green" id="pool-best-email" style="font-size:18px">${escapeHtml(bestAcc && bestAcc.email || '—')}</div>
          <div class="stat-sub" id="pool-best-sub">日额度 ${bestAcc && bestAcc.daily !== undefined ? bestAcc.daily + '%' : '--'} · 当前 ${escapeHtml(currentEmail || '—')}</div>
        </div>
      </div>
      <div class="grid-4" style="margin-top:14px">
        <div class="stat"><div class="stat-label">账号池总数</div><div class="stat-value" id="pool-acc-count">${accs.length}</div><div class="stat-sub" id="pool-valid-count">有效 ${validAccs.length}</div></div>
        <div class="stat"><div class="stat-label">池估算花费/日</div><div class="stat-value usd" id="pool-usd">${fmtUsd(aggregateDailyUsd)}</div><div class="stat-sub">按 ${fmtUsd(pricing.dailyQuotaUsd)}/账号 × 已耗</div></div>
        <div class="stat"><div class="stat-label">本伴生 Token</div><div class="stat-value tok" id="local-token">${fmtToken(stats.totalEstimatedTokens)}</div><div class="stat-sub" id="local-token-sub">${stats.totalRequests} 次请求</div></div>
        <div class="stat"><div class="stat-label">本伴生 花费</div><div class="stat-value usd" id="local-usd">${fmtUsd(totalCost)}</div><div class="stat-sub">blended ${pricing.blendedPer1M.toFixed(3)} $/1M</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title blue"><span class="icon-pill">${SVG.globe}</span>当前账号实时用量<span class="pill ${cur ? '' : 'warn'}" style="margin-left:6px"><i class="dot"></i>${cur ? '真实' : '待补'}</span></div>
        <div class="card-actions">
          <button class="btn" onclick="send('refreshCurrent')"><span class="ic">${SVG.refresh}</span>刷新</button>
          <button class="btn" onclick="send('resetCurrentBaseline')"><span class="ic">${SVG.reset}</span>重置基线</button>
        </div>
      </div>
      <div class="grid-3">
        <div class="ring-card">${ringSvg(dailyUsed, '#a78bfa', '日已耗', `剩余 ${dailyLeft===null?'--':dailyLeft+'%'}`, 'cur-daily')}</div>
        <div class="ring-card">${ringSvg(weeklyUsed, '#60a5fa', '周已耗', `剩余 ${weeklyLeft===null?'--':weeklyLeft+'%'}`, 'cur-weekly')}</div>
        <div class="stat" style="--gc:rgba(236,72,153,.2)"><div class="glow"></div>
          <div class="stat-label">本轮花费  <span id="cur-email">${escapeHtml(currentEmail || '当前账号')}</span></div>
          <div class="stat-value usd" id="cur-usd">${fmtUsd(totalCost)}</div>
          <div class="stat-sub" id="cur-token-sub"> ${fmtToken(stats.totalEstimatedTokens)} tok  日额度 ${fmtUsd(pricing.dailyQuotaUsd)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title amber"><span class="icon-pill">${SVG.eye}</span>可观测 Token 估算<span class="pill warn" style="margin-left:6px"><i class="dot"></i>估算</span></div>
        <div class="card-actions"><button class="btn" onclick="send('clearStats')"><span class="ic">${SVG.trash}</span>清除统计</button></div>
      </div>
      <div class="grid-4">
        <div class="stat" style="--gc:rgba(167,139,250,.18)"><div class="glow"></div>
          <div class="stat-label">总 Token</div>
          <div class="stat-value purple" id="obs-total-token">${fmtToken(stats.totalEstimatedTokens)}</div>
          <div class="stat-sub" id="obs-total-sub">${stats.totalRequests} 次  均值 ${fmtToken(avg)}</div>
        </div>
        <div class="stat" style="--gc:rgba(34,197,94,.18)"><div class="glow"></div>
          <div class="stat-label">预计已节约</div>
          <div class="stat-value green" id="obs-saved-token">${fmtToken(stats.totalSavedTokens)}</div>
          <div class="stat-sub">省积分 ${last && last.savePoints ? '已开启' : '未开启 / 暂无'}</div>
        </div>
        <div class="stat" style="--gc:${lastRiskColor}33"><div class="glow"></div>
          <div class="stat-label">上下文风险</div>
          <div class="stat-value" style="color:${lastRiskColor}">${lastRisk}</div>
          <div class="stat-sub">${last && last.riskReasons && last.riskReasons.length ? last.riskReasons.join('，') : '当前上下文较轻'}</div>
        </div>
        <div class="stat" style="--gc:rgba(96,165,250,.18)"><div class="glow"></div>
          <div class="stat-label">最近一次用量</div>
          <div class="stat-value purple" id="obs-last-token">${last ? fmtToken(last.estimatedTokens) : '0'}</div>
          <div class="stat-sub" id="obs-last-sub">${last ? 'details ' + last.detailsTokens + '  高风险 ' + (stats.highRiskCount || 0) + ' 次' : '暂无记录'}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><span class="icon-pill">${SVG.info}</span>共享状态</div>
        <div class="card-actions"><button class="btn" onclick="send('importClipboard')"><span class="ic">${SVG.paste}</span>从剪贴板导入</button></div>
      </div>
      <div class="grid-2">
        <div class="stat"><div class="stat-label">当前账号</div><div class="stat-value" style="font-size:18px">${escapeHtml(currentEmail || '未识别')}</div><div class="stat-sub">${currentEmail ? '已同步至共享文件' : '伴生桥未注入或未捕获 lastEmail'}</div></div>
        <div class="stat"><div class="stat-label">基线账号</div><div class="stat-value" style="font-size:18px">${accountCount}</div><div class="stat-sub">最近：${stats.lastAt || '无'}</div></div>
      </div>
      <div class="foot">导入示例：<code>{"currentEmail":"a@b.com","baselines":{"a@b.com":{"daily":62,"weekly":48,"at":1714900000000}}}</code></div>
    </div>

    <script>
      const vscode=acquireVsCodeApi();
      function send(t,d){vscode.postMessage(d?Object.assign({type:t},d):{type:t});}
      function fmtUsd(v){return '$'+Number(v||0).toFixed(2);}
      function fmtTok(v){const n=Number(v||0);if(n>=1e6)return(n/1e6).toFixed(2)+'M';if(n>=1000)return(n/1000).toFixed(1)+'K';return String(Math.round(n));}
      function ringOffset(v){const p=Math.max(0,Math.min(100,Number(v||0)));const c=2*Math.PI*28;return (c*(1-p/100)).toFixed(2);}
      function setText(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
      function setRing(prefix,pct,sub){
        setText(prefix+'-pct',String(Math.round(Number(pct||0)))+'%');
        setText(prefix+'-sub',sub);
        const bar=document.getElementById(prefix+'-bar');
        if(bar)bar.setAttribute('stroke-dashoffset',ringOffset(pct));
      }
      window.addEventListener('message',e=>{
        const m=e.data;
        if(!m||m.type!=='liveUpdate')return;
        const total=m.heroTotalCost||0;
        const totalTok=m.heroTotalTokens||0;
        const hvEl=document.getElementById('hv-total');
        if(hvEl){
          hvEl.childNodes[0].textContent=fmtUsd(total);
        }
        setText('hv-tok','  '+fmtTok(totalTok)+' tok');
        setText('hv-pool-usd',fmtUsd(m.aggregateDailyUsd||0));
        setText('hv-pool-tok',fmtTok(m.aggregateDailyTokens||0));
        setText('hv-local-usd',fmtUsd(m.localCost||0));
        setText('hv-local-tok',fmtTok(m.localTokens||0));
        setText('hv-acc-cnt',String(m.accountCount||0));
        setText('hv-avg-daily',m.avgDaily===null||m.avgDaily===undefined?'--':m.avgDaily+'%');
        setText('hv-req-cnt',String(m.requests||0));
        setRing('pool-daily',m.poolDailyUsed,'平均剩余 '+(m.avgDaily===null||m.avgDaily===undefined?'--':m.avgDaily+'%'));
        setRing('pool-weekly',m.poolWeeklyUsed,'平均剩余 '+(m.avgWeekly===null||m.avgWeekly===undefined?'--':m.avgWeekly+'%'));
        setRing('cur-daily',m.currentDaily===null||m.currentDaily===undefined?0:100-Number(m.currentDaily),'剩余 '+(m.currentDaily===null||m.currentDaily===undefined?'--':m.currentDaily+'%'));
        setRing('cur-weekly',m.currentWeekly===null||m.currentWeekly===undefined?0:100-Number(m.currentWeekly),'剩余 '+(m.currentWeekly===null||m.currentWeekly===undefined?'--':m.currentWeekly+'%'));
        setText('pool-best-email',m.bestEmail||'—');
        setText('pool-best-sub','日额度 '+(m.bestDaily===null||m.bestDaily===undefined?'--':m.bestDaily+'%')+' · 当前 '+(m.currentEmail||'—'));
        setText('pool-acc-count',String(m.accountCount||0));
        setText('pool-valid-count','有效 '+(m.validAccountCount||0));
        setText('pool-usd',fmtUsd(m.aggregateDailyUsd||0));
        setText('local-token',fmtTok(m.localTokens||0));
        setText('local-token-sub',String(m.requests||0)+' 次请求');
        setText('local-usd',fmtUsd(m.localCost||0));
        setText('cur-email',m.currentEmail||'当前账号');
        setText('cur-usd',fmtUsd(m.localCost||0));
        setText('cur-token-sub',' '+fmtTok(m.localTokens||0)+' tok  日额度 ${fmtUsd(pricing.dailyQuotaUsd)}');
        setText('obs-total-token',fmtTok(m.localTokens||0));
        setText('obs-total-sub',String(m.requests||0)+' 次  均值 '+fmtTok(m.avgTokens||0));
        setText('obs-saved-token',fmtTok(m.savedTokens||0));
        setText('obs-last-token',fmtTok(m.lastTokens||0));
        setText('obs-last-sub',m.lastTokens?'details '+(m.lastDetailsTokens||0)+'  高风险 '+(m.highRiskCount||0)+' 次':'暂无记录');
        const mi=(m.model&&m.model.info)||{};
        const mp=mi.price||null;
        setText('model-name',mi.name||(m.model&&m.model.id)||'未捕获');
        setText('model-id',(m.model&&m.model.id)||'未捕获当前选择，可点击手动设置');
        setText('model-credit',mi.credit!==undefined?mi.credit+'x':'--');
        setText('model-provider',mi.provider||'unknown');
        setText('model-price',mp?'$'+mp.inputPer1M+' / $'+mp.cachedPer1M+' / $'+mp.outputPer1M:'待补');
        setText('model-cost',m.model&&m.model.costKnown?fmtUsd(m.model.estimatedCost):'--');
        setText('model-cost-sub',m.model&&m.model.costKnown?'blended '+Number(m.model.blendedPer1M||0).toFixed(3)+' $/1M':'暂无该模型官方价目');
      });
      setInterval(()=>vscode.postMessage({type:'requestRefresh'}), 5000);
    </script>
  </div></body></html>`;
}

module.exports = { getTokenDetailHtml };
