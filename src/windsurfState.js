'use strict';

// 读 Windsurf 本地 state.vscdb，抽出关键键值（API key、模型缓存等）。
// 使用打包进 src/vendor/sql/ 的 sql.js（纯 wasm SQLite）。

const fs = require('fs');
const os = require('os');
const path = require('path');

let _SQL = null;
let _initPromise = null;

function loadSqlJs() {
  if (_SQL) return Promise.resolve(_SQL);
  if (_initPromise) return _initPromise;
  const initSqlJs = require('./vendor/sql/sql-wasm.js');
  const wasmPath = path.join(__dirname, 'vendor', 'sql', 'sql-wasm.wasm');
  let wasmBinary;
  try { wasmBinary = fs.readFileSync(wasmPath); } catch (e) {
    return Promise.reject(new Error('sql-wasm.wasm not found at ' + wasmPath));
  }
  _initPromise = initSqlJs({ wasmBinary }).then((SQL) => { _SQL = SQL; return SQL; });
  return _initPromise;
}

function findStateVscdb() {
  const home = os.homedir();
  const app = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const candidates = [
    path.join(app, 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
    path.join(app, 'Windsurf - Insiders', 'User', 'globalStorage', 'state.vscdb'),
    path.join(home, '.config', 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
    path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
  ];
  for (const p of candidates) {
    try { if (fs.statSync(p).size > 0) return p; } catch {}
  }
  return '';
}

// Windsurf 在运行时对 state.vscdb 持有写锁（WAL 模式），直接打开易失败/读取陈旧。
// 拷一份临时副本再读。
function copyToTemp(srcPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-switch-plus-state-'));
  const dst = path.join(tmpDir, 'state.vscdb');
  fs.copyFileSync(srcPath, dst);
  // 同时尝试拷贝 -wal/-shm，避免遗漏最近写入
  try { fs.copyFileSync(srcPath + '-wal', dst + '-wal'); } catch {}
  try { fs.copyFileSync(srcPath + '-shm', dst + '-shm'); } catch {}
  return { dir: tmpDir, file: dst };
}

function rmTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// 读取一组 key 对应的 value，返回 { key: Buffer | string }
async function readItemTableKeys(keys, opts = {}) {
  const stateFile = opts.stateFile || findStateVscdb();
  if (!stateFile) return { stateFile: '', values: {} };
  const SQL = await loadSqlJs();
  const tmp = copyToTemp(stateFile);
  try {
    const buf = fs.readFileSync(tmp.file);
    const db = new SQL.Database(buf);
    const out = {};
    const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
    for (const k of keys) {
      stmt.bind([k]);
      out[k] = stmt.step() ? stmt.get()[0] : null;
      stmt.reset();
    }
    stmt.free();
    db.close();
    return { stateFile, values: out };
  } finally {
    rmTempDir(tmp.dir);
  }
}

function asString(v) {
  if (v == null) return '';
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (v instanceof Uint8Array) return Buffer.from(v).toString('utf8');
  return String(v);
}

function asBuffer(v) {
  if (v == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  // ItemTable.value 是 BLOB，sql.js 通常返回 Uint8Array；少数情况可能是字符串（base64 / utf8）
  // 这里按需作 base64 解码再回退原文。
  const s = String(v);
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(s) && s.length % 4 === 0) {
    try { return Buffer.from(s, 'base64'); } catch {}
  }
  return Buffer.from(s, 'utf8');
}

module.exports = {
  loadSqlJs,
  findStateVscdb,
  readItemTableKeys,
  asString,
  asBuffer,
};
