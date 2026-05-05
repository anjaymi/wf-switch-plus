const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_PRICE = { inputPer1M: 5, cachedPer1M: 0.5, outputPer1M: 25 };

const MODELS = {
  'adaptive': { name: 'Adaptive', provider: 'windsurf', credit: 1 },
  'gpt-5.5': { name: 'GPT-5.5 Medium', provider: 'openai', credit: 2 },
  'gpt-5.5-medium': { name: 'GPT-5.5 Medium', provider: 'openai', credit: 2 },
  'gpt-5.5-high': { name: 'GPT-5.5 High', provider: 'openai', credit: 4 },
  'gpt-5.5-xhigh': { name: 'GPT-5.5 XHigh', provider: 'openai', credit: 8 },
  'gpt-5.5-medium-fast': { name: 'GPT-5.5 Medium Fast', provider: 'openai', credit: 4 },
  'gpt-5.5-high-fast': { name: 'GPT-5.5 High Fast', provider: 'openai', credit: 8 },
  'gpt-5.5-xhigh-fast': { name: 'GPT-5.5 XHigh Fast', provider: 'openai', credit: 16 },
  'gpt-5.4-medium': { name: 'GPT-5.4 Medium', provider: 'openai', credit: 2 },
  'gpt-5.4-high': { name: 'GPT-5.4 High', provider: 'openai', credit: 4 },
  'gpt-5.4-xhigh': { name: 'GPT-5.4 XHigh', provider: 'openai', credit: 8 },
  'gpt-5.2': { name: 'GPT-5.2 Medium', provider: 'openai', credit: 2 },
  'gpt-5.2-low': { name: 'GPT-5.2 Low', provider: 'openai', credit: 1 },
  'gpt-5.2-high': { name: 'GPT-5.2 High', provider: 'openai', credit: 3 },
  'gpt-5.2-xhigh': { name: 'GPT-5.2 XHigh', provider: 'openai', credit: 8 },
  'gpt-5.1': { name: 'GPT-5.1', provider: 'openai', credit: 0.5 },
  'gpt-5.1-medium': { name: 'GPT-5.1 Medium', provider: 'openai', credit: 1 },
  'gpt-5.1-high': { name: 'GPT-5.1 High', provider: 'openai', credit: 2 },
  'gpt-5': { name: 'GPT-5', provider: 'openai', credit: 0.5 },
  'gpt-5-medium': { name: 'GPT-5 Medium', provider: 'openai', credit: 1 },
  'gpt-5-high': { name: 'GPT-5 High', provider: 'openai', credit: 2 },
  'gpt-5-codex': { name: 'GPT-5 Codex', provider: 'openai', credit: 0.5 },
  'gpt-4.1': { name: 'GPT-4.1', provider: 'openai', credit: 1 },
  'claude-opus-4-7-medium': { name: 'Claude Opus 4.7 Medium', provider: 'anthropic', credit: 8, price: BASE_PRICE },
  'claude-opus-4-7-low': { name: 'Claude Opus 4.7 Low', provider: 'anthropic', credit: 6, price: BASE_PRICE },
  'claude-opus-4-7-high': { name: 'Claude Opus 4.7 High', provider: 'anthropic', credit: 10, price: BASE_PRICE },
  'claude-opus-4-7-xhigh': { name: 'Claude Opus 4.7 XHigh', provider: 'anthropic', credit: 12, price: BASE_PRICE },
  'claude-opus-4-7-max': { name: 'Claude Opus 4.7 Max', provider: 'anthropic', credit: 16, price: BASE_PRICE },
  'claude-opus-4-7-medium-thinking': { name: 'Claude Opus 4.7 Medium Thinking', provider: 'anthropic', credit: 10, price: BASE_PRICE },
  'claude-opus-4-7-high-thinking': { name: 'Claude Opus 4.7 High Thinking', provider: 'anthropic', credit: 12, price: BASE_PRICE },
  'claude-opus-4-7-xhigh-thinking': { name: 'Claude Opus 4.7 XHigh Thinking', provider: 'anthropic', credit: 16, price: BASE_PRICE },
  'claude-sonnet-4.6': { name: 'Claude Sonnet 4.6', provider: 'anthropic', credit: 4 },
  'claude-sonnet-4.6-thinking': { name: 'Claude Sonnet 4.6 Thinking', provider: 'anthropic', credit: 6 },
  'claude-sonnet-4-6': { name: 'Claude Sonnet 4.6', provider: 'anthropic', credit: 4 },
  'claude-sonnet-4-6-thinking': { name: 'Claude Sonnet 4.6 Thinking', provider: 'anthropic', credit: 6 },
  'claude-sonnet-4.6-1m': { name: 'Claude Sonnet 4.6 1M', provider: 'anthropic', credit: 12 },
  'claude-opus-4.6': { name: 'Claude Opus 4.6', provider: 'anthropic', credit: 6 },
  'claude-opus-4.6-thinking': { name: 'Claude Opus 4.6 Thinking', provider: 'anthropic', credit: 8 },
  'deepseek-v4': { name: 'DeepSeek V4', provider: 'deepseek', credit: 0.5 },
  'deepseek-v3': { name: 'DeepSeek V3', provider: 'deepseek', credit: 0.5 },
  'gemini-3.0-pro': { name: 'Gemini 3.0 Pro', provider: 'google', credit: 1 },
  'gemini-3.0-flash': { name: 'Gemini 3.0 Flash', provider: 'google', credit: 1 },
  'gemini-2.5-pro': { name: 'Gemini 2.5 Pro', provider: 'google', credit: 1 },
  'kimi-k2-thinking': { name: 'Kimi K2 Thinking', provider: 'moonshot', credit: 1 },
  'glm-4.7': { name: 'GLM 4.7', provider: 'zhipu', credit: 0.25 },
  'glm-4.7-fast': { name: 'GLM 4.7 Fast', provider: 'zhipu', credit: 0.5 },
  'minimax-m2.5': { name: 'MiniMax M2.5', provider: 'minimax', credit: 1 },
  'swe-1.6': { name: 'SWE 1.6', provider: 'windsurf', credit: 0.5 },
  'swe-1.6-fast': { name: 'SWE 1.6 Fast', provider: 'windsurf', credit: 0.5 },
};

