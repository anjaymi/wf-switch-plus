const { escapeHtml, escapeAttrArg } = require('./shared/htmlEscape');
const { isWeeklyQuotaFrozen, isManuallyFrozenAccount, getAccountFreezeReason } = require('./domain/accountSelector');
function fmtPct(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '--';
  return Math.max(0, Math.min(100, Math.round(Number(value)))) + '%';
}
function fmtTime(at) {
  if (!at) return '';
  try { const t = Number(at); if (!t) return ''; return new Date(t).toLocaleString('zh-CN'); } catch { return ''; }
}
function relTime(at) {
  if (!at) return '';
  const t = Number(at); if (!t) return '';
  const diff = Date.now() - t;
  if (diff < 0) return fmtTime(at);
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  return d + ' 天前';
}
function quotaBar(percent, color) {
  const p = (percent === null || percent === undefined || Number.isNaN(Number(percent))) ? null : Math.max(0, Math.min(100, Number(percent)));
  if (p === null) return `<div class="qbar empty"><span></span></div>`;
  return `<div class="qbar"><span style="width:${p}%;background:${color}"></span></div>`;
}

function getAccountsOverviewHtml({ shared, baselines, currentEmail, bridgeInjected }) {
  const bundle = (shared && shared.bundle) || null;
  const baselineMap = baselines || {};
  const accountsArr = (bundle && Array.isArray(bundle.accounts)) ? bundle.accounts : [];
  const cdkRemaining = (bundle && bundle.cdkCode) ? '已激活' : '未激活';
  const syncedAt = bundle && bundle.syncedAt;

  // 排序：日额度从高到低（null 放最后），其次最近活动
  const accounts = [...accountsArr].sort((a, b) => {
    const ad = (a && a.daily !== undefined && a.daily !== null) ? Number(a.daily) : -1;
    const bd = (b && b.daily !== undefined && b.daily !== null) ? Number(b.daily) : -1;
    if (bd !== ad) return bd - ad;
    return Number(b && (b.lastLiveAt || b.sessionRefreshedAt) || 0) - Number(a && (a.lastLiveAt || a.sessionRefreshedAt) || 0);
  });
  const best = accounts.find(a => a && a.daily !== undefined && !isWeeklyQuotaFrozen(a));
  const bestEmail = best ? best.email : '';

  const rows = accounts.map((a) => {
    const email = a && a.email ? String(a.email) : '';
    if (!email) return '';
    const daily = (a.daily !== undefined && a.daily !== null) ? Number(a.daily) : null;
    const weekly = (a.weekly !== undefined && a.weekly !== null) ? Number(a.weekly) : null;
    const planName = a.planName || '';
    const planEnd = a.planEndUnix ? a.planEndUnix * 1000 : 0;
    const lastLive = a.lastLiveAt || a.sessionRefreshedAt || 0;
    const valid = (a.valid !== false);
    const frozen = isWeeklyQuotaFrozen(a);
    const manualFrozen = isManuallyFrozenAccount(a);
    const freezeReason = getAccountFreezeReason(a);
    const isCurrent = email && currentEmail && email.toLowerCase() === String(currentEmail).toLowerCase();
    const emailArg = escapeAttrArg(email);
    const dColor = daily === null ? '#475569' : (daily >= 60 ? '#22c55e' : daily >= 25 ? '#f59e0b' : '#ef4444');
    const wColor = weekly === null ? '#475569' : (weekly >= 60 ? '#22c55e' : weekly >= 25 ? '#f59e0b' : '#ef4444');
    const planEndStr = planEnd ? '订阅到期 ' + new Date(planEnd).toLocaleDateString('zh-CN') : '';
    const isBest = bestEmail && email === bestEmail && !isCurrent && daily !== null && !frozen;
    const source = String(a.source || (a.imported ? 'xinghuo' : 'original'));
    const sourceLabel = source === 'xinghuo' ? '星火' : (source === 'merged' ? '原版+星火' : '原版');
    const sourceClass = source === 'xinghuo' ? 'badge-xh' : (source === 'merged' ? 'badge-merged' : 'badge-src');
    return `
      <div class="acc ${isCurrent ? 'current' : ''} ${!valid ? 'invalid' : ''} ${frozen ? 'frozen' : ''}">
        <div class="acc-main">
          <div class="acc-email">${escapeHtml(email)}
            ${isCurrent ? '<span class="badge badge-cur">当前账号</span>' : ''}
            ${isBest ? '<span class="badge badge-best">日额度最高</span>' : ''}
            <span class="badge ${sourceClass}">${escapeHtml(sourceLabel)}</span>
            ${frozen ? '<span class="badge badge-frozen">' + escapeHtml(freezeReason) + '</span>' : ''}
            ${!valid ? '<span class="badge badge-bad">异常</span>' : ''}
          </div>
          <div class="acc-meta">${planName ? '套餐 ' + escapeHtml(planName) : ''}${planName && planEndStr ? '  ' : ''}${planEndStr}${lastLive ? '  上次活动 ' + relTime(lastLive) : ''}</div>
        </div>
        <div class="acc-quotas">
          <div class="qrow"><span class="qlbl">日额度</span><span class="qval" style="color:${dColor}">${fmtPct(daily)}</span>${quotaBar(daily, dColor)}</div>
          <div class="qrow"><span class="qlbl">周额度</span><span class="qval" style="color:${wColor}">${fmtPct(weekly)}</span>${quotaBar(weekly, wColor)}</div>
        </div>
        <div class="acc-actions">
          ${isCurrent ? '' : (frozen ? '<button class="btn-mini" disabled>已冻结</button>' : `<button class="btn-mini btn-primary" onclick="send('switchTo', ${emailArg})">切换到</button>`)}
          <button class="btn-mini ${manualFrozen ? 'btn-warn' : ''}" onclick="send('toggleFreeze', ${emailArg})">${manualFrozen ? '取消冻结' : '冻结账号'}</button>
          <button class="btn-mini" onclick="send('viewToken', ${emailArg})">查看 Token</button>
          <button class="btn-mini" onclick="send('copyToken', ${emailArg})">复制 Token</button>
          <button class="btn-mini" onclick="send('copyEmail', ${emailArg})">复制邮箱</button>
        </div>
      </div>
    `;
  }).filter(Boolean).join('');

  const summaryDaily = accounts.length ? Math.round(accounts.reduce((s,a) => s + (Number(a.daily)||0), 0) / accounts.length) : null;
  const summaryWeekly = accounts.length ? Math.round(accounts.reduce((s,a) => s + (Number(a.weekly)||0), 0) / accounts.length) : null;
  const empty = accounts.length === 0;

  const css = `
    *{box-sizing:border-box}html,body{margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",var(--vscode-font-family),sans-serif;color:#e2e8f0;background:radial-gradient(120% 80% at 0% 0%,#1e1b4b 0%,#0a0f1f 38%,#04060c 100%);min-height:100vh;padding:28px 32px;font-size:13px;line-height:1.55}
    .wrap{max-width:1080px;margin:0 auto}
    .head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:22px;flex-wrap:wrap}
    .title{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
    .title .icon{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 18px rgba(99,102,241,.4)}
    .sub{font-size:12px;color:#94a3b8;margin-top:6px;max-width:560px}
    .pill{font-size:11px;padding:4px 10px;border-radius:999px;display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,.14);color:#4ade80;border:1px solid rgba(34,197,94,.3);font-weight:500}
    .pill.warn{background:rgba(245,158,11,.14);color:#fbbf24;border-color:rgba(245,158,11,.3)}
    .pill .dot{width:6px;height:6px;border-radius:999px;background:currentColor}
    .actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .btn{appearance:none;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.55);color:#e2e8f0;border-radius:10px;padding:8px 13px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s;font-weight:500}
    .btn:hover{border-color:rgba(99,102,241,.55);background:rgba(99,102,241,.12)}
    .btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent;color:#fff;font-weight:600;box-shadow:0 4px 14px rgba(99,102,241,.35)}
    .summary-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
    .skpi{background:linear-gradient(180deg,rgba(30,41,59,.6),rgba(15,23,42,.55));border:1px solid rgba(148,163,184,.12);border-radius:12px;padding:12px 14px}
    .skpi-label{font-size:10.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
    .skpi-value{font-size:20px;font-weight:800;color:#fff;margin-top:4px;letter-spacing:-.01em}
    .skpi-value.usd{background:linear-gradient(135deg,#fbbf24,#f97316);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .skpi-sub{font-size:11px;color:#94a3b8;margin-top:3px}
    .toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap}
    .toolbar .lhs{font-size:12px;color:#94a3b8}
    .toolbar .lhs b{color:#fff;font-weight:600}
    .acc{display:grid;grid-template-columns:1.6fr 1.2fr auto;gap:18px;align-items:center;background:linear-gradient(180deg,rgba(30,41,59,.6),rgba(15,23,42,.55));border:1px solid rgba(148,163,184,.12);border-radius:14px;padding:14px 18px;margin-bottom:10px;transition:all .18s}
    .acc:hover{border-color:rgba(139,92,246,.4)}
    .acc.current{border-color:rgba(139,92,246,.6);background:linear-gradient(180deg,rgba(99,102,241,.16),rgba(15,23,42,.55))}
    .acc.invalid{opacity:.7}
    .acc.frozen{opacity:.72;border-color:rgba(239,68,68,.28)}
    .acc-email{font-size:14px;font-weight:700;color:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .badge{font-size:10px;padding:2px 7px;border-radius:999px;font-weight:600}
    .badge-cur{background:rgba(139,92,246,.25);color:#c4b5fd;border:1px solid rgba(139,92,246,.45)}
    .badge-best{background:rgba(34,197,94,.2);color:#86efac;border:1px solid rgba(34,197,94,.4)}
    .badge-frozen{background:rgba(239,68,68,.18);color:#fca5a5;border:1px solid rgba(239,68,68,.35)}
    .badge-src{background:rgba(148,163,184,.16);color:#cbd5e1;border:1px solid rgba(148,163,184,.28)}
    .badge-xh{background:rgba(14,165,233,.18);color:#7dd3fc;border:1px solid rgba(14,165,233,.36)}
    .badge-merged{background:rgba(245,158,11,.18);color:#fcd34d;border:1px solid rgba(245,158,11,.36)}
    .badge-bad{background:rgba(239,68,68,.18);color:#fca5a5;border:1px solid rgba(239,68,68,.35)}
    .acc-meta{font-size:11px;color:#94a3b8;margin-top:4px}
    .acc-quotas{display:flex;flex-direction:column;gap:6px;min-width:180px}
    .qrow{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px;font-size:11px}
    .qlbl{color:#94a3b8;font-weight:500}
    .qval{font-weight:700;font-size:12px;text-align:right;min-width:42px}
    .qbar{height:6px;border-radius:999px;background:rgba(148,163,184,.14);overflow:hidden}
    .qbar>span{display:block;height:100%;border-radius:999px;transition:width .4s}
    .qbar.empty>span{width:0}
    .acc-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .btn-mini{appearance:none;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.5);color:#cbd5e1;border-radius:7px;padding:6px 12px;font-size:11px;cursor:pointer;font-weight:500;transition:all .15s}
    .btn-mini:disabled{opacity:.55;cursor:not-allowed}
    .btn-mini:hover{border-color:#6366f1;color:#fff}
    .btn-mini:disabled:hover{border-color:rgba(148,163,184,.2);color:#cbd5e1}
    .btn-mini.btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent;color:#fff;font-weight:600}
    .btn-mini.btn-warn{background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.36);color:#fca5a5}
    .empty{text-align:center;padding:52px 20px;border:1px dashed rgba(148,163,184,.25);border-radius:16px;color:#94a3b8;font-size:13px;line-height:1.7}
    .empty b{color:#fff;font-weight:600}
    .foot{margin-top:18px;padding-top:14px;border-top:1px solid rgba(148,163,184,.1);font-size:11px;color:#94a3b8}
    code{background:rgba(15,23,42,.7);padding:2px 7px;border-radius:5px;border:1px solid rgba(148,163,184,.16);font-family:ui-monospace,Consolas,monospace;color:#e2e8f0;font-size:11px}
  `;

  return `<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style></head><body><div class="wrap">
    <div class="head">
      <div>
        <div class="title"><span class="icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>账号总览</div>
        <div class="sub">通过伴生桥从原版插件捕获的 bundle.accounts 数组，按日额度排序。点击"切换到"调用原版 localSwitchTo() 实现无感切号。</div>
      </div>
      <div class="actions">
        <span class="pill ${bridgeInjected ? '' : 'warn'}"><i class="dot"></i>${bridgeInjected ? '伴生桥已注入' : '伴生桥未注入'}</span>
        <button class="btn" onclick="send('refreshViaBridge')"> 调用原版刷新</button>
        <button class="btn btn-primary" onclick="send('smartSwitch')"> 自动切到最高日额度</button>
      </div>
    </div>

    <div class="summary-row">
      <div class="skpi"><div class="skpi-label">账号总数</div><div class="skpi-value">${accounts.length}</div><div class="skpi-sub">${cdkRemaining}</div></div>
      <div class="skpi"><div class="skpi-label">平均日额度</div><div class="skpi-value">${fmtPct(summaryDaily)}</div><div class="skpi-sub">越高越省切换</div></div>
      <div class="skpi"><div class="skpi-label">平均周额度</div><div class="skpi-value">${fmtPct(summaryWeekly)}</div><div class="skpi-sub">周内可用余量</div></div>
      <div class="skpi"><div class="skpi-label">推荐切换</div><div class="skpi-value" style="font-size:13px;line-height:1.4;font-weight:700">${escapeHtml(bestEmail || '当前已最高')}</div><div class="skpi-sub">基于 daily 排序</div></div>
    </div>

    <div class="toolbar">
      <div class="lhs">共 <b>${accounts.length}</b> 个账号  当前 <b>${escapeHtml(currentEmail || '未识别')}</b>${syncedAt ? '  同步于 ' + relTime(syncedAt) : ''}</div>
      <div class="actions">
        <button class="btn" onclick="send('exportTokens', 'clipboard')">导出全部 Token（剪贴板）</button>
        <button class="btn" onclick="send('exportTokens', 'file')">导出全部 Token（文件）</button>
        <button class="btn" onclick="send('importClipboard')">从剪贴板导入</button>
        <button class="btn" onclick="requestXinghuoImport()">从星火导入</button>
        <button class="btn" onclick="send('resetAll')">重置全部基线</button>
      </div>
    </div>

    ${empty ? `
      <div class="empty">
        <p style="font-size:14px;color:#fff"><b>没有账号数据</b></p>
        <p>请先 <b>注入伴生桥</b>，重载窗口让原版插件至少触发一次 bundle 同步，或从剪贴板 / 星火插件导入账号。</p>
      </div>
    ` : rows}

    <div class="foot">数据源：<code>~/.wf-account-mgr/wf-shared-state.json</code>（伴生桥写入 bundle）+ <code>globalState.quotaBaselineV1</code>（伴生本地）。无感切号通过 <code>wf-bridge-request.json</code> 请求原版 <code>localSwitchTo()</code>。</div>
  </div>
  <div id="tokenModal" class="modal-mask" style="display:none" onclick="if(event.target===this)closeTokenModal()">
    <div class="modal-card">
      <div class="modal-head">
        <div class="modal-title">账号 Token 详情</div>
        <button class="btn-mini" onclick="closeTokenModal()">关闭</button>
      </div>
      <div class="modal-body">
        <div class="modal-row"><span class="mlbl">邮箱</span><code id="tk-email" class="mval"></code></div>
        <div class="modal-row"><span class="mlbl">套餐</span><span id="tk-plan" class="mval"></span></div>
        <div class="modal-row"><span class="mlbl">日/周</span><span id="tk-quota" class="mval"></span></div>
        <div class="modal-row column"><span class="mlbl">sessionToken（反代用）</span><textarea id="tk-session" readonly></textarea><div class="row-actions"><button class="btn-mini" onclick="copyField('tk-session')">复制 sessionToken</button></div></div>
        <div class="modal-row column"><span class="mlbl">auth1Token</span><textarea id="tk-auth1" readonly></textarea><div class="row-actions"><button class="btn-mini" onclick="copyField('tk-auth1')">复制 auth1Token</button></div></div>
        <div class="modal-row column"><span class="mlbl">完整 JSON</span><textarea id="tk-json" readonly></textarea><div class="row-actions"><button class="btn-mini" onclick="copyField('tk-json')">复制 JSON</button></div></div>
      </div>
    </div>
  </div>
  <div id="xinghuoImportModal" class="modal-mask" style="display:none" onclick="if(event.target===this)closeXinghuoImportModal()">
    <div class="modal-card xh-card">
      <div class="modal-head">
        <div>
          <div class="modal-title">从星火导入账号</div>
          <div class="xh-sub">读取星火共享账号文件，选择后合并到 WF 增强账号总览。</div>
        </div>
        <button class="btn-mini" onclick="closeXinghuoImportModal()">关闭</button>
      </div>
      <div class="xh-toolbar">
        <label class="xh-check"><input id="xh-all" type="checkbox" checked onchange="setXinghuoAll(this.checked)"> 全选</label>
        <input id="xh-search" class="xh-search" placeholder="搜索邮箱 / 套餐" oninput="renderXinghuoImportList()">
        <span id="xh-count" class="xh-count"></span>
      </div>
      <div id="xh-source" class="xh-source"></div>
      <div id="xh-list" class="xh-list"></div>
      <div class="xh-footer">
        <button class="btn-mini" onclick="closeXinghuoImportModal()">取消</button>
        <button id="xh-import-btn" class="btn-mini btn-primary" onclick="submitXinghuoImport()">导入所选账号</button>
      </div>
    </div>
  </div>
  <style>
    .modal-mask{position:fixed;inset:0;background:rgba(2,6,15,.78);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px}
    .modal-card{width:100%;max-width:680px;max-height:90vh;overflow:auto;background:linear-gradient(180deg,rgba(30,41,59,.92),rgba(15,23,42,.92));border:1px solid rgba(139,92,246,.4);border-radius:16px;padding:18px 22px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
    .modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(148,163,184,.15)}
    .modal-title{font-size:15px;font-weight:700;color:#fff}
    .modal-body{display:flex;flex-direction:column;gap:12px}
    .modal-row{display:grid;grid-template-columns:120px 1fr;align-items:center;gap:10px}
    .modal-row.column{grid-template-columns:1fr}
    .mlbl{font-size:11px;color:#94a3b8;font-weight:500}
    .mval{font-size:12px;color:#e2e8f0;word-break:break-all}
    .modal-row textarea{width:100%;min-height:62px;font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#e2e8f0;background:rgba(2,6,15,.6);border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:8px 10px;resize:vertical}
    .row-actions{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
    .xh-card{max-width:880px;padding:0;overflow:hidden}
    .xh-card .modal-head{padding:18px 22px;margin:0}
    .xh-sub{font-size:11px;color:#94a3b8;margin-top:3px}
    .xh-toolbar{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:12px 22px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,15,.22)}
    .xh-check{display:flex;align-items:center;gap:7px;color:#cbd5e1;font-size:12px;white-space:nowrap}
    .xh-check input,.xh-row input{accent-color:#8b5cf6}
    .xh-search{width:100%;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,15,.45);color:#e2e8f0;border-radius:10px;padding:8px 11px;font-size:12px;outline:none}
    .xh-search:focus{border-color:rgba(139,92,246,.55);box-shadow:0 0 0 3px rgba(139,92,246,.12)}
    .xh-count{font-size:11px;color:#a78bfa;font-weight:700;white-space:nowrap}
    .xh-source{padding:10px 22px;font-size:11px;color:#94a3b8;border-bottom:1px solid rgba(148,163,184,.1);word-break:break-all}
    .xh-list{max-height:52vh;overflow:auto;padding:10px 14px;background:rgba(2,6,15,.16)}
    .xh-row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:11px 12px;border:1px solid rgba(148,163,184,.12);border-radius:12px;background:rgba(15,23,42,.5);margin-bottom:8px;transition:all .15s}
    .xh-row:hover{border-color:rgba(139,92,246,.42);background:rgba(99,102,241,.12)}
    .xh-email{font-size:13px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .xh-meta{font-size:11px;color:#94a3b8;margin-top:3px;word-break:break-all}
    .xh-quota{display:flex;gap:8px;align-items:center;white-space:nowrap}
    .xh-chip{font-size:10px;padding:3px 7px;border-radius:999px;background:rgba(99,102,241,.16);color:#c4b5fd;border:1px solid rgba(99,102,241,.32);font-weight:700}
    .xh-chip.warn{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.3);color:#fca5a5}
    .xh-empty{padding:32px;text-align:center;color:#94a3b8;border:1px dashed rgba(148,163,184,.24);border-radius:12px}
    .xh-footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px;border-top:1px solid rgba(148,163,184,.12);background:rgba(2,6,15,.2)}
  </style>
  <script>
    const vscode=acquireVsCodeApi();
    var xinghuoAccounts=[];
    var xinghuoSources=[];
    var xinghuoSelected={};
    function send(type,payload){vscode.postMessage({type:type,payload:payload});}
    function esc(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function fmtXhPct(v){if(v===null||v===undefined||v===''||Number.isNaN(Number(v)))return '--';return Math.max(0,Math.min(100,Math.round(Number(v))))+'%';}
    function openTokenModal(d){
      document.getElementById('tk-email').textContent=d.email||'';
      document.getElementById('tk-plan').textContent=(d.planName||'-')+(d.valid===false?'  异常':'');
      document.getElementById('tk-quota').textContent='日 '+(d.daily??'--')+'%  周 '+(d.weekly??'--')+'%';
      document.getElementById('tk-session').value=d.sessionToken||'';
      document.getElementById('tk-auth1').value=d.auth1Token||'';
      document.getElementById('tk-json').value=JSON.stringify(d,null,2);
      document.getElementById('tokenModal').style.display='flex';
    }
    function closeTokenModal(){document.getElementById('tokenModal').style.display='none';}
    function copyField(id){var el=document.getElementById(id);el.select();el.setSelectionRange(0,el.value.length);try{document.execCommand('copy');send('toast','已复制');}catch(e){send('toast','复制失败');}}
    function openXinghuoImportModal(payload){
      xinghuoAccounts=(payload&&Array.isArray(payload.accounts))?payload.accounts:[];
      xinghuoSources=(payload&&Array.isArray(payload.sources))?payload.sources:[];
      xinghuoSelected={};
      xinghuoAccounts.forEach(function(a){if(a&&a.email)xinghuoSelected[String(a.email).toLowerCase()]=true;});
      document.getElementById('xinghuoImportModal').style.display='flex';
      document.getElementById('xh-search').value='';
      if(payload&&payload.error){
        document.getElementById('xh-source').textContent='读取失败：'+payload.error;
        document.getElementById('xh-list').innerHTML='<div class="xh-empty">星火账号读取失败，请稍后重试</div>';
        updateXinghuoSelected();
        return;
      }
      renderXinghuoImportList();
    }
    function requestXinghuoImport(){
      document.getElementById('xinghuoImportModal').style.display='flex';
      document.getElementById('xh-search').value='';
      document.getElementById('xh-source').textContent='正在读取星火账号...';
      document.getElementById('xh-list').innerHTML='<div class="xh-empty">正在扫描 .xinghuowindsurf/shared-data/accounts.json</div>';
      document.getElementById('xh-count').textContent='';
      document.getElementById('xh-import-btn').disabled=true;
      send('importXinghuo');
    }
    function closeXinghuoImportModal(){document.getElementById('xinghuoImportModal').style.display='none';}
    function renderXinghuoImportList(){
      var q=(document.getElementById('xh-search').value||'').trim().toLowerCase();
      var list=xinghuoAccounts.filter(function(a){return !q||String(a.email||'').toLowerCase().includes(q)||String(a.planName||'').toLowerCase().includes(q);});
      var source=xinghuoSources.find(function(s){return s&&s.ok&&s.accountCount>0;});
      document.getElementById('xh-source').textContent=source?('来源：'+source.file):'未发现可导入的星火账号文件';
      if(!list.length){
        document.getElementById('xh-list').innerHTML='<div class="xh-empty">没有匹配的星火账号</div>';
        updateXinghuoSelected();
        return;
      }
      document.getElementById('xh-list').innerHTML=list.map(function(a){
        var frozen=a.manualFrozen?'<span class="xh-chip warn">手动冻结</span>':'';
        var key=String(a.email||'').toLowerCase();
        return '<label class="xh-row"><input class="xh-item" type="checkbox" '+(xinghuoSelected[key]?'checked':'')+' data-email="'+esc(a.email)+'" onchange="toggleXinghuoItem(this)"><div><div class="xh-email">'+esc(a.email)+frozen+'</div><div class="xh-meta">'+esc(a.planName||'星火账号')+' · '+esc(a.sourceFile||'')+'</div></div><div class="xh-quota"><span class="xh-chip">日 '+fmtXhPct(a.daily)+'</span><span class="xh-chip">周 '+fmtXhPct(a.weekly)+'</span></div></label>';
      }).join('');
      updateXinghuoSelected();
    }
    function setXinghuoAll(checked){
      xinghuoAccounts.forEach(function(a){if(a&&a.email)xinghuoSelected[String(a.email).toLowerCase()]=checked;});
      Array.from(document.querySelectorAll('.xh-item')).forEach(function(el){el.checked=checked;});
      updateXinghuoSelected();
    }
    function toggleXinghuoItem(el){xinghuoSelected[String(el.getAttribute('data-email')||'').toLowerCase()]=el.checked;updateXinghuoSelected();}
    function updateXinghuoSelected(){
      var items=Array.from(document.querySelectorAll('.xh-item'));
      var selected=xinghuoAccounts.filter(function(a){return a&&a.email&&xinghuoSelected[String(a.email).toLowerCase()];}).length;
      var all=document.getElementById('xh-all');
      all.checked=xinghuoAccounts.length>0&&selected===xinghuoAccounts.length;
      all.indeterminate=selected>0&&selected<xinghuoAccounts.length;
      document.getElementById('xh-count').textContent='已选 '+selected+' / '+xinghuoAccounts.length;
      document.getElementById('xh-import-btn').disabled=selected===0;
    }
    function submitXinghuoImport(){
      var selected=xinghuoAccounts.filter(function(a){return a&&a.email&&xinghuoSelected[String(a.email).toLowerCase()];}).map(function(a){return a.email;});
      send('importXinghuoSelected',selected);
      closeXinghuoImportModal();
    }
    window.addEventListener('message',function(ev){var msg=ev.data||{};if(msg.type==='showToken'&&msg.payload)openTokenModal(msg.payload);if(msg.type==='showXinghuoImport'&&msg.payload)openXinghuoImportModal(msg.payload);});
  </script>
  </body></html>`;
}

module.exports = { getAccountsOverviewHtml };