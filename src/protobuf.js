'use strict';

function parseFields(buf) {
  const out = [];
  if (!Buffer.isBuffer(buf)) return out;
  let i = 0;
  while (i < buf.length) {
    let tag = 0n;
    let shift = 0n;
    let ok = false;
    while (i < buf.length) {
      const b = buf[i++];
      tag |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) { ok = true; break; }
      shift += 7n;
      if (shift > 64n) return out;
    }
    if (!ok) return out;
    const fieldNo = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire === 0) {
      let v = 0n;
      shift = 0n;
      let done = false;
      while (i < buf.length) {
        const b = buf[i++];
        v |= BigInt(b & 0x7f) << shift;
        if (!(b & 0x80)) { done = true; break; }
        shift += 7n;
        if (shift > 64n) return out;
      }
      if (!done) return out;
      out.push({ no: fieldNo, wire: 0, value: v });
    } else if (wire === 2) {
      let len = 0n;
      shift = 0n;
      let done = false;
      while (i < buf.length) {
        const b = buf[i++];
        len |= BigInt(b & 0x7f) << shift;
        if (!(b & 0x80)) { done = true; break; }
        shift += 7n;
        if (shift > 64n) return out;
      }
      if (!done) return out;
      const L = Number(len);
      if (L < 0 || i + L > buf.length) return out;
      out.push({ no: fieldNo, wire: 2, value: buf.slice(i, i + L) });
      i += L;
    } else if (wire === 5) {
      if (i + 4 > buf.length) return out;
      out.push({ no: fieldNo, wire: 5, value: buf.readFloatLE(i) });
      i += 4;
    } else if (wire === 1) {
      if (i + 8 > buf.length) return out;
      out.push({ no: fieldNo, wire: 1, value: buf.readDoubleLE(i) });
      i += 8;
    } else {
      return out;
    }
  }
  return out;
}

function getField(fields, no, wire) {
  for (const f of fields) {
    if (f.no === no && (wire === undefined || f.wire === wire)) return f;
  }
  return null;
}

function getAllFields(fields, no, wire) {
  const out = [];
  for (const f of fields) {
    if (f.no === no && (wire === undefined || f.wire === wire)) out.push(f);
  }
  return out;
}

function asString(buf) {
  if (Buffer.isBuffer(buf)) return buf.toString('utf8');
  return buf == null ? '' : String(buf);
}

module.exports = { parseFields, getField, getAllFields, asString };
