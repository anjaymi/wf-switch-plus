'use strict';

// 轻量 gRPC over HTTP/2 客户端，对接 Windsurf 本机 LanguageServer。
// 参考 dwgx/WindsurfAPI (src/grpc.js) 的帧格式实现。
//
//   gRPC frame: [compressed:1 byte=0][length:4 byte BE][protobuf payload]
//
// 端点形如 /exa.language_server_pb.LanguageServerService/<Method>

const http2 = require('http2');

const {
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_TE,
} = http2.constants;

function grpcFrame(payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = Buffer.alloc(5);
  header.writeUInt8(0, 0); // not compressed
  header.writeUInt32BE(buf.length, 1);
  return Buffer.concat([header, buf]);
}

// 反帧：找到第一个完整 payload 并返回。
function unframeSingle(buffer) {
  if (!buffer || buffer.length < 5) return null;
  const compressed = buffer.readUInt8(0);
  const len = buffer.readUInt32BE(1);
  if (buffer.length < 5 + len) return null;
  return { compressed, payload: buffer.slice(5, 5 + len), consumed: 5 + len };
}

// 单次 unary 调用。返回 Promise<Buffer>（已剥离 gRPC 帧）。
function grpcUnary({ address, csrfToken, path, body, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, val) => {
      if (settled) return;
      settled = true;
      try { req.close(); } catch {}
      try { session.close(); } catch {}
      if (err) reject(err);
      else resolve(val);
    };
    const url = address.startsWith('http') ? address : `http://${address}`;
    let session;
    try { session = http2.connect(url); }
    catch (e) { return reject(new Error('http2 connect failed: ' + e.message)); }
    session.on('error', (e) => done(new Error('h2 session error: ' + e.message)));
    const timer = setTimeout(() => done(new Error('grpc unary timeout')), timeout);

    const headers = {
      [HTTP2_HEADER_METHOD]: 'POST',
      [HTTP2_HEADER_PATH]: path,
      [HTTP2_HEADER_CONTENT_TYPE]: 'application/grpc',
      [HTTP2_HEADER_TE]: 'trailers',
      'user-agent': 'wf-switch-plus-grpc/1.0',
      'x-codeium-csrf-token': csrfToken || '',
      'grpc-accept-encoding': 'identity',
    };
    let req;
    try { req = session.request(headers); }
    catch (e) { clearTimeout(timer); return done(new Error('h2 request failed: ' + e.message)); }

    const chunks = [];
    let grpcStatus = null;
    let grpcMessage = '';

    req.on('response', (respHeaders) => {
      const ct = String(respHeaders[HTTP2_HEADER_CONTENT_TYPE] || '').toLowerCase();
      if (!ct.includes('application/grpc')) {
        done(new Error('unexpected content-type: ' + ct));
      }
    });
    req.on('trailers', (trailers) => {
      grpcStatus = Number(trailers['grpc-status'] == null ? 0 : trailers['grpc-status']);
      grpcMessage = String(trailers['grpc-message'] || '');
    });
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => {
      clearTimeout(timer);
      if (grpcStatus && grpcStatus !== 0) return done(new Error(`grpc status ${grpcStatus}: ${grpcMessage}`));
      const full = Buffer.concat(chunks);
      const frame = unframeSingle(full);
      if (!frame) return done(new Error('empty/short grpc frame (' + full.length + 'B)'));
      done(null, frame.payload);
    });
    req.on('error', (e) => {
      clearTimeout(timer);
      done(new Error('h2 stream error: ' + e.message));
    });

    req.end(grpcFrame(body));
  });
}

module.exports = { grpcFrame, unframeSingle, grpcUnary };
