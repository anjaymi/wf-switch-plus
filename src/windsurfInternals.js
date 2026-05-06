'use strict';

// 运行时从 globalThis.__wfPlusBridge__ 读取 Windsurf 内部实例，
// 封装 csrfToken / LS address 获取 + gRPC 调用。
//
// __wfPlusBridge__ 由 windsurfInjector 注入的桥代码在 Windsurf 激活后填充：
//   - .extensionServer → F 实例，含 csrfToken / port / apiServerUrl
//   - .lsManager      → y 实例，含 process.address / process.lspPort / process.languageServerPort
//
// 注意：桥是懒挂载 — extensionServer 在 Windsurf 激活时挂上，lsManager 在用户首次
// 发起 Cascade 对话使 LS 子进程启动后才挂上。

const { grpcUnary } = require('./windsurfGrpc');
const { buildGetGeneratorMetadataRequest, buildGetUserTrajectoryRequest, parseGeneratorMetadata, parseUserTrajectory } = require('./windsurfRpcProto');

function readBridge() {
  const b = globalThis.__wfPlusBridge__;
  if (!b || typeof b !== 'object') return null;
  return b;
}

function getCredentials() {
  const b = readBridge();
  if (!b) return { ok: false, reason: 'bridge-missing', hint: '请先注入 Windsurf 桥并重启 Windsurf' };
  const es = b.extensionServer;
  const ls = b.lsManager;
  const out = {
    bridgeVersion: b._version || 0,
    hasExtensionServer: !!es,
    hasLsManager: !!ls,
  };
  if (es) {
    try {
      if (typeof es.csrfToken === 'string' && es.csrfToken) out.csrfToken = es.csrfToken;
      if (typeof es.port === 'number') out.extensionServerPort = es.port;
      if (typeof es.apiServerUrl === 'string') out.apiServerUrl = es.apiServerUrl;
    } catch {}
  }
  if (ls) {
    try {
      const proc = ls.process;
      if (proc) {
        if (typeof proc.address === 'string' && proc.address) out.lsAddress = proc.address;
        if (typeof proc.lspPort === 'number') out.lspPort = proc.lspPort;
        if (typeof proc.languageServerPort === 'number') out.languageServerPort = proc.languageServerPort;
      }
    } catch {}
  }
  out.ok = !!(out.csrfToken && out.lsAddress);
  if (!out.ok) {
    if (!out.csrfToken) out.reason = 'csrf-missing';
    else if (!out.lsAddress) out.reason = 'ls-not-started';
  }
  return out;
}

async function callLanguageServer(method, body, opts = {}) {
  const cred = getCredentials();
  if (!cred.ok) throw new Error('凭据未就绪：' + (cred.reason || 'unknown'));
  const path = '/exa.language_server_pb.LanguageServerService/' + method;
  const resp = await grpcUnary({
    address: cred.lsAddress,
    csrfToken: cred.csrfToken,
    path,
    body,
    timeout: opts.timeout || 10000,
  });
  return resp;
}

async function getTrajectoryMetadata(cascadeId, offset = 0, opts = {}) {
  const reqBody = buildGetGeneratorMetadataRequest(cascadeId, offset);
  const respBuf = await callLanguageServer('GetCascadeTrajectoryGeneratorMetadata', reqBody, opts);
  return parseGeneratorMetadata(respBuf);
}

async function getUserTrajectory(trajectoryId, opts = {}) {
  const reqBody = buildGetUserTrajectoryRequest(trajectoryId);
  const respBuf = await callLanguageServer('GetUserTrajectory', reqBody, opts);
  return parseUserTrajectory(respBuf);
}

function looksLikeId(value) {
  const s = String(value || '').trim();
  return s.length >= 12 && s.length <= 120 && /^[A-Za-z0-9_.:-]+$/.test(s);
}

function addUnique(list, value, source) {
  const id = String(value || '').trim();
  if (!looksLikeId(id)) return;
  if (!list.some(x => x.id === id)) list.push({ id, source });
}

function findTrajectoryCandidates() {
  const b = readBridge();
  const out = { cascadeIds: [], trajectoryIds: [] };
  if (!b) return out;
  const roots = [
    { name: 'bridge', value: b },
    { name: 'extensionServer', value: b.extensionServer },
    { name: 'lsManager', value: b.lsManager },
  ];
  const seen = new WeakSet();
  const keyRe = /(cascade|trajectory|conversation).*id|id.*(cascade|trajectory|conversation)/i;
  function walk(v, path, depth) {
    if (!v || typeof v !== 'object' || depth > 5 || seen.has(v)) return;
    seen.add(v);
    let keys = [];
    try { keys = Object.keys(v); } catch { return; }
    for (const k of keys.slice(0, 80)) {
      let child;
      try { child = v[k]; } catch { continue; }
      const p = path ? path + '.' + k : k;
      if (typeof child === 'string' && keyRe.test(k)) {
        if (/cascade/i.test(k)) addUnique(out.cascadeIds, child, p);
        if (/trajectory|conversation/i.test(k)) addUnique(out.trajectoryIds, child, p);
      }
      if (child && typeof child === 'object') walk(child, p, depth + 1);
    }
  }
  for (const r of roots) walk(r.value, r.name, 0);
  return out;
}

async function resolveCascadeIdFromCandidates(opts = {}) {
  const c = findTrajectoryCandidates();
  const all = [...c.cascadeIds, ...c.trajectoryIds].filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
  for (const item of all) {
    try {
      const meta = await getTrajectoryMetadata(item.id, opts.offset || 0, { timeout: opts.timeout || 3000 });
      if (meta && (meta.entryCount || meta.total)) return { cascadeId: item.id, source: item.source, meta, offset: opts.offset || 0 };
    } catch {}
  }
  for (const item of c.trajectoryIds) {
    try {
      const traj = await getUserTrajectory(item.id, { timeout: opts.timeout || 3000 });
      if (traj && traj.cascadeId) {
        const meta = await getTrajectoryMetadata(traj.cascadeId, opts.offset || 0, { timeout: opts.timeout || 3000 });
        if (meta && (meta.entryCount || meta.total)) {
          return { cascadeId: traj.cascadeId, trajectoryId: traj.trajectoryId || item.id, source: item.source, meta, offset: opts.offset || 0 };
        }
      }
    } catch {}
  }
  return { cascadeId: '', trajectoryId: '', candidates: c };
}

// 收集桥的诊断信息（用于验证命令）
function diagnose() {
  const b = readBridge();
  const out = {
    bridgeObjectPresent: !!b,
    timestamp: new Date().toISOString(),
  };
  if (b) {
    out.bridgeKeys = Object.keys(b);
    const cred = getCredentials();
    out.credentials = {
      ok: cred.ok,
      reason: cred.reason || null,
      hasExtensionServer: cred.hasExtensionServer,
      hasLsManager: cred.hasLsManager,
      csrfTokenLen: cred.csrfToken ? cred.csrfToken.length : 0,
      extensionServerPort: cred.extensionServerPort || null,
      apiServerUrl: cred.apiServerUrl || null,
      lsAddress: cred.lsAddress || null,
      lspPort: cred.lspPort || null,
      languageServerPort: cred.languageServerPort || null,
    };
  }
  return out;
}

module.exports = {
  readBridge,
  getCredentials,
  callLanguageServer,
  getTrajectoryMetadata,
  getUserTrajectory,
  findTrajectoryCandidates,
  resolveCascadeIdFromCandidates,
  diagnose,
};
