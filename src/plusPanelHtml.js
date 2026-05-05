const fs = require('fs');
const { buildSparkPayload, renderSparkCard, SPARK_CLIENT_SCRIPT } = require('./sparkCard');

const ICONS = {
  bolt: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  swap: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  key: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  window: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
  cog: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  rules: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  plug: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  package: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
};

function fmtToken(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}
function fmtUsd(value) { return '$' + Number(value || 0).toFixed(2); }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// sparklineSvg 已抽离到 ./sparkCard.js

function getPlusPanelLiveData({ stats, pricing, bundleAccounts }) {
  const totalCost = stats.totalEstimatedTokens * pricing.blendedPer1M / 1_000_000;
  const accs = Array.isArray(bundleAccounts) ? bundleAccounts.filter(a => a && a.email) : [];
  const dailyVals = accs.map(a => a.daily).filter(v => v !== undefined && v !== null && !Number.isNaN(Number(v))).map(Number);
  const avgDaily = dailyVals.length ? dailyVals.reduce((s, v) => s + v, 0) / dailyVals.length : null;
  const avgUsedRatio = avgDaily === null ? 0 : Math.max(0, 1 - avgDaily / 100);
  const aggregateDailyUsd = avgUsedRatio * (pricing.dailyQuotaUsd || 0) * accs.length;
  const aggregateDailyTokens = avgUsedRatio * (pricing.dailyQuotaTokens || 0) * accs.length;
  const heroTotalCost = totalCost + aggregateDailyUsd;
  const heroTotalTokens = (stats.totalEstimatedTokens || 0) + aggregateDailyTokens;
  const sparkPayload = buildSparkPayload({ stats, pricing, bundleAccounts });
  return Object.assign({
    heroTotalCost,
    heroTotalTokens,
    aggregateDailyUsd,
    aggregateDailyTokens,
    totalCost,
    localTokens: stats.totalEstimatedTokens || 0,
    accountCount: accs.length,
    requestCount: stats.totalRequests || 0,
    sparkPayload,
  }, sparkPayload);
}

