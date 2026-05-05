const vscode = require('vscode');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const WF_CONTINUE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'wf-switch-continue');
const WF_PORT_FILE = path.join(WF_CONTINUE_DIR, '.wf_switch_continue_port');
const WF_WINDOWS_FILE = path.join(WF_CONTINUE_DIR, 'windows.json');

function getWorkspaceInfo() {
  const folders = vscode.workspace.workspaceFolders || [];
  const primary = folders[0];
  const workspaceFile = vscode.workspace.workspaceFile ? vscode.workspace.workspaceFile.fsPath : '';
  const pathValue = primary ? primary.uri.fsPath : (workspaceFile || '');
  const name = vscode.workspace.name || (primary ? primary.name : (pathValue ? path.basename(pathValue) : '未打开文件夹'));
  return {
    name,
    path: pathValue,
    workspaceFile,
    folders: folders.map(f => ({ name: f.name, path: f.uri.fsPath })),
  };
}

function buildWindowId(instanceId) {
  const info = getWorkspaceInfo();
  return crypto.createHash('sha1').update(`44192|${info.path}|${info.workspaceFile}|${instanceId}`).digest('hex').slice(0, 12);
}

async function readContinueWindows() {
  try {
    if (!fsSync.existsSync(WF_WINDOWS_FILE)) return [];
    const data = JSON.parse(await fs.readFile(WF_WINDOWS_FILE, 'utf8'));
    return Array.isArray(data.windows) ? data.windows : [];
  } catch {
    return [];
  }
}

async function writeContinueWindows(windows) {
  await fs.mkdir(WF_CONTINUE_DIR, { recursive: true });
  await fs.writeFile(WF_WINDOWS_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), windows }, null, 2), 'utf8');
}

async function registerContinueWindow(port, instanceId) {
  const info = getWorkspaceInfo();
  const id = buildWindowId(instanceId);
  const now = Date.now();
  const windows = (await readContinueWindows())
    .filter(w => w && w.id !== id && now - Number(w.updatedAtMs || 0) < 120000);
  windows.push({
    id, port, pid: process.pid, instanceId, workspaceName: info.name,
    workspacePath: info.path, workspaceFile: info.workspaceFile, folders: info.folders,
    updatedAtMs: now, updatedAt: new Date(now).toISOString(),
  });
  await writeContinueWindows(windows);
  await fs.writeFile(WF_PORT_FILE, String(port), 'utf8');
}

async function unregisterContinueWindow(instanceId) {
  try {
    const id = buildWindowId(instanceId);
    const windows = (await readContinueWindows()).filter(w => w && w.id !== id);
    await writeContinueWindows(windows);
  } catch {}
}

async function ensureWfContinuePortFile(port) {
  try {
    await fs.mkdir(WF_CONTINUE_DIR, { recursive: true });
    await fs.writeFile(WF_PORT_FILE, String(port), 'utf8');
  } catch (e) {
    console.warn('[wfSwitch] write continue port file failed:', e.message);
  }
}

module.exports = { getWorkspaceInfo, registerContinueWindow, unregisterContinueWindow, ensureWfContinuePortFile };

