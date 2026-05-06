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
  const recentRealItems = Array.isArray(stats.recentReal) ? stats.recentReal.slice(0, 16).reverse() : [];
  const rawReal = recentRealItems.map(r => Number(r.total) || 0).filter(v => v > 0);
  const totalReal = Math.max(0, Number(stats.totalRealTokens || 0));
  const realSamples = Math.max(0, Number(stats.realSamples || 0));
  const lastReal = stats.lastReal || null;
  const fallbackReal = rawReal.length ? rawReal : (lastReal && Number(lastReal.total) > 0 ? [Number(lastReal.total)] : (totalReal > 0 ? [totalReal] : []));
  const recentItems = Array.isArray(stats.recent) ? stats.recent.slice(0, 16).reverse() : [];
  const rawRecent = recentItems.map(r => Number(r.estimatedTokens) || 0);
  const rawVisible = recentItems.map(r => {
    const direct = Number(r && r.visibleTokens);
    if (direct > 0) return direct;
    return (Number(r && r.reasonTokens) || 0) + (Number(r && r.detailsTokens) || 0) + (Number(r && r.attachmentTokens) || 0);
  }).filter(v => v > 0);
  const hasRealSpark = fallbackReal.length > 0 || totalReal > 0;
  const hasVisibleSpark = rawVisible.length > 0;
  const useBundleSpark = !hasRealSpark && !hasVisibleSpark && rawRecent.filter(v => v > 0).length < 3 && dailyVals.length >= 2;
  const dqt = (pricing && pricing.dailyQuotaTokens) || 1;
  const bundleSpark = dailyVals.map(d => Math.round(Math.max(0, 1 - d / 100) * dqt));
  const recent = hasRealSpark ? fallbackReal : (hasVisibleSpark ? rawVisible : (useBundleSpark ? bundleSpark : rawRecent));
  const recentCount = recent.length;
  const recentMax = recentCount ? Math.max(...recent) : 0;
  const recentAvg = hasRealSpark && totalReal > 0 && realSamples > 0 ? Math.round(totalReal / realSamples) : (recentCount ? Math.round(recent.reduce((a, b) => a + b, 0) / recentCount) : 0);
  const recentLast = recent[recent.length - 1] || 0;
  const recentSaved = recentItems.reduce((sum, r) => sum + (Number(r && r.savedTokens) || 0), 0);
  const recentEstimated = rawRecent.reduce((sum, v) => sum + v, 0);
  const totalSaved = Number(stats.totalSavedTokens) || 0;
  const totalEstimated = Number(stats.totalEstimatedTokens) || 0;
  const savedBase = recentEstimated > 0 ? recentEstimated + recentSaved : totalEstimated + totalSaved;
  const savedValue = recentEstimated > 0 ? recentSaved : totalSaved;
  const trend = hasRealSpark ? (realSamples || recentCount) : (hasVisibleSpark ? 0 : (savedBase > 0 ? Math.round(savedValue / savedBase * 100) : 0));
  const trendClass = hasRealSpark ? 'up' : (hasVisibleSpark ? 'flat' : (trend > 0 ? 'up' : 'flat'));
  const trendLabel = hasRealSpark ? '真实' : (hasVisibleSpark ? '输入' : (savedBase > 0 ? ('省 ' + trend + '%') : '--'));
  const last = stats.last || null;
  const realCountLabel = realSamples || rawReal.length || recentCount;
  const sparkTitle = hasRealSpark ? ('真实消耗 · ' + realCountLabel + ' 条样本') : (useBundleSpark ? ('各账号日已耗 · ' + accs.length + ' 账号') : (hasVisibleSpark ? '可见输入趋势' : ('脚本估算 · ' + recentCount + ' 条')));
  const sparkAvgLabel = hasRealSpark ? '均耗' : (hasVisibleSpark ? '均输' : '均值');
  const sparkMaxLabel = hasRealSpark ? '峰耗' : (hasVisibleSpark ? '峰输' : '峰值');
  const sparkLastLabel = useBundleSpark ? '最高已耗' : '最近';
  const sparkLastVal = hasRealSpark || hasVisibleSpark ? fmtToken(recentLast) : (useBundleSpark ? fmtToken(recentMax) : (last ? fmtToken(last.estimatedTokens) : '--'));
  return {
    sparkTitle,
    sparkHtml: sparklineSvg(recent),
    trend,
    trendClass,
    trendLabel,
    recentCount,
    recentAvg,
    recentMax,
    sparkAvgLabel,
    sparkMaxLabel,
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
      '<span id="spark-trend" class="spark-trend ', (p.trendClass || 'flat'), '" style="', (trendShown ? '' : 'display:none'), '">', p.trendLabel || '--', '</span>',
      '</div>',
      '<div class="spark-svg" id="spark-svg">', (p.sparkHtml || ''), '</div>',
      '<div class="spark-foot"><span><span id="spark-avg-label">', (p.sparkAvgLabel || '均值'), '</span> <b id="spark-avg">', fmtToken(p.recentAvg), '</b></span><span><span id="spark-max-label">', (p.sparkMaxLabel || '峰值'), '</span> <b id="spark-max">', fmtToken(p.recentMax), '</b></span><span><span id="spark-last-label">', (p.sparkLastLabel || '最近'), '</span> <b id="spark-last">', (p.sparkLastVal || '--'), '</b></span></div>',
    '</div>',
  ].join('');
}

const SPARK_CLIENT_SCRIPT = [
  'function _sparkFmtTok(v){var n=Number(v||0);if(n>=1e6)return(n/1e6).toFixed(2)+"M";if(n>=1000)return(n/1000).toFixed(1)+"K";return String(Math.round(n));}',
  'function applySparkUpdate(p){if(!p)return;var t=function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};t("spark-title",p.sparkTitle||"");var tr=document.getElementById("spark-trend");if(tr){tr.className="spark-trend "+(p.trendClass||"flat");tr.style.display=(p.recentCount>=2)?"inline-flex":"none";tr.textContent=p.trendLabel||"--";}var svg=document.getElementById("spark-svg");if(svg)svg.innerHTML=p.sparkHtml||"";t("spark-avg-label",p.sparkAvgLabel||"均值");t("spark-max-label",p.sparkMaxLabel||"峰值");t("spark-avg",_sparkFmtTok(p.recentAvg));t("spark-max",_sparkFmtTok(p.recentMax));t("spark-last-label",p.sparkLastLabel||"最近");t("spark-last",p.sparkLastVal||"--");}',
  'window.addEventListener("message",function(ev){var m=ev.data;if(m&&m.type==="sparkUpdate")applySparkUpdate(m.payload||m);});',
].join('');

module.exports = { sparklineSvg, buildSparkPayload, renderSparkCard, SPARK_CLIENT_SCRIPT };
