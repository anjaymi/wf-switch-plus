const fs = require('fs');
const path = require('path');
const os = require('os');

function getCandidateAccountsFiles() {
  const home = os.homedir();
  const files = [];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    files.push(path.join(appData, '.xinghuowindsurf', 'shared-data', 'accounts.json'));
  } else if (process.platform === 'darwin') {
    files.push(path.join(home, 'Library', 'Application Support', '.xinghuowindsurf', 'shared-data', 'accounts.json'));
  } else {
    const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    files.push(path.join(xdg, '.xinghuowindsurf', 'shared-data', 'accounts.json'));
  }
  files.push(path.join(home, '.xinghuowindsurf', 'shared-data', 'accounts.json'));
  return Array.from(new Set(files));
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function getToken(account) {
  return String(account && (account.sessionToken || account.apiKey || account.accessToken || account.token || '') || '').trim();
}

function normalizeXinghuoAccount(account, sourceFile, index) {
  if (!account || typeof account !== 'object') return null;
  const email = String(account.email || account.name || '').trim();
  const token = getToken(account);
  if (!email || !token) return null;
  return {
    id: account.id || 'xinghuo-' + (index + 1),
    email,
    name: account.name || '',
    sessionToken: account.sessionToken || account.apiKey || account.accessToken || account.token || '',
    apiKey: account.apiKey || '',
    accessToken: account.accessToken || '',
    auth1Token: account.auth1Token || account.devinAuth1Token || '',
    refreshToken: account.refreshToken || '',
    idToken: account.idToken || '',
    daily: asNumber(account.dailyQuotaRemainingPercent),
    weekly: asNumber(account.weeklyQuotaRemainingPercent),
    dailyQuotaResetAtUnix: account.dailyQuotaResetAtUnix,
    weeklyQuotaResetAtUnix: account.weeklyQuotaResetAtUnix,
    planName: account.planName || account.type || '',
    planEndUnix: account.planEndUnix || account.expiresAt || '',
    valid: account.valid !== false && account.status !== 'disabled',
    manualFrozen: !!account.manualFrozen,
    source: 'xinghuo',
    sourceFile,
    importedAt: new Date().toISOString(),
    raw: account,
  };
}

function readXinghuoAccounts() {
  const sources = [];
  const accounts = [];
  const seen = new Set();
  for (const file of getCandidateAccountsFiles()) {
    if (!fs.existsSync(file)) {
      sources.push({ file, ok: false, reason: 'not_found', accountCount: 0 });
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.accounts) ? parsed.accounts : []);
      let count = 0;
      for (let i = 0; i < list.length; i++) {
        const acc = normalizeXinghuoAccount(list[i], file, i);
        if (!acc) continue;
        const key = String(acc.email || acc.sessionToken || acc.apiKey).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        accounts.push(acc);
        count++;
      }
      sources.push({ file, ok: true, accountCount: count });
    } catch (e) {
      sources.push({ file, ok: false, reason: 'read_failed', error: e && e.message || String(e), accountCount: 0 });
    }
  }
  return { accounts, sources };
}

function mergeAccounts(existingAccounts, importedAccounts) {
  const map = new Map();
  for (const account of Array.isArray(existingAccounts) ? existingAccounts : []) {
    if (!account || !account.email) continue;
    map.set(String(account.email).toLowerCase(), account);
  }
  let added = 0;
  let updated = 0;
  for (const account of importedAccounts) {
    if (!account || !account.email) continue;
    const key = String(account.email).toLowerCase();
    if (map.has(key)) updated++;
    else added++;
    map.set(key, Object.assign({}, map.get(key) || {}, account));
  }
  return { accounts: Array.from(map.values()), added, updated };
}

module.exports = { getCandidateAccountsFiles, readXinghuoAccounts, mergeAccounts };