const ALIASES = {
  'claude opus 4.7 medium': 'claude-opus-4-7-medium',
  'claude opus 4.7': 'claude-opus-4-7-medium',
  'opus 4.7': 'claude-opus-4-7-medium',
  'claude opus 4.7 high': 'claude-opus-4-7-high',
  'claude opus 4.7 xhigh': 'claude-opus-4-7-xhigh',
  'claude opus 4.7 max': 'claude-opus-4-7-max',
  'claude sonnet 4.6 thinking': 'claude-sonnet-4.6-thinking',
  'claude sonnet 4.6': 'claude-sonnet-4.6',
  'gpt-5.5 high thinking': 'gpt-5.5-high',
  'gpt-5.5 high': 'gpt-5.5-high',
  'gpt-5.5': 'gpt-5.5-medium',
  'deepseek v4': 'deepseek-v4',
};

const MODEL_RE = /\b(adaptive|claude[-\s_.]opus[-\s_.]4[-\s_.]7(?:[-\s_.](?:low|medium|high|xhigh|max))?(?:[-\s_.]thinking)?|claude[-\s_.]sonnet[-\s_.]4[-\s_.]6(?:[-\s_.]thinking)?|gpt[-\s_.]5(?:\.5|\.4|\.2|\.1)?(?:[-\s_.](?:none|low|medium|high|xhigh|codex|fast|thinking))*|deepseek[-\s_.]v\d+|gemini[-\s_.]\d(?:\.\d)?[-\s_.](?:pro|flash)|kimi[-\s_.]k2(?:[-\s_.]thinking)?|glm[-\s_.]4\.7(?:[-\s_.]fast)?|minimax[-\s_.]m2\.5|swe[-\s_.]1\.6(?:[-\s_.]fast)?)\b/ig;

function normalizeModelId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/_/g, '-').replace(/\s+/g, ' ').trim();
  if (ALIASES[lower]) return ALIASES[lower];
  let compact = lower.replace(/\s+/g, '-');
  // Windsurf 把"快速档"写成 -priority，价目表用 -fast
  compact = compact.replace(/-priority(?=$|-)/g, '-fast');
  if (MODELS[compact]) return compact;
  // Windsurf state.vscdb 里写成 "gpt-5-5-high" / "claude-sonnet-4-6-thinking"，价目表 key 用点号
  // 把数字版本号中的连字符还原为点号，例如 gpt-5-5 -> gpt-5.5、claude-sonnet-4-6 -> claude-sonnet-4.6
  const dotted = compact
    .replace(/^(gpt-\d)-(\d)(?=-|$)/, '$1.$2')
    .replace(/^(claude-(?:opus|sonnet|haiku))-(\d)-(\d)(?=-|$)/, '$1-$2.$3')
    .replace(/^(gemini-\d)-(\d)(?=-|$)/, '$1.$2')
    .replace(/^(glm-\d)-(\d)(?=-|$)/, '$1.$2')
    .replace(/^(swe-\d)-(\d)(?=-|$)/, '$1.$2')
    .replace(/^(kimi-k\d)-(\d)(?=-|$)/, '$1.$2')
    .replace(/^(minimax-m\d)-(\d)(?=-|$)/, '$1.$2');
  if (MODELS[dotted]) return dotted;
  // Opus 4.7 在价目表里反而用连字符 4-7，这里强制保留连字符形式
  const opus47 = dotted.replace(/^claude-opus-4\.7/, 'claude-opus-4-7');
  if (MODELS[opus47]) return opus47;
  return MODELS[dotted] ? dotted : (MODELS[compact] ? compact : (opus47 || dotted || compact));
}

