'use strict';

const { parseFields, getField, getAllFields, asString } = require('./protobuf');

// 顶层 windsurfConfigurations 中 field 52 是 repeated ClientModelConfig
const TOP_FIELD_MODEL_CONFIG = 52;

// ClientModelConfig 关键字段
const FIELD_LABEL = 1;
const FIELD_CREDIT_MULTIPLIER = 3;
const FIELD_DISABLED = 4;
const FIELD_IS_PREMIUM = 7;
const FIELD_IS_BETA = 9;
const FIELD_PROVIDER = 10;
const FIELD_API_PROVIDER = 14;
const FIELD_MAX_TOKENS = 18;
const FIELD_MODEL_UID = 22;
const FIELD_MODEL_INFO = 23;
const FIELD_DESCRIPTION = 27;
const FIELD_MODEL_DIMENSIONS = 32;

// ModelDimension
const DIM_LABEL = 1;
const DIM_VALUE = 2;
const DIM_DENOMINATOR = 3;
const DIM_MIN_RANGE = 4;
const DIM_MAX_RANGE = 5;
const DIM_KIND = 6;
const DIM_INFO = 7;

// ModelDimensionKind enum: 0 UNSPECIFIED, 1 COST
const DIM_KIND_COST = 1;

function readDimension(buf) {
  const f = parseFields(buf);
  const labelF = getField(f, DIM_LABEL, 2);
  const valueF = getField(f, DIM_VALUE, 5);
  const denomF = getField(f, DIM_DENOMINATOR, 2);
  const minF = getField(f, DIM_MIN_RANGE, 5);
  const maxF = getField(f, DIM_MAX_RANGE, 5);
  const kindF = getField(f, DIM_KIND, 0);
  const infoF = getField(f, DIM_INFO, 2);
  return {
    label: labelF ? asString(labelF.value) : '',
    value: valueF ? Number(valueF.value) : null,
    denominator: denomF ? asString(denomF.value) : '',
    minRange: minF ? Number(minF.value) : null,
    maxRange: maxF ? Number(maxF.value) : null,
    kind: kindF ? Number(kindF.value) : 0,
    info: infoF ? asString(infoF.value) : '',
  };
}

function readModelConfig(buf) {
  const f = parseFields(buf);
  const labelF = getField(f, FIELD_LABEL, 2);
  const uidF = getField(f, FIELD_MODEL_UID, 2);
  const creditF = getField(f, FIELD_CREDIT_MULTIPLIER, 5);
  const maxTokF = getField(f, FIELD_MAX_TOKENS, 0);
  const disabledF = getField(f, FIELD_DISABLED, 0);
  const isPremiumF = getField(f, FIELD_IS_PREMIUM, 0);
  const isBetaF = getField(f, FIELD_IS_BETA, 0);
  const providerF = getField(f, FIELD_PROVIDER, 0);
  const apiProviderF = getField(f, FIELD_API_PROVIDER, 0);
  const descF = getField(f, FIELD_DESCRIPTION, 2);
  const dims = getAllFields(f, FIELD_MODEL_DIMENSIONS, 2).map(d => readDimension(d.value));
  const cost = { input: null, cachedInput: null, output: null, denominator: '', dimensions: dims };
  for (const d of dims) {
    if (d.kind !== DIM_KIND_COST) continue;
    const lab = (d.label || '').toLowerCase();
    if (!cost.denominator) cost.denominator = d.denominator;
    if (lab === 'input') cost.input = d.value;
    else if (lab === 'cached input') cost.cachedInput = d.value;
    else if (lab === 'output') cost.output = d.value;
  }
  return {
    label: labelF ? asString(labelF.value) : '',
    modelUid: uidF ? asString(uidF.value) : '',
    creditMultiplier: creditF ? Number(creditF.value) : null,
    maxTokens: maxTokF ? Number(maxTokF.value) : null,
    disabled: disabledF ? Boolean(Number(disabledF.value)) : false,
    isPremium: isPremiumF ? Boolean(Number(isPremiumF.value)) : false,
    isBeta: isBetaF ? Boolean(Number(isBetaF.value)) : false,
    provider: providerF ? Number(providerF.value) : 0,
    apiProvider: apiProviderF ? Number(apiProviderF.value) : 0,
    description: descF ? asString(descF.value) : '',
    cost,
  };
}

// 入口：从 windsurfConfigurations 二进制 Buffer 解析出所有模型配置。
// 返回 { models: [...], byUid: {uid: model}, byLabel: {label: model} }
function parseWindsurfConfigurations(buf) {
  const out = { models: [], byUid: {}, byLabel: {}, fetchedAt: Date.now() };
  if (!Buffer.isBuffer(buf) || buf.length === 0) return out;
  const top = parseFields(buf);
  const modelMsgs = getAllFields(top, TOP_FIELD_MODEL_CONFIG, 2);
  for (const m of modelMsgs) {
    let cfg;
    try { cfg = readModelConfig(m.value); } catch { continue; }
    if (!cfg || (!cfg.label && !cfg.modelUid)) continue;
    out.models.push(cfg);
    if (cfg.modelUid) out.byUid[cfg.modelUid] = cfg;
    if (cfg.label) out.byLabel[cfg.label] = cfg;
  }
  return out;
}

module.exports = { parseWindsurfConfigurations };
