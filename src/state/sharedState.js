const fs = require('fs');
const path = require('path');
const { SHARED_STATE_FILE } = require('../shared/paths');

function readSharedState() {
  try {
    if (fs.existsSync(SHARED_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SHARED_STATE_FILE, 'utf8')) || {};
    }
  } catch (e) {}
  return {};
}

async function writeSharedState(patch) {
  const cur = readSharedState();
  const next = Object.assign({}, cur, patch);
  await fs.promises.mkdir(path.dirname(SHARED_STATE_FILE), { recursive: true });
  await fs.promises.writeFile(SHARED_STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
}

function getBundleAccounts() {
  const shared = readSharedState();
  return (shared && shared.bundle && Array.isArray(shared.bundle.accounts)) ? shared.bundle.accounts : [];
}

function findBundleAccount(email) {
  if (!email) return null;
  const accs = getBundleAccounts();
  const k = String(email).toLowerCase();
  return accs.find(a => a && a.email && String(a.email).toLowerCase() === k) || null;
}

module.exports = {
  readSharedState,
  writeSharedState,
  getBundleAccounts,
  findBundleAccount,
};