function getPlusPanelHtml({ stats, pricing, pkg, originalInstalled, bridgeInjected, autoReplyEnabled, autoReplyText, autoReplyDelaySec, saveTokenMode, autoQuotaSwitch, autoQuotaThreshold, bundleAccounts }) {
  const live = getPlusPanelLiveData({ stats, pricing, bundleAccounts });
  const { heroTotalCost, heroTotalTokens, aggregateDailyUsd, aggregateDailyTokens, totalCost, localTokens, accountCount, requestCount, sparkTitle, sparkHtml, trend, trendClass, recentCount, recentAvg, recentMax, sparkLastLabel, sparkLastVal } = live;

  const css = `
    *{box-sizing:border-box}html,body{margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",var(--vscode-font-family),sans-serif;color:#e2e8f0;background:radial-gradient(120% 80% at 0% 0%,#1e1b4b 0%,#0b1020 38%,#05070d 100%);font-size:12px;line-height:1.55;padding:16px 14px;min-height:100vh}
    .head{display:flex;align-items:center;gap:10px;margin-bottom:18px}
    .logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:13px;box-shadow:0 4px 14px rgba(139,92,246,.35)}
    .head-text{flex:1;min-width:0}
    .head-title{font-size:14px;font-weight:700;color:#fff}
    .head-sub{font-size:10.5px;color:#94a3b8;margin-top:2px}
    .pills{display:flex;gap:5px;flex-wrap:wrap}
    .pill{font-size:10px;padding:3px 8px;border-radius:999px;display:inline-flex;align-items:center;gap:4px;background:rgba(34,197,94,.14);color:#4ade80;border:1px solid rgba(34,197,94,.3)}
    .pill.warn{background:rgba(245,158,11,.12);color:#fbbf24;border-color:rgba(245,158,11,.3)}
    .pill .dot{width:6px;height:6px;border-radius:999px;background:currentColor}
    .hero{position:relative;border-radius:16px;padding:18px;margin-bottom:14px;background:linear-gradient(135deg,rgba(99,102,241,.18),rgba(139,92,246,.14) 60%,rgba(236,72,153,.08));border:1px solid rgba(148,163,184,.18);overflow:hidden}
    .hero:before{content:"";position:absolute;inset:0;background:radial-gradient(60% 60% at 100% 0%,rgba(139,92,246,.25),transparent 70%);pointer-events:none}
    .hero-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;align-items:stretch;position:relative}
    .hero-label{font-size:10.5px;color:#cbd5e1;text-transform:uppercase;letter-spacing:.1em;font-weight:600}
    .hero-value{font-size:28px;font-weight:850;color:#fff;letter-spacing:-.02em;margin-top:4px;line-height:1.1}
    .hero-value .unit{font-size:13px;font-weight:600;color:#cbd5e1;margin-left:6px}
    .hero-meta{display:flex;gap:12px;margin-top:10px;font-size:10.5px;color:#cbd5e1;flex-wrap:wrap}
    .hero-meta b{color:#fff;font-weight:600}
    .hero-cta{margin-top:12px}
    .spark-card{position:relative;border-radius:12px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.12);padding:10px 12px 8px;display:flex;flex-direction:column;justify-content:space-between;min-height:120px}
    .spark-head{display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
    .spark-trend{font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;display:inline-flex;align-items:center;gap:3px}
    .spark-trend.up{background:rgba(34,197,94,.18);color:#4ade80}
    .spark-trend.down{background:rgba(239,68,68,.18);color:#f87171}
    .spark-trend.flat{background:rgba(148,163,184,.18);color:#cbd5e1}
    .spark-svg{flex:1;margin:2px -4px 4px}
    .spark-foot{display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:auto}
    .spark-foot b{color:#fff;font-weight:600;font-size:11px}
    .card{position:relative;border-radius:14px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.12);padding:14px 14px 12px;margin-bottom:12px}
    .card.accent-purple:before,.card.accent-blue:before,.card.accent-pink:before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:2px}
    .card.accent-purple:before{background:linear-gradient(180deg,#a78bfa,#6366f1)}
    .card.accent-blue:before{background:linear-gradient(180deg,#60a5fa,#0ea5e9)}
    .card.accent-pink:before{background:linear-gradient(180deg,#f472b6,#ec4899)}
    .card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px;padding-left:8px}
    .card-title{font-size:12.5px;font-weight:700;color:#f1f5f9}
    .card-sub{font-size:10.5px;color:#94a3b8;margin-top:1px}
    .icon-btn{width:24px;height:24px;border-radius:7px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.5);color:#a78bfa;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
    .icon-btn:hover{border-color:rgba(99,102,241,.55);background:rgba(99,102,241,.12)}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-left:8px}
    .btn{appearance:none;border:1px solid rgba(148,163,184,.16);background:rgba(30,41,59,.55);color:#e2e8f0;border-radius:10px;padding:10px 12px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:9px;transition:all .15s;text-align:left;font-weight:500}
    .btn:hover{border-color:rgba(99,102,241,.55);background:rgba(99,102,241,.12);transform:translateY(-1px)}
    .btn .ic{width:14px;height:14px;color:#a78bfa;flex:0 0 14px;display:flex;align-items:center;justify-content:center}
    .btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent;color:#fff;font-weight:600;box-shadow:0 4px 14px rgba(99,102,241,.35)}
    .btn-primary:hover{filter:brightness(1.08);background:linear-gradient(135deg,#6366f1,#8b5cf6)}
    .btn-primary .ic{color:#fff}
    .btn-row{padding-left:8px;display:flex;flex-direction:column;gap:8px}
    .switch-row{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:10px;background:rgba(15,23,42,.5);border:1px solid rgba(148,163,184,.1);margin-left:8px;margin-bottom:8px;cursor:pointer}
    .switch{width:36px;height:20px;border-radius:999px;background:rgba(148,163,184,.25);position:relative;flex:0 0 36px;transition:background .2s}
    .switch.on{background:linear-gradient(135deg,#6366f1,#8b5cf6)}
    .switch:before{content:"";position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:3px;left:3px;transition:left .2s;box-shadow:0 2px 4px rgba(0,0,0,.2)}
    .switch.on:before{left:19px}
    .switch-text{flex:1;font-size:11.5px}
    .switch-text b{color:#fff;font-weight:600}
    .switch-text .meta{color:#94a3b8;font-size:10.5px;margin-top:2px}
    .switch-text .link{color:#a5b4fc;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(165,180,252,.4);text-underline-offset:2px}
    .switch-text .link:hover{color:#c7d2fe}
    .footer{margin-top:18px;font-size:10.5px;color:#94a3b8;display:flex;justify-content:space-between;border-top:1px solid rgba(148,163,184,.1);padding-top:12px}

    /* Modal 弹窗 */
    .modal-mask{position:fixed;inset:0;background:rgba(2,6,23,.66);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:99;padding:20px;animation:fadeIn .18s ease}
    .modal-mask.show{display:flex}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes slideUp{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
    .modal{width:100%;max-width:380px;border-radius:16px;background:linear-gradient(180deg,#1e1b4b 0%,#0b1020 100%);border:1px solid rgba(148,163,184,.2);box-shadow:0 30px 60px rgba(0,0,0,.5);padding:20px;animation:slideUp .22s ease}
    .modal-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;display:flex;align-items:center;gap:8px}
    .modal-sub{font-size:11px;color:#94a3b8;margin-bottom:16px}
    .field{margin-bottom:12px}
    .field label{display:block;font-size:10.5px;color:#cbd5e1;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:6px}
    .field input,.field textarea{width:100%;background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.22);border-radius:8px;padding:9px 11px;color:#fff;font-size:12.5px;font-family:inherit;outline:none;transition:border-color .15s}
    .field input:focus,.field textarea:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.2)}
    .field .hint{font-size:10.5px;color:#94a3b8;margin-top:5px}
    .modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
    .modal-actions .btn{flex:0 0 auto;padding:8px 14px}
    .range-row{display:flex;align-items:center;gap:10px}
    .range-row input[type=range]{flex:1;accent-color:#8b5cf6}
    .range-row .v{min-width:42px;text-align:right;color:#fff;font-weight:700;font-size:13px}
  `;

  const html = [
    '<!doctype html><html><head><meta charset="UTF-8"><style>', css, '</style></head><body>',
    '<div class="head">',
      '<div class="logo">WF</div>',
      '<div class="head-text"><div class="head-title">WF 增强控制台</div><div class="head-sub">伴生于原版 ', pkg.version, '</div></div>',
      '<div class="pills">',
        '<span class="pill ', (originalInstalled ? '' : 'warn'), '"><i class="dot"></i>', (originalInstalled ? '原版已装' : '原版未装'), '</span>',
        '<span class="pill ', (bridgeInjected ? '' : 'warn'), '"><i class="dot"></i>', (bridgeInjected ? '桥已注入' : '桥未注入'), '</span>',
      '</div>',
    '</div>',

    '<div class="hero"><div class="hero-grid">',
      '<div>',
        '<div class="hero-label">本期累计花费（实时）</div>',
        '<div class="hero-value" id="plus-hero-cost">', fmtUsd(heroTotalCost), '<span class="unit" id="plus-hero-tokens">  ', fmtToken(heroTotalTokens), ' tok</span></div>',
        '<div class="hero-meta">',
          '<span>池估 <b id="plus-pool-usd">', fmtUsd(aggregateDailyUsd), '</b> / <b id="plus-pool-tokens">', fmtToken(aggregateDailyTokens), '</b> tok</span>',
          '<span>伴生 <b id="plus-local-usd">', fmtUsd(totalCost), '</b> / <b id="plus-local-tokens">', fmtToken(localTokens), '</b> tok</span>',
          '<span><b id="plus-account-count">', accountCount, '</b> 账号  <b id="plus-request-count">', requestCount, '</b> 次请求</span>',
        '</div>',
        '<div class="hero-cta"><button class="btn btn-primary" onclick="send(\'showTokenUsageStats\')"><span class="ic">', ICONS.chart, '</span>打开 Token 详情</button></div>',
      '</div>',
      renderSparkCard(live.sparkPayload),
    '</div></div>',

    '<div class="card accent-purple"><div class="card-head"><div><div class="card-title">原版快捷入口</div><div class="card-sub">桥接 wfSwitch.* 命令</div></div>',
      '<div class="icon-btn" title="打开原版面板" onclick="send(\'focusOriginalPanel\')"><span class="ic">', ICONS.window, '</span></div>',
    '</div>',
      '<div class="grid-2">',
        '<button class="btn" onclick="send(\'switch\')"><span class="ic">', ICONS.swap, '</span>一键换号</button>',
        '<button class="btn" onclick="send(\'activate\')"><span class="ic">', ICONS.key, '</span>输入激活码</button>',
        '<button class="btn" onclick="send(\'newInstance\')"><span class="ic">', ICONS.window, '</span>新建窗口</button>',
        '<button class="btn" onclick="send(\'openSettings\')"><span class="ic">', ICONS.cog, '</span>服务设置</button>',
        '<button class="btn" onclick="send(\'openAccountsOverview\')"><span class="ic">', ICONS.users, '</span>账号总览</button>',
        '<button class="btn" onclick="send(\'checkOriginalUpdate\')"><span class="ic">', ICONS.package, '</span>检查更新</button>',
      '</div>',
      '<div class="switch-row" onclick="send(\'toggleAutoQuotaSwitch\')" style="margin-top:10px;margin-left:0"><div class="switch ', (autoQuotaSwitch ? 'on' : ''), '"></div><div class="switch-text"><b>无感切号（按日额度）</b><div class="meta">阈值 ', autoQuotaThreshold, '%  ', (autoQuotaSwitch ? '后台监控中' : '已关闭'), '  <a class="link" onclick="event.stopPropagation();send(\'setQuotaThreshold\')">改阈值</a></div></div></div>',
      '<div class="switch-row" onclick="send(\'toggleSaveToken\')" style="margin-left:0"><div class="switch ', (saveTokenMode ? 'on' : ''), '"></div><div class="switch-text"><b>节约 Token 模式</b><div class="meta">', (saveTokenMode ? '全局规则只传短摘要 details' : '允许传完整 details（耗 token）'), '</div></div></div>',
      '<div class="btn-row" style="margin-top:4px"><button class="btn" onclick="send(\'smartSwitch\')"><span class="ic">', ICONS.bolt, '</span>立即按日额度切号</button><button class="btn" onclick="send(\'refreshAccountsViaBridge\')"><span class="ic">', ICONS.refresh, '</span>调用原版刷新</button></div>',
    '</div>',

    '<div class="card accent-blue"><div class="card-head"><div><div class="card-title">持续对话</div><div class="card-sub">仅脚本触发会自动提交</div></div></div>',
      '<div class="switch-row" onclick="send(\'toggleAutoReply\')"><div class="switch ', (autoReplyEnabled ? 'on' : ''), '"></div><div class="switch-text"><b>固定短语自动回复</b><div class="meta">短语 ', escapeHtml(autoReplyText), '  延迟 ', autoReplyDelaySec, 's</div></div></div>',
      '<div class="btn-row">',
        '<button class="btn btn-primary" onclick="send(\'continueDialog\')"><span class="ic">', ICONS.send, '</span>继续对话 / 上传附件</button>',
        '<div class="grid-2" style="padding-left:0">',
          '<button class="btn" onclick="send(\'installContinueSupport\')"><span class="ic">', ICONS.download, '</span>安装规则与 HTTP</button>',
          '<button class="btn" onclick="openPhraseModal()"><span class="ic">', ICONS.edit, '</span>设置短语</button>',
          '<button class="btn" onclick="send(\'configureContinueRules\')"><span class="ic">', ICONS.rules, '</span>只更新规则</button>',
          '<button class="btn" onclick="send(\'copyContinueScriptPath\')"><span class="ic">', ICONS.copy, '</span>复制脚本路径</button>',
        '</div>',
      '</div></div>',

    '<div class="card accent-pink"><div class="card-head"><div><div class="card-title">伴生桥与工具</div><div class="card-sub">原版升级会自动重新注入</div></div></div>',
      '<div class="btn-row"><div class="grid-2" style="padding-left:0">',
        '<button class="btn ', (bridgeInjected ? '' : 'btn-primary'), '" onclick="send(\'injectOriginalBridge\')"><span class="ic">', ICONS.plug, '</span>', (bridgeInjected ? '重新注入桥' : '注入伴生桥'), '</button>',
        '<button class="btn" onclick="send(\'removeOriginalBridge\')"><span class="ic">', ICONS.trash, '</span>移除桥</button>',
        '<button class="btn" onclick="send(\'hack\')"><span class="ic">', ICONS.shield, '</span>登录补丁</button>',
        '<button class="btn" onclick="send(\'selfCheck\')"><span class="ic">', ICONS.sparkle, '</span>自检报告</button>',
        '<button class="btn" onclick="send(\'copyClaudeContextMcpConfig\')"><span class="ic">', ICONS.copy, '</span>复制 MCP 模板</button>',
        '<button class="btn" onclick="send(\'resetTokenUsageStats\')"><span class="ic">', ICONS.refresh, '</span>重置 Token 统计</button>',
      '</div></div>',
    '</div>',

    '<div class="footer"><span>wf-switch-plus ', pkg.version, '</span><span>', (originalInstalled ? 'xy.wf-switch-ext OK' : '请先安装原版'), '</span></div>',

    '<div id="phraseModal" class="modal-mask" onclick="if(event.target===this)closePhraseModal()">',
      '<div class="modal">',
        '<div class="modal-title">', ICONS.edit, '设置自动回复短语</div>',
        '<div class="modal-sub">这条短语会在脚本触发的"继续对话"弹窗中按延迟自动提交。</div>',
        '<div class="field"><label>固定短语</label><input id="phraseInput" type="text" value="', escapeHtml(autoReplyText), '" placeholder="例如：继续 / 接着做 / proceed"/></div>',
        '<div class="field"><label>提交前延迟（秒）</label><div class="range-row"><input id="delayInput" type="range" min="0" max="60" step="1" value="', autoReplyDelaySec, '" oninput="document.getElementById(\'delayValue\').textContent=this.value+\'s\'"/><div class="v" id="delayValue">', autoReplyDelaySec, 's</div></div><div class="hint">0 = 立即提交，建议 2~6s 给你回看时间。</div></div>',
        '<div class="modal-actions"><button class="btn" onclick="closePhraseModal()">取消</button><button class="btn btn-primary" onclick="savePhrase()"><span class="ic">', ICONS.sparkle, '</span>保存</button></div>',
      '</div>',
    '</div>',

    '<script>',
    'const vscode=acquireVsCodeApi();',
    'function send(t,p){vscode.postMessage(Object.assign({type:t},p||{}));}',
    'function fmtUsd(v){return "$"+Number(v||0).toFixed(2);}',
    'function fmtTok(v){const n=Number(v||0);if(n>=1e6)return(n/1e6).toFixed(2)+"M";if(n>=1000)return(n/1000).toFixed(1)+"K";return String(Math.round(n));}',
    'function setText(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}',
    'window.addEventListener("message",e=>{const m=e.data;if(!m||m.type!=="plusLiveUpdate")return;const hv=document.getElementById("plus-hero-cost");if(hv&&hv.childNodes[0])hv.childNodes[0].textContent=fmtUsd(m.heroTotalCost);setText("plus-hero-tokens","  "+fmtTok(m.heroTotalTokens)+" tok");setText("plus-pool-usd",fmtUsd(m.aggregateDailyUsd));setText("plus-pool-tokens",fmtTok(m.aggregateDailyTokens));setText("plus-local-usd",fmtUsd(m.totalCost));setText("plus-local-tokens",fmtTok(m.localTokens));setText("plus-account-count",String(m.accountCount||0));setText("plus-request-count",String(m.requestCount||0));if(m.sparkPayload&&typeof applySparkUpdate==="function"){applySparkUpdate(m.sparkPayload);}});',
    SPARK_CLIENT_SCRIPT,
    'setInterval(()=>send("requestRefresh"),5000);',
    'function openPhraseModal(){document.getElementById("phraseModal").classList.add("show");setTimeout(()=>document.getElementById("phraseInput").focus(),60);}',
    'function closePhraseModal(){document.getElementById("phraseModal").classList.remove("show");}',
    'function savePhrase(){const text=document.getElementById("phraseInput").value.trim();const delay=Number(document.getElementById("delayInput").value)||0;if(!text){return;}send("savePhrase",{text:text,delay:delay});closePhraseModal();}',
    'document.addEventListener("keydown",e=>{if(e.key==="Escape")closePhraseModal();});',
    '</script>',
    '</body></html>'
  ].join('');
  return html;
}

module.exports = { getPlusPanelHtml, getPlusPanelLiveData };