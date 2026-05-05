const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const CONTINUE_DIR = path.join(os.homedir(), '.wf-account-mgr');
const CONTINUE_REQUEST_FILE = path.join(CONTINUE_DIR, 'continue-request.json');
const CONTINUE_ATTACHMENTS_DIR = path.join(CONTINUE_DIR, 'attachments');

function isEndConversationText(text) {
  return /(结束|没有|完成|退出|不用|就这样|不需要了)/.test(String(text || '').trim());
}

function imageMimeToExt(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('bmp')) return 'bmp';
  if (m.includes('svg')) return 'svg';
  return 'png';
}

async function savePastedImage(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('图片数据格式无效');
  const mime = m[1];
  const base64 = m[2];
  const ext = imageMimeToExt(mime);
  await fs.mkdir(CONTINUE_ATTACHMENTS_DIR, { recursive: true });
  const file = path.join(CONTINUE_ATTACHMENTS_DIR, `pasted-${Date.now()}.${ext}`);
  await fs.writeFile(file, Buffer.from(base64, 'base64'));
  return { type: 'image', mode: 'pasted', path: file, mime, base64, size: Buffer.byteLength(base64, 'base64') };
}

async function writeContinueRequest(payload) {
  await fs.mkdir(CONTINUE_DIR, { recursive: true });
  await fs.writeFile(CONTINUE_REQUEST_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  return CONTINUE_REQUEST_FILE;
}

function buildContinuePrompt(payload) {
  if (payload.action === 'end') return '结束对话';
  const lines = ['请继续执行以下任务：', '', payload.instruction || '继续'];
  if (Array.isArray(payload.attachments) && payload.attachments.length) {
    lines.push('', '附件：');
    for (const a of payload.attachments) {
      const extra = a.mode === 'base64' ? '（Base64 已写入 JSON）' : '';
      lines.push(`- [${a.type || 'file'}:${a.mode || 'path'}] ${a.path || a.name || 'inline'}${extra}`);
    }
  }
  lines.push('', `结构化请求已写入：${CONTINUE_REQUEST_FILE}`);
  return lines.join('\n');
}

module.exports = { isEndConversationText, savePastedImage, writeContinueRequest, buildContinuePrompt };

