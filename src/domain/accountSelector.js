const { getBundleAccounts } = require('../state/sharedState');

function pickBestAccountByDaily() {
  const accs = getBundleAccounts().filter(a => a && a.email && (a.valid !== false));
  if (!accs.length) return null;
  return accs.reduce((best, cur) => {
    const bd = (best && best.daily !== undefined && best.daily !== null) ? Number(best.daily) : -1;
    const cd = (cur.daily !== undefined && cur.daily !== null) ? Number(cur.daily) : -1;
    return cd > bd ? cur : best;
  }, null);
}

module.exports = { pickBestAccountByDaily };
