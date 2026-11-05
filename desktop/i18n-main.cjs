// @ts-check
// Main-process text (T14.4, D21 ④): notifications, the tray and application menus, native dialogs, the tray tooltip
// and the Claude Code status line follow the same interface language as the windows (setting `language`, or the
// system's preferred language for "system": any Chinese locale reads Chinese, everything else English). Errors and
// confirmation messages sent to the windows stay Chinese here and are translated there (src/i18n-en.js).

/** @type {Record<string, string>} */
const EN = {
  'Token 用量助手': 'Token Usage Assistant',
  用量悬浮窗: 'Usage widget',
  // Tray menu
  '发现新版本 {version}，查看…': 'New version {version}, view…',
  打开用量总览: 'Open overview',
  显示悬浮窗: 'Show widget',
  刷新用量: 'Refresh usage',
  开机启动: 'Launch at login',
  退出助手: 'Quit',
  未连接: 'Not connected',
  // macOS application menu
  '关于 Token 用量助手': 'About Token Usage Assistant',
  隐藏助手: 'Hide',
  隐藏其他应用: 'Hide others',
  显示全部: 'Show all',
  编辑: 'Edit',
  窗口: 'Window',
  // Tray tooltip (macOS lines and the Windows account list)
  '{currency} 余额 {amount}': '{currency} balance {amount}',
  余额金额暂未返回: 'Balance not returned yet',
  '月度剩余 {amount}': 'Monthly left {amount}',
  '5 小时 {five} · 每周 {week}': '5 hours {five} · weekly {week}',
  不限: 'Unlimited',
  未启用: 'Not started',
  未连接账户: 'No account connected',
  '（上次）': ' (last)',
  '另 {n} 个账户': '{n} more accounts',
  '最紧 ': 'tightest ',
  // Notifications
  '{currency} 余额偏低': '{currency} balance low',
  '余额 {balance}，低于 {threshold} 提醒金额。': 'Balance {balance}, below the {threshold} reminder.',
  月度套餐额度: 'Monthly credits',
  '5 小时额度': '5-hour quota',
  每周额度: 'Weekly quota',
  '仍有购买额度，可在面板查看。': 'Purchased credits remain; see the panel.',
  '仍有免费余额。': 'Free credits remain.',
  '请打开面板查看余额与账期。': 'Open the panel for balances and the billing period.',
  '可打开助手查看重置时间。': 'Open the assistant for the reset time.',
  '{name}已用尽': '{name} used up',
  '{name}偏低': '{name} low',
  '剩余 {left}，低于 {threshold}% 提醒阈值。': '{left} left, below the {threshold}% alert threshold.',
  '提醒已就绪：剩余额度低于 {threshold}% 时通知你。': "Alerts are ready: you'll be notified below {threshold}%.",
  // Dialogs
  接入: 'Connect',
  取消: 'Cancel',
  '把助手的状态栏组件写进 Claude Code 设置？': "Write the assistant's status-line helper into Claude Code settings?",
  '将修改 {file} 里的 statusLine 一项，其他设置不变；修改前先把原文件备份到助手的数据目录，随时可以在这里还原。':
    'Only the statusLine entry of {file} changes; everything else stays. The file is backed up to the assistant’s data folder first and can be restored here any time.',
  '你原来的状态栏命令会继续运行，显示在助手内容的前面。':
    'Your own status-line command keeps running and is shown first.',
  '之后任何方式打开的 Claude Code 会话都会把套餐额度交给助手（只在本机，不联网）；逐请求的 Token 明细仍需用启动脚本打开。':
    'Every Claude Code session then hands its plan quota to the assistant (on this computer only, no network); per-request token details still need the launcher or the session-log source.',
  '选择 Zcode 用量数据库': 'Choose the Zcode usage database',
  'SQLite 数据库': 'SQLite database',
  '选择 Codex 配置目录': 'Choose the Codex folder',
  '选择官方 Codex.app': 'Choose the official Codex.app',
  '选择官方 Codex 的 codex.exe': "Choose the official Codex's codex.exe",
  'Codex 程序': 'Codex program',
  保存诊断信息: 'Save diagnostics',
  导出用量明细: 'Export usage records',
};

let english = false;

/**
 * @param {unknown} setting 'system' | 'zh' | 'en'
 * @param {unknown} system the system's preferred language
 */
function setMainLanguage(setting, system) {
  english = setting === 'en' || (setting !== 'zh' && typeof system === 'string' && !!system && !/^zh\b/i.test(system));
}

/**
 * @param {string} text the Chinese source, with {name} placeholders
 * @param {Record<string, unknown>} [vars]
 */
function tm(text, vars) {
  const base = english && Object.hasOwn(EN, text) ? EN[text] : text;
  return vars ? base.replace(/\{(\w+)\}/g, (all, key) => (Object.hasOwn(vars, key) ? String(vars[key]) : all)) : base;
}

module.exports = { tm, setMainLanguage, isEnglish: () => english, EN };
