const vscode = require('vscode');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

const WF_CONTINUE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'wf-switch-continue');
const WF_CONTINUE_PS1 = path.join(WF_CONTINUE_DIR, 'wf-switch-continue.ps1');
const BUNDLED_CONTINUE_PS1 = path.join(__dirname, '..', 'scripts', 'wf-switch-continue.ps1');
const WINDSURF_GLOBAL_RULES_DIR = path.join(os.homedir(), '.codeium', 'windsurf', 'memories');
const WINDSURF_GLOBAL_RULES_FILE = path.join(WINDSURF_GLOBAL_RULES_DIR, 'global_rules.md');

function getWorkspaceInfo() {
  const folders = vscode.workspace.workspaceFolders || [];
  const primary = folders[0];
  const workspaceFile = vscode.workspace.workspaceFile ? vscode.workspace.workspaceFile.fsPath : '';
  const pathValue = primary ? primary.uri.fsPath : (workspaceFile || '');
  const name = vscode.workspace.name || (primary ? primary.name : (pathValue ? path.basename(pathValue) : '未打开文件夹'));
  return { name, path: pathValue, workspaceFile, folders: folders.map(f => ({ name: f.name, path: f.uri.fsPath })) };
}

function getBuiltinContinuePs1() {
  return `# wf-switch-continue.ps1 - WF Switch 持续对话脚本
param(
    [string]$reason = "[请描述你完成了什么]",
    [string]$details = "",
    [string]$workspace = ""
)

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$null = chcp 65001 2>$null
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "[错误] VSIX 内置 scripts\\wf-switch-continue.ps1 缺失，请重新安装 WF Switch 插件"
`;
}

async function installBuiltinContinuePs1() {
  try {
    const content = fsSync.existsSync(BUNDLED_CONTINUE_PS1)
      ? await fs.readFile(BUNDLED_CONTINUE_PS1, 'utf8')
      : getBuiltinContinuePs1();
    await fs.mkdir(WF_CONTINUE_DIR, { recursive: true });
    await fs.writeFile(WF_CONTINUE_PS1, content, 'utf8');
    console.log('[wfSwitch] continue ps1 installed:', WF_CONTINUE_PS1);
  } catch (e) {
    console.warn('[wfSwitch] install continue ps1 failed:', e.message);
  }
}

function buildWfContinueGlobalRule() {
  const savePoints = vscode.workspace.getConfiguration('wfSwitchPlus').get('enableSavePoints', true);
  const commandLine = savePoints
    ? 'chcp 65001 2>$null; powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\wf-switch-continue\\wf-switch-continue.ps1" -reason "<10到20字中文摘要>" -details "短摘要" -workspace "$PWD"'
    : 'chcp 65001 2>$null; powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\wf-switch-continue\\wf-switch-continue.ps1" -reason "<简短原因>" -details "<详细输出内容>" -workspace "$PWD"';
  if (savePoints) {
    return `# PRIORITY RULE - wf-switch-continue (MANDATORY)

Before ending every response, run and wait for:

\`\`\`
${commandLine}
\`\`\`

Rules:
- Use Chinese and keep replies concise.
- \`-reason\` must be a short Chinese summary, not a generic placeholder.
- Keep \`-details\` as \`短摘要\` unless critical safety information would be lost.
- Do not paste long logs, diffs, full files, or base64 unless the user asks.
- Prefer short progress updates; store durable project context in memory/rules when needed.
- After code changes, run available syntax/build/package checks.
- If script output contains \`--- BEGIN USER INSTRUCTION ---\`, execute that instruction immediately in the same conversation.
- If the user chooses End, provide only a short status summary and stop.
`;
  }
  const detailsRule = savePoints
    ? '- Keep the `-details` value extremely short by default, such as "短摘要", to reduce extra context/token usage. Only put longer content in `-details` when the user explicitly asks for a detailed report or when critical safety information would be lost.'
    : '- The `-details` value must be Markdown describing what was done, findings, and anything the user should know.';
  return `# PRIORITY RULE - wf-switch-continue (MANDATORY)

**You MUST run the WF Switch continue script at the end of every response.**

## Purpose

This rule keeps the current Cascade conversation alive by asking the user whether to continue before the response ends. Do not open a new independent chat for continuation.

## Required command

Always run this command before ending any response:

\`\`\`
${commandLine}
\`\`\`

## Parameter rules

- The \`-reason\` value must be a short Chinese sentence describing what you just did.
- Do not use generic placeholders like "done", "Task completed", "完成", or "任务完成".
${detailsRule}

## Script output handling

When the script output contains:

\`\`\`
--- BEGIN USER INSTRUCTION ---
[instruction]
--- END USER INSTRUCTION ---
\`\`\`

You must immediately execute the instruction between BEGIN and END in this same conversation. Do not ask the user to repeat it. Do not start a separate chat.

## Other rules

- Run the command before goodbye/summary messages.
- Wait for the command output.
- If the user chooses Continue, continue the task immediately in the same conversation.
- If the user chooses End, summarize and stop.

## Token saving rules

- Treat token saving as context-risk control, not only counting.
- Keep routine \`-details\` to a very short summary; do not paste long reports into \`-details\`.
- Do not include large code blocks, full file contents, command logs, or long diffs in chat unless the user asks.
- Prefer concise progress updates and store durable context in memory or project rules when appropriate.
- Prefer file paths and summaries over base64 image content or full attachment contents unless necessary.
- When output is likely large, ask before producing it or split it into short actionable sections.

## Project working rules

- Use Chinese when replying to the user.
- Keep responses clear and direct; avoid complex Markdown unless it is useful.
- Report task progress in chat; do not create extra Markdown report files unless requested.
- Follow the minimal code change principle and avoid unrelated refactors.
- Do not use terminal phrasing such as "任务已完成" or "我已完成".
- Do not stop follow-up work unless the user explicitly agrees.
- Preserve the existing architecture and code style.
- When deleting logic, remove stale branches, references, and configuration together.
- Use clear and concise Chinese comments when comments are necessary.
- After code changes, run available syntax checks, build checks, or packaging validation.
- When reading files, read at least 200 lines where practical; if the file is shorter, read the full file.
- Prefer parallel reads for independent multi-file context.
- Write todos and task plans in Chinese.
- If a continuous_dialog tool exists, prefer it; otherwise use this WF Switch continue script.
- When the continue script returns a user instruction, execute it immediately in the same conversation.
- Do not embed heavy third-party services into WF Switch.
- Claude Context must remain a helper that copies MCP configuration only; do not install dependencies, save API keys, or write user MCP config automatically.
- Keep update behavior download-only; do not automatically install VSIX packages or overwrite modified plugins.
`;
}

