# WF Switch Plus

WF Switch Plus 是 `wf-switch` 的伴生增强插件，保留原版插件独立安装，同时提供持续对话、附件上传、Token 统计、账号总览、自检和快捷控制台。

## 下载

- 最新版本：`0.3.2`
- VSIX：[`releases/wf-switch-plus-0.3.2.vsix`](releases/wf-switch-plus-0.3.2.vsix)
- 项目页面：<https://anjaymi.github.io/wf-switch-plus/>
- 说明文：[`docs/说明.md`](docs/%E8%AF%B4%E6%98%8E.md)

## 安装

1. 下载最新 `.vsix` 文件。
2. 在 Windsurf 或 VS Code 中打开扩展面板。
3. 选择 `Install from VSIX...`。
4. 安装后重载窗口。

也可以用命令安装：

```powershell
code --install-extension .\releases\wf-switch-plus-0.3.2.vsix
```

## 主要功能

- 持续对话弹窗：支持继续、结束、图片粘贴、附件选择和结构化请求。
- 本地 HTTP 触发：配合 `wf-switch-continue.ps1` 让 Cascade 回合结束时弹出继续确认。
- Token 统计：估算节约 Token、额度消耗和模型成本。
- 模型识别：从 Windsurf 状态文件读取当前模型，并支持手动覆盖。
- 账号总览：展示账号额度、导出 Token、按额度智能切号。
- 原版桥接：调用原版 `wf-switch` 的切号、激活、设置和刷新能力。

## 配置项

插件设置前缀为 `wfSwitchPlus`，常用配置包括：

- `wfSwitchPlus.autoReplyEnabled`
- `wfSwitchPlus.autoReplyText`
- `wfSwitchPlus.autoReplyDelaySec`
- `wfSwitchPlus.currentModelOverride`
- `wfSwitchPlus.autoQuotaSwitch`
- `wfSwitchPlus.autoQuotaThreshold`

## 源码结构

```text
extension.js
src/
  continueSupport.js
  continueDialogHtml.js
  continueAttachments.js
  continueRegistry.js
  tokenEstimator.js
  plusPanelHtml.js
  shared/
  state/
  domain/
releases/
  wf-switch-plus-0.3.2.vsix
docs/
  index.html
```

## 构建校验

当前版本已通过 JS 语法检查：

```powershell
node --check extension.js
Get-ChildItem src -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }
```

## GitHub Pages

仓库推送后，在 GitHub Pages 中选择：

- Source：`GitHub Actions`

页面会发布到：

<https://anjaymi.github.io/wf-switch-plus/>
