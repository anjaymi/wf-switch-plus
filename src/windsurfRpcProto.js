'use strict';

// GetCascadeTrajectoryGeneratorMetadata 请求/响应的 protobuf wire 编解码。
// 字段编号取自 Windsurf 扩展 bundle 和 dwgx/WindsurfAPI (src/windsurf.js) 两处交叉验证。
//
// Request  { string cascade_id = 1; uint32 generator_metadata_offset = 2; }
// Response { repeated CortexStepGeneratorMetadata generator_metadata = 1; }
//   CortexStepGeneratorMetadata { ChatModelMetadata chat_model = 1; ... }
//     ChatModelMetadata { ... ModelUsageStats usage = <n>; }
//       ModelUsageStats { int64 input_tokens / cached_input_tokens / output_tokens / ... }

const { parseFields, getField, getAllFields, asString } = require('./protobuf');

// ──────────── 写入辅助 ────────────
function writeVarint(n) {
  const out = [];
  let v = BigInt(n);
  while (v > 0x7fn) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Buffer.from(out);
}
function writeTag(fieldNo, wire) {
  return writeVarint((fieldNo << 3) | wire);
}
function writeStringField(fieldNo, value) {
  const s = Buffer.from(String(value || ''), 'utf8');
  return Buffer.concat([writeTag(fieldNo, 2), writeVarint(s.length), s]);
}
function writeVarintField(fieldNo, value) {
  return Buffer.concat([writeTag(fieldNo, 0), writeVarint(value)]);
}

// ──────────── Request ────────────
function buildGetGeneratorMetadataRequest(cascadeId, offset = 0) {
  const parts = [writeStringField(1, cascadeId)];
  if (offset > 0) parts.push(writeVarintField(2, offset));
  return Buffer.concat(parts);
}

function buildGetUserTrajectoryRequest(trajectoryId) {
  return writeStringField(1, trajectoryId);
}

function writeMessageField(fieldNo, value) {
  const b = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  return Buffer.concat([writeTag(fieldNo, 2), writeVarint(b.length), b]);
}

function buildRequestWithEmptyMetadata() {
  return writeMessageField(1, Buffer.alloc(0));
}

// ──────────── Response 解析 ────────────
// 策略：不硬编码 ChatModelMetadata.usage 的字段号（它会变、且嵌套深），
// 而是递归深搜找所有 "ModelUsageStats-形状" 的子消息：
//   其含有若干 varint 字段且名称语义为 *_tokens。
// 由于我们无法从 bundle 拿到字段名，这里用启发式：
//   - 遇到任意子消息，枚举它所有 varint 字段
//   - 求和 sum = inputTokens + cachedInputTokens + outputTokens 的估计
//   - 取字段值最大的 3 个作为 (output / input / cached) 的近似
// 这是先占位，后续靠实测 Windsurf bundle 拿到精确字段号再收紧。

function walkForUsageStats(buf, depth = 0, out = []) {
  if (!Buffer.isBuffer(buf) || buf.length === 0 || depth > 8) return out;
  let fields;
  try { fields = parseFields(buf); } catch { return out; }
  if (!fields.length) return out;

  // 典型 ModelUsageStats 消息：>=3 个 varint 字段且全部是正整数（token 数）。
  const varints = fields.filter(f => f.wire === 0 && typeof f.value === 'bigint' && f.value >= 0n);
  const varintValues = varints.map(f => Number(f.value));
  const bigEnough = varintValues.filter(v => v >= 10).length;
  if (varints.length >= 3 && bigEnough >= 2 && fields.length <= 24) {
    // 可能是 ModelUsageStats；记录原始字段
    out.push({ depth, fields: varints.map(f => ({ no: f.no, value: Number(f.value) })) });
  }

  for (const f of fields) {
    if (f.wire === 2 && Buffer.isBuffer(f.value) && f.value.length > 0) {
      walkForUsageStats(f.value, depth + 1, out);
    }
  }
  return out;
}

// 合并多个 step 的 usage stats，按字段号聚合。
function aggregateByFieldNo(usageList) {
  const agg = {}; // no -> total
  for (const u of usageList) {
    for (const { no, value } of u.fields) {
      agg[no] = (agg[no] || 0) + value;
    }
  }
  return agg;
}

// 启发式：把字段号按值大小排序，输出 label 化结果。
// 多数情况下 output_tokens > input_tokens > cached_input_tokens，或反之。
// 用户层语义（input/cached/output）留给调用方最终映射。
function parseGeneratorMetadata(buf) {
  const fields = parseFields(buf);
  const entries = getAllFields(fields, 1, 2);
  if (!entries.length) return { entryCount: 0, usages: [], aggregatedByField: {}, total: 0 };
  const allUsages = [];
  for (const e of entries) {
    // CortexStepGeneratorMetadata -> 深搜 usage stats
    const hits = walkForUsageStats(e.value);
    if (hits.length) allUsages.push(...hits);
  }
  const aggregated = aggregateByFieldNo(allUsages);
  const total = Object.values(aggregated).reduce((a, b) => a + b, 0);
  return {
    entryCount: entries.length,
    usages: allUsages,
    aggregatedByField: aggregated,
    total,
  };
}

function parseUserTrajectory(buf) {
  const fields = parseFields(buf);
  const trajectoryField = getField(fields, 1, 2);
  if (!trajectoryField || !Buffer.isBuffer(trajectoryField.value)) return null;
  const trajectoryFields = parseFields(trajectoryField.value);
  const trajectoryIdField = getField(trajectoryFields, 1, 2);
  const cascadeIdField = getField(trajectoryFields, 6, 2);
  return {
    trajectoryId: trajectoryIdField ? asString(trajectoryIdField.value) : '',
    cascadeId: cascadeIdField ? asString(cascadeIdField.value) : '',
  };
}

// 便于调试：把解析后的原始字段结构 dump 成易读 JSON。
function debugDump(buf, maxDepth = 4) {
  function walk(b, d) {
    if (d > maxDepth || !Buffer.isBuffer(b)) return { raw: 'buf', size: b && b.length };
    const f = parseFields(b);
    return f.map(x => {
      if (x.wire === 0) return { no: x.no, varint: String(x.value) };
      if (x.wire === 2) {
        if (x.value.length && x.value.length < 256) {
          // 尝试当 sub-message 解
          try {
            const sub = parseFields(x.value);
            if (sub.length) return { no: x.no, submsg: walk(x.value, d + 1) };
          } catch {}
        }
        return { no: x.no, bytes: x.value.length, preview: x.value.slice(0, 32).toString('utf8').replace(/[^\x20-\x7e]/g, '.') };
      }
      if (x.wire === 5) return { no: x.no, float: x.value };
      if (x.wire === 1) return { no: x.no, double: x.value };
      return { no: x.no, wire: x.wire };
    });
  }
  return walk(buf, 0);
}

module.exports = {
  buildGetGeneratorMetadataRequest,
  buildGetUserTrajectoryRequest,
  parseGeneratorMetadata,
  parseUserTrajectory,
  debugDump,
  // 辅助
  writeStringField,
  writeMessageField,
  buildRequestWithEmptyMetadata,
  writeVarintField,
  writeVarint,
};
