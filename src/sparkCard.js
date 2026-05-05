function fmtToken(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function sparklineSvg(values, width, height) {
  const W = width || 220, H = height || 60, PAD = 4;
  const arr = Array.isArray(values) ? values.filter(v => Number.isFinite(v)) : [];
  if (arr.length < 2) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"><text x="${W/2}" y="${H/2+4}" text-anchor="middle" fill="#475569" font-size="10">暂无足够数据</text></svg>`;
  }
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = (max - min) || 1;
  const step = (W - PAD * 2) / (arr.length - 1);
  const pts = arr.map((v, i) => {
    const x = PAD + i * step;
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return [x, y];
  });
  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const areaPath = linePath + ' L ' + pts[pts.length-1][0].toFixed(1) + ' ' + (H - PAD) + ' L ' + pts[0][0].toFixed(1) + ' ' + (H - PAD) + ' Z';
  const lastX = pts[pts.length-1][0].toFixed(1), lastY = pts[pts.length-1][1].toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"><defs><linearGradient id="sl" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#a78bfa" stop-opacity=".55"/><stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/></linearGradient></defs><path d="${areaPath}" fill="url(#sl)"/><path d="${linePath}" fill="none" stroke="#c4b5fd" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastX}" cy="${lastY}" r="2.4" fill="#fff" stroke="#a78bfa" stroke-width="1.5"/></svg>`;
}

function buildSparkPayload({ stats, pricing, bundleAccounts }) {
  const accs = Array.isArray(bundleAccounts) ? bundleAccounts.filter(a => a && a.email) : [];
  const dailyVals = accs.map(a => a.daily).filter(v => v !== undefined && v !== null && !Number.isNaN(Number(v))).map(Number);
  const rawRecent = Array.isArray(stats.recent) ? stats.recent.slice(0, 16).reverse().map(r => Number(r.estimatedTokens) || 0) : [];
  const useBundleSpark = rawRecent.filter(v => v > 0).length < 3 && dailyVals.length >= 2;
  const dqt = (pricing && pricing.dailyQuotaTokens) || 1;
  const bundleSpark = dailyVals.map(d => Math.round(Math.max(0, 1 - d / 100) * dqt));
  const recent = useBundleSpark ? bundleSpark : rawRecent;
  const recentCount = recent.length;
  const recentMax = recentCount ? Math.max(...recent) : 0;
  const recentAvg = recentCount ? Math.round(recent.reduce((a, b) => a + b, 0) / recentCount) : 0;
  const recentLast = recent[recent.length - 1] || 0;
  const trend = recentCount >= 2 ? Math.round((recentLast - recent[0]) / Math.max(1, recent[0]) * 100) : 0;
  const trendClass = trend > 0 ? 'up' : (trend < 0 ? 'down' : 'flat');
  const last = stats.last || null;
  const sparkTitle = useBundleSpark ? ('各账号日已耗 · ' + accs.length + ' 账号') : ('最近 ' + recentCount + ' 次脚本');
  const sparkLastLabel = useBundleSpark ? '最高已耗' : '最近';
  const sparkLastVal = useBundleSpark ? fmtToken(recentMax) : (last ? fmtToken(last.estimatedTokens) : '--');
  return {
    sparkTitle,
    sparkHtml: sparklineSvg(recent),
    trend,
    trendClass,
    recentCount,
    recentAvg,
    recentMax,
    sparkLastLabel,
    sparkLastVal,
  };
}

function renderSparkCard(payload) {
  const p = payload || {};
  const trendShown = (p.recentCount >= 2);
  return [
    '<div class="spark-card" id="spark-card">',
      '<div class="spark-head"><span id="spark-title">', p.sparkTitle || '', '</span>',
      '<span id="spark-trend" class="spark-trend ', (p.trendClass || 'flat'), '" style="', (trendShown ? '' : 'display:none'), '">', (p.trend > 0 ? '+' : ''), Number(p.trend || 0), '%</span>',
      '</div>',
      '<div class="spark-svg" id="spark-svg">', (p.sparkHtml || ''), '</div>',
      '<div class="spark-foot"><span>均值 <b id="spark-avg">', fmtToken(p.recentAvg), '</b></span><span>峰值 <b id="spark-max">', fmtToken(p.recentMax), '</b></span><span><span id="spark-last-label">', (p.sparkLastLabel || '最近'), '</span> <b id="spark-last">', (p.sparkLastVal || '--'), '</b></span></div>',
    '</div>',
  ].join('');
}

const SPARK_CLIENT_SCRIPT = [
  'function _sparkFmtTok(v){var n=Number(v||0);if(n>=1e6)return(n/1e6).toFixed(2)+"M";if(n>=1000)return(n/1000).toFixed(1)+"K";return String(Math.round(n));}',
  'function applySparkUpdate(p){if(!p)return;var t=function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};t("spark-title",p.sparkTitle||"");var tr=document.getElementById("spark-trend");if(tr){tr.className="spark-trend "+(p.trendClass||"flat");tr.style.display=(p.recentCount>=2)?"inline-flex":"none";tr.textContent=((p.trend>0?"+":"")+String(p.trend||0)+"%");}var svg=document.getElementById("spark-svg");if(svg)svg.innerHTML=p.sparkHtml||"";t("spark-avg",_sparkFmtTok(p.recentAvg));t("spark-max",_sparkFmtTok(p.recentMax));t("spark-last-label",p.sparkLastLabel||"最近");t("spark-last",p.sparkLastVal||"--");}',
  'window.addEventListener("message",function(ev){var m=ev.data;if(m&&m.type==="sparkUpdate")applySparkUpdate(m.payload||m);});',
].join('');

module.exports = { sparklineSvg, buildSparkPayload, renderSparkCard, SPARK_CLIENT_SCRIPT };
