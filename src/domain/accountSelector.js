const { readSharedState, getEffectiveAccounts } = require('../state/sharedState');

function accountKey(account) {
  const email = typeof account === 'string' ? account : (account && account.email);
  return String(email || '').trim().toLowerCase();
}

function isManuallyFrozenAccount(account) {
  if (account && typeof account === 'object' && account.manualFrozen) return true;
  const key = accountKey(account);
  if (!key) return false;
  const shared = readSharedState();
  const map = shared && shared.manualFrozenAccounts;
  return !!(map && map[key]);
}

function getAccountFreezeReason(account) {
  if (isManuallyFrozenAccount(account)) return '手动冻结';
  if (!account || account.weekly === undefined || account.weekly === null || account.weekly === '') return '';
  const weekly = Number(account.weekly);
  return Number.isFinite(weekly) && weekly <= 0 ? '周额度冻结' : '';
}

function isWeeklyQuotaFrozen(account) {
  return !!getAccountFreezeReason(account);
}

function pickBestAccountByDaily() {
  const accs = getEffectiveAccounts().filter(a => a && a.email && (a.valid !== false) && !isWeeklyQuotaFrozen(a));
  if (!accs.length) return null;
  return accs.reduce((best, cur) => {
    const bd = (best && best.daily !== undefined && best.daily !== null) ? Number(best.daily) : -1;
    const cd = (cur.daily !== undefined && cur.daily !== null) ? Number(cur.daily) : -1;
    return cd > bd ? cur : best;
  }, null);
}

module.exports = { pickBestAccountByDaily, isWeeklyQuotaFrozen, isManuallyFrozenAccount, getAccountFreezeReason };