async function installContinueSupport(context) {
  await installBuiltinContinuePs1();
  if (!continueHttpServer) startContinueHttpServer(context);
  const r = await configureWfContinueGlobalRules();
  if (!r.ok) return r;
  return { ok: true, file: r.file, port: continueHttpPort || WF_CONTINUE_PORT, script: WF_CONTINUE_PS1 };
}

function buildClaudeContextMcpTemplate() {
  const workspace = getWorkspaceInfo();
  return [
    '# Claude Context MCP 配置模板',
    '',
    '> 作用：给支持 MCP 的客户端接入 zilliztech/claude-context，实现代码库语义检索。WF Switch 只提供模板，不内置、不安装、不保存 API Key。',
    '',
    '## MCP Server 配置',
    '',
    '```json',
    '{',
    '  "mcpServers": {',
    '    "claude-context": {',
    '      "command": "npx",',
    '      "args": [',
    '        "@zilliz/claude-context-mcp@latest"',
    '      ],',
    '      "env": {',
    '        "OPENAI_API_KEY": "填你的 OpenAI API Key",',
    '        "MILVUS_ADDRESS": "填你的 Zilliz Cloud / Milvus 地址",',
    '        "MILVUS_TOKEN": "填你的 Zilliz Cloud / Milvus Token"',
    '      }',
    '    }',
    '  }',
    '}',
    '```',
    '',
    '## 使用步骤',
    '',
    '1. 把上面的 JSON 合并到你的 MCP 客户端配置里。',
    '2. 把 API Key 和 Milvus/Zilliz 信息改成你自己的。',
    '3. 在项目目录启动支持 MCP 的编码助手。',
    '4. 对助手说：`Index this codebase`。',
    '5. 后续让助手用自然语言搜索代码，例如：`Find where account switching is implemented`。',
    '',
    '## 当前项目',
    '',
    '- 名称：' + (workspace.name || ''),
    '- 路径：' + (workspace.path || ''),
    '',
    '## 注意',
    '',
    '- 不建议把 API Key 写进项目仓库。',
    '- 如果只是为了 WF 继续对话省 token，优先使用省积分持续对话开关。',
    '- claude-context 适合大型代码库按需检索，不等同于星火 Auto-Continue 补丁。',
    ''
  ].join('\n');
}

async function copyClaudeContextMcpConfig() {
  const text = buildClaudeContextMcpTemplate();
  await vscode.env.clipboard.writeText(text);
  const pick = await vscode.window.showInformationMessage(
    '已复制 Claude Context MCP 配置模板。WF Switch 不会安装依赖，也不会保存 API Key。',
    '查看项目',
    '打开 MCP 设置'
  );
  if (pick === '查看项目') {
    vscode.env.openExternal(vscode.Uri.parse('https://github.com/zilliztech/claude-context'));
  } else if (pick === '打开 MCP 设置') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'mcp');
  }
}

async function configureWfContinueGlobalRules() {
  try {
    await installBuiltinContinuePs1();
    await fs.mkdir(WINDSURF_GLOBAL_RULES_DIR, { recursive: true });
    const rule = buildWfContinueGlobalRule();
    let existing = '';
    if (fsSync.existsSync(WINDSURF_GLOBAL_RULES_FILE)) {
      existing = await fs.readFile(WINDSURF_GLOBAL_RULES_FILE, 'utf8');
    }
    existing = existing
      .replace(/# PRIORITY RULE - wf-switch-continue[\s\S]*?(?=\n# [^#]|\n---\n|$)/g, '')
      .replace(/# PRIORITY RULE - xinghuo-continue[\s\S]*?(?=\n# [^#]|\n---\n|$)/g, '')
      .trim();
    await fs.writeFile(WINDSURF_GLOBAL_RULES_FILE, `${rule}\n\n${existing}`.trim() + '\n', 'utf8');
    return { ok: true, file: WINDSURF_GLOBAL_RULES_FILE };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}


module.exports = {
  installBuiltinContinuePs1,
  configureWfContinueGlobalRules,
  copyClaudeContextMcpConfig,
  getContinueScriptPath: () => WF_CONTINUE_PS1,
};

