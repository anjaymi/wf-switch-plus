// 集中所有 webview ↔ 扩展 之间的 message.type 常量。
// 命名约定：常量值 = 字符串本身（保持向后兼容），按面板分组。
// 任何新消息必须先在这里登记再使用。

const ACCOUNTS = Object.freeze({
  // webview -> extension
  REFRESH: 'refresh',
  FOCUS_ORIGINAL_PANEL: 'focusOriginalPanel',
  COPY_EMAIL: 'copyEmail',
  RESET_BASELINE: 'resetBaseline',
  RESET_ALL: 'resetAll',
  IMPORT_CLIPBOARD: 'importClipboard',
  REFRESH_VIA_BRIDGE: 'refreshViaBridge',
  SWITCH_TO: 'switchTo',
  VIEW_TOKEN: 'viewToken',
  COPY_TOKEN: 'copyToken',
  EXPORT_TOKENS: 'exportTokens',
  TOAST: 'toast',
  SMART_SWITCH: 'smartSwitch',
  // extension -> webview
  SHOW_TOKEN: 'showToken',
});

const TOKEN_DETAIL = Object.freeze({
  REQUEST_REFRESH: 'requestRefresh',
  SET_MANUAL_MODEL: 'setManualModel',
  CLEAR_STATS: 'clearStats',
  RESET_ALL_BASELINES: 'resetAllBaselines',
  RESET_CURRENT_BASELINE: 'resetCurrentBaseline',
  REFRESH_ALL: 'refreshAll',
  REFRESH_CURRENT: 'refreshCurrent',
  IMPORT_CLIPBOARD: 'importClipboard',
  // extension -> webview
  TOKEN_LIVE_UPDATE: 'tokenLiveUpdate',
});

const PLUS_PANEL = Object.freeze({
  // webview -> extension
  REQUEST_REFRESH: 'requestRefresh',
  REQUEST_SPARK: 'requestSpark',
  SAVE_PHRASE: 'savePhrase',
  SET_CONFIG: 'setConfig',
  // extension -> webview
  PLUS_LIVE_UPDATE: 'plusLiveUpdate',
  SPARK_UPDATE: 'sparkUpdate',
});

const CONTINUE_DIALOG = Object.freeze({
  // webview -> extension
  READY: 'ready',
  PICK_FILES: 'pickFiles',
  PASTED_IMAGE: 'pastedImage',
  SUBMIT_CONTINUE: 'submitContinue',
  // extension -> webview
  STATUS: 'status',
  PICKED_FILES: 'pickedFiles',
  PASTED_IMAGE_SAVED: 'pastedImageSaved',
});

module.exports = {
  ACCOUNTS,
  TOKEN_DETAIL,
  PLUS_PANEL,
  CONTINUE_DIALOG,
};
