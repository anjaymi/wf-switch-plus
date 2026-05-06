const { getBundleAccounts } = require('../state/sharedState');

function isWeeklyQuotaFrozen(account) {
  if (!account || account.weekly === undefined || account.weekly === null || account.weekly === '') return false;
  const weekly = Number(account.weekly);
  return Number.isFinite(weekly) && weekly <= 0;
}

function pickBestAccountByDaily() {
  const accs = getBundleAccounts().filter(a => a && a.email && (a.valid !== false) && !isWeeklyQuotaFrozen(a));
  if (!accs.length) return null;
  return accs.reduce((best, cur) => {
    const bd = (best && best.daily !== undefined && best.daily !== null) ? Number(best.daily) : -1;
    const cd = (cur.daily !== undefined && cur.daily !== null) ? Number(cur.daily) : -1;
    return cd > bd ? cur : best;
  }, null);
}

module.exports = { pickBestAccountByDaily, isWeeklyQuotaFrozen };
