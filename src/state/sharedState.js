const fs = require('fs');
const path = require('path');
const { SHARED_STATE_FILE } = require('../shared/paths');
const { mergeAccounts } = require('../domain/xinghuoImporter');

function readSharedState() {
  try {
    if (fs.existsSync(SHARED_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SHARED_STATE_FILE, 'utf8')) || {};
    }
  } catch (e) {}
  return {};
}

function getImportedAccounts(shared = readSharedState()) {
  return Array.isArray(shared.importedAccounts) ? shared.importedAccounts : [];
}

function mergeBundleWithImported(bundle, importedAccounts) {
  const base = Object.assign({}, bundle || {});
  const existing = Array.isArray(base.accounts) ? base.accounts : [];
  const imported = Array.isArray(importedAccounts) ? importedAccounts : [];
  if (!imported.length) return base;
  return Object.assign({}, base, { accounts: mergeAccounts(existing, imported).accounts });
}

function getEffectiveBundle(shared = readSharedState()) {
  return mergeBundleWithImported(shared.bundle || {}, getImportedAccounts(shared));
}

function getEffectiveAccounts(shared = readSharedState()) {
  const bundle = getEffectiveBundle(shared);
  return Array.isArray(bundle.accounts) ? bundle.accounts : [];
}

function buildEffectiveShared(shared = readSharedState()) {
  return Object.assign({}, shared, { bundle: getEffectiveBundle(shared) });
}

async function writeSharedState(patch) {
  const cur = readSharedState();
  const next = Object.assign({}, cur, patch);
  if (next.bundle && Array.isArray(next.bundle.accounts)) {
    next.bundle = mergeBundleWithImported(next.bundle, getImportedAccounts(next));
  }
  await fs.promises.mkdir(path.dirname(SHARED_STATE_FILE), { recursive: true });
  await fs.promises.writeFile(SHARED_STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
}

async function mergeImportedAccounts(accounts) {
  const cur = readSharedState();
  const merged = mergeAccounts(getImportedAccounts(cur), accounts);
  const bundle = mergeBundleWithImported(cur.bundle || {}, merged.accounts);
  await writeSharedState({
    importedAccounts: merged.accounts,
    bundle: Object.assign({}, bundle, {
      syncedAt: Date.now(),
      source: bundle.source || 'mixed',
    }),
  });
  return merged;
}

function getBundleAccounts() {
  return getEffectiveAccounts();
}

function findBundleAccount(email) {
  return findEffectiveAccount(email);
}

function findEffectiveAccount(email) {
  if (!email) return null;
  const accs = getEffectiveAccounts();
  const k = String(email).toLowerCase();
  return accs.find(a => a && a.email && String(a.email).toLowerCase() === k) || null;
}

module.exports = {
  readSharedState,
  writeSharedState,
  buildEffectiveShared,
  getImportedAccounts,
  getEffectiveBundle,
  getEffectiveAccounts,
  findEffectiveAccount,
  mergeImportedAccounts,
  getBundleAccounts,
  findBundleAccount,
};
