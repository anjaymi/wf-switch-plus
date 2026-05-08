const fs = require('fs');
const path = require('path');
const { BRIDGE_REQUEST_FILE, BRIDGE_REPLY_FILE } = require('../shared/paths');

const BRIDGE_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 200;

async function sendBridgeRequest(action, extra = {}) {
  const requestId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const payload = Object.assign({ action, requestId }, extra);
  await fs.promises.mkdir(path.dirname(BRIDGE_REQUEST_FILE), { recursive: true });
  await fs.promises.writeFile(BRIDGE_REQUEST_FILE, JSON.stringify(payload, null, 2), 'utf8');
  const start = Date.now();
  while (Date.now() - start < BRIDGE_TIMEOUT_MS) {
    try {
      if (fs.existsSync(BRIDGE_REPLY_FILE)) {
        const reply = JSON.parse(fs.readFileSync(BRIDGE_REPLY_FILE, 'utf8'));
        if (reply && reply.requestId === requestId) return reply;
        if (reply && !reply.requestId && reply.action === action && reply.at && reply.at >= start - 100) return reply;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { ok: false, action, requestId, error: '原版桥未应答（请确认伴生桥已注入并重载窗口）' };
}

module.exports = { sendBridgeRequest };