function getModelInfo(modelId) {
  const id = normalizeModelId(modelId);
  if (!id) return null;
  const info = MODELS[id] || null;
  return info ? Object.assign({ id }, info) : { id, name: modelId, provider: 'unknown', credit: 1 };
}

function getAllModels() {
  return Object.entries(MODELS).map(([id, info]) => Object.assign({ id }, info));
}

function detectModelsInText(text) {
  const found = [];
  const s = String(text || '');
  let match;
  MODEL_RE.lastIndex = 0;
  while ((match = MODEL_RE.exec(s))) {
    const id = normalizeModelId(match[1]);
    if (id) found.push(id);
  }
  return found;
}

function windsurfStateFiles() {
  const app = process.env.APPDATA || '';
  const home = os.homedir();
  const candidates = [
    path.join(app, 'Windsurf', 'User', 'globalStorage', 'state.vscdb'),
    path.join(app, 'Windsurf', 'User', 'globalStorage', 'state.vscdb.backup'),
    path.join(app, 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    path.join(home, '.windsurf', 'User', 'globalStorage', 'state.vscdb'),
  ];
  const out = [];
  for (const p of candidates) {
    try { const st = fs.statSync(p); if (st.size > 0) out.push({ path: p, mtimeMs: st.mtimeMs }); } catch {}
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// 从 sqlite/二进制状态库里找形如 "windsurf.state.lastSelectedCascadeModelUids":["xxx", ...]
// 直接做二进制文本搜索，避免引入 sqlite 依赖。
function pickFromCascadeUidArray(buffer) {
  const s = buffer.toString('binary');
  const key = 'lastSelectedCascadeModelUids';
  const idx = s.indexOf(key);
  if (idx < 0) return '';
  const open = s.indexOf('[', idx);
  if (open < 0 || open - idx > 80) return '';
  const close = s.indexOf(']', open);
  if (close < 0 || close - open > 4096) return '';
  const inner = s.slice(open + 1, close);
  const m = inner.match(/"([^"\\\r\n]{1,120})"/);
  if (!m) return '';
  return normalizeModelId(m[1]);
}

function pickFromSmartFriendUid(buffer) {
  const s = buffer.toString('binary');
  const idx = s.indexOf('lastSelectedSmartFriendModelUid');
  if (idx < 0) return '';
  const seg = s.slice(idx, Math.min(s.length, idx + 200));
  const m = seg.match(/"([A-Za-z0-9_.\-]{2,80})"/g);
  if (!m) return '';
  // 第一个匹配是 key 本身被引号包；第二个才是值。
  for (let i = 1; i < m.length; i++) {
    const v = m[i].replace(/^"|"$/g, '');
    if (v && v !== 'lastSelectedSmartFriendModelUid') return normalizeModelId(v);
  }
  return '';
}

function detectCurrentModel() {
  const stateFiles = windsurfStateFiles();
  for (const f of stateFiles) {
    let buf;
    try { buf = fs.readFileSync(f.path); } catch { continue; }
    const id = pickFromCascadeUidArray(buf) || pickFromSmartFriendUid(buf);
    if (id) return { id, info: getModelInfo(id), source: f.path, detectedAt: Date.now() };
  }
  return { id: '', info: null, source: '', detectedAt: Date.now() };
}

function estimateModelCost(tokens, modelId, mix) {
  const info = getModelInfo(modelId);
  const price = info && info.price;
  const n = Number(tokens || 0);
  if (!price) return { known: false, cost: 0, info };
  const mc = mix && typeof mix.cached === 'number' ? mix.cached : 0.5;
  const mi = mix && typeof mix.input === 'number' ? mix.input : 0.3;
  const mo = mix && typeof mix.output === 'number' ? mix.output : 0.2;
  const sum = mc + mi + mo || 1;
  const blended = (mc / sum) * price.cachedPer1M + (mi / sum) * price.inputPer1M + (mo / sum) * price.outputPer1M;
  return { known: true, cost: n * blended / 1000000, blendedPer1M: blended, info };
}

module.exports = { BASE_PRICE, getAllModels, getModelInfo, detectCurrentModel, estimateModelCost, normalizeModelId };

