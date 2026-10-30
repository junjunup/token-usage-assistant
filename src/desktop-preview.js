import { version } from '../package.json';
import { demoAnalytics, demoPrices } from './preview-analytics.js';
import { demoTools } from './tools-preview.js';
import { fixtureBody } from './generated/provider-fixture.js';
import {
  normalizeGlm,
  normalizeMiniMax,
  normalizeVolcengine,
  normalizeOpenCodeGo,
  normalizeOpenRouter,
  quota,
} from './generated/provider-domain.js';
import { normalizeDeepSeek, normalizeKimi } from './generated/balance-domain.js';
import { PROVIDERS } from './generated/provider-catalog.js';
import { panelState } from './generated/menubar-panel.js';
import { accountOverview } from './generated/account-overview.js';
const now = Date.now();
let state = {
  version: '1.2.0',
  analyticsRevision: 0,
  hasCredential: true,
  credentialIssue: '',
  connecting: false,
  packaged: false,
  // ?platform=win32 previews the Windows-only parts (T11.2 tray settings and the pin note).
  platform: new URLSearchParams(location.search).get('platform') === 'win32' ? 'win32' : 'preview',
  settings: {
    // ?theme=dark opens the preview (including ?surface=widget) in the dark theme, like the panel preview.
    theme: new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light',
    refreshSeconds: 60,
    threshold: 20,
    notifications: true,
    floating: false,
    pinned: true,
    launchAtLogin: false,
    widgetExpanded: false,
  },
  data: {
    parts: {
      identity: { label: '演示账户', scope: 'personal' },
      credits: {
        five: { used: 32, cap: 100, remainingPercent: 68, usedPercent: 32, resetAt: now + 8314000 },
        week: { used: 58, cap: 100, remainingPercent: 42, usedPercent: 58, resetAt: now + 223200000 },
        monthly: 175.4,
        purchased: 0,
        free: 0,
      },
      summary: {
        input: 10200000,
        output: 2600000,
        total: 12800000,
        requests: 284,
        cost: 24.6,
        successRate: 98.2,
        funding: { monthly: 24.6, purchased: 0, free: 0 },
        scope: 'billing',
        periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
        periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime(),
      },
      subscription: {
        active: true,
        planId: '演示套餐',
        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime(),
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
      },
    },
    errors: [],
    updatedAt: { credits: now, summary: now },
    fetching: false,
    status: 'connected',
    nextRefreshAt: now + 60000,
  },
};
if (new URLSearchParams(location.search).get('desktop-preview') === 'empty')
  state = {
    ...state,
    hasCredential: false,
    data: { ...state.data, parts: {}, updatedAt: {}, status: 'unconfigured', nextRefreshAt: null },
  };
const scenario = new URLSearchParams(location.search).get('scenario');
if (scenario === 'monthly-empty') {
  state.data.parts.credits.monthly = 0;
  state.data.parts.credits.five = {
    ...state.data.parts.credits.five,
    used: 0,
    usedPercent: 0,
    remainingPercent: 100,
    resetAt: null,
    resetState: 'idle',
  };
  state.data.parts.summary.funding = { monthly: 200, purchased: 0, free: 0 };
}
// T9.3: an idle window (resetAt=0) that already reports usage, and a nearly used-up weekly window.
if (scenario === 'idle-used') {
  state.data.parts.credits.five = {
    ...state.data.parts.credits.five,
    used: 3,
    usedPercent: 3,
    remainingPercent: 97,
    resetAt: null,
    resetState: 'idle',
  };
  state.data.parts.credits.week = {
    ...state.data.parts.credits.week,
    used: 99.6,
    usedPercent: 99.6,
    remainingPercent: 0.4,
  };
}
if (scenario === 'reset-missing')
  state.data.parts.credits.five = { ...state.data.parts.credits.five, resetAt: null, resetState: 'unknown' };
const snapshots = { commandcode: structuredClone(state.data) };
for (const [provider, normalize] of Object.entries({
  glm: normalizeGlm,
  minimax: normalizeMiniMax,
  volcengine: normalizeVolcengine,
  // OpenCode Go (beta.5) was missing here, so selecting its preview account blanked the page.
  'opencode-go': normalizeOpenCodeGo,
  // T10.2: an OpenRouter key with a monthly limit and one member budget (official example shape).
  openrouter: normalizeOpenRouter,
})) {
  snapshots[provider] = {
    parts: { credits: normalize(fixtureBody(provider, now), now) },
    errors: [],
    updatedAt: { credits: now },
    fetching: false,
    status: 'connected',
    nextRefreshAt: now + 60000,
  };
}
for (const provider of ['codex', 'claude'])
  snapshots[provider] = {
    parts: {
      credits: {
        windows: [
          quota({
            id: provider + ':five',
            label: '5 小时窗口',
            group: provider === 'codex' ? 'Codex' : 'Claude Code',
            remainingPercent: 77,
            resetAt: now + 7200000,
          }),
          quota({
            id: provider + ':week',
            label: '每周窗口',
            group: provider === 'codex' ? 'Codex' : 'Claude Code',
            remainingPercent: 58,
            resetAt: now + 250000000,
          }),
        ],
        planName: provider === 'codex' ? 'ChatGPT Pro' : 'Claude 本机订阅观察',
        note: '浏览器示例数据；额度与本机工具明细分别展示。',
      },
    },
    errors: [],
    updatedAt: { credits: now },
    fetching: false,
    status: provider === 'claude' ? 'stale' : 'connected',
    nextRefreshAt: now + 60000,
  };
snapshots.deepseek = {
  parts: { balance: normalizeDeepSeek(fixtureBody('deepseek')) },
  errors: [],
  updatedAt: { balance: now },
  fetching: false,
  status: 'connected',
  nextRefreshAt: now + 60000,
};
// T10.1: Kimi open platform, China site (CNY), from the official sample response.
snapshots.kimi = {
  parts: { balance: normalizeKimi(fixtureBody('kimi'), 'CNY') },
  errors: [],
  updatedAt: { balance: now },
  fetching: false,
  status: 'connected',
  nextRefreshAt: now + 60000,
};
state.version = version;
// T7.10: ?desktop-preview=panel-unsynced shows the Claude account as connected but never synced.
if (new URLSearchParams(location.search).get('desktop-preview') === 'panel-unsynced' && snapshots.claude) {
  snapshots.claude.parts = {};
  snapshots.claude.updatedAt = {};
}
if (new URLSearchParams(location.search).get('platform') === 'darwin') state.platform = 'darwin';
state.associations = { groups: [], rules: [], issue: '' };
// T6.2: ?desktop-preview=coverage shows the coverage report with one grouped account and gaps.
const coveragePreview = new URLSearchParams(location.search).get('desktop-preview') === 'coverage';
if (coveragePreview)
  state.associations = {
    issue: '',
    groups: [
      {
        id: 'preview-group',
        label: 'Command Code · 示例账户',
        valid: true,
        message: '',
        memberIds: ['commandcode'],
        primaryId: 'commandcode',
        period: null,
      },
    ],
    rules: [
      {
        id: 'preview-rule-zcode',
        groupId: 'preview-group',
        sourceId: 'preview-zcode',
        provider: '',
        model: '',
        from: now - 6 * 3600000,
        to: null,
        valid: true,
      },
      {
        id: 'preview-rule-harness',
        groupId: 'preview-group',
        sourceId: 'preview-harness',
        provider: 'deepseek',
        model: '',
        from: now - 3 * 3600000,
        to: null,
        valid: false,
        message: '来源文件已替换，需要重新确认',
      },
    ],
  };
function coverageDemo(query) {
  const start = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
  return {
    source: 'reconciliation',
    available: false,
    difference: null,
    errorRate: null,
    range: { id: query.range, start, end: now },
    reasons: [
      '部分关联需要重新确认，相关记录不会归入账户。',
      '平台汇总与工具记录的起止时间未严格对齐，当前汇总仅供参考。',
      '平台汇总的请求统计口径与本机已报告用量口径尚未确认一致。',
      '本机采集不能证明覆盖该账户在所有设备和工具上的完整用量。',
      '工具记录为空或部分记录缺少用量，缺失值不能计为零。',
      '工具费用来自本机单价估算，不作为平台实际账单核对。',
    ],
    platform: {
      connectionLabel: 'Command Code · 示例',
      memberCount: 1,
      status: 'connected',
      updatedAt: now,
      kind: 'summary',
      summary: { total: 12800000, cost: 24.6, period: { start: start - 86400000 * 3, end: now } },
    },
    tools: {
      updatedAt: now,
      summary: { knownTokens: 3420000, missingTokenRequests: 3, costsByCurrency: { USD: { knownCost: 6.82 } } },
      association: { linkedRecords: 184, unlinkedRecords: 41, ambiguousRecords: 0, invalidRecords: 12 },
      sourceReports: [
        {
          id: 'preview-zcode',
          label: 'Zcode · 示例',
          status: 'ready',
          missingUsage: 3,
          associationCoverage: { start: now - 5.6 * 3600000, end: now - 120000 },
        },
        {
          id: 'preview-codex',
          label: 'Codex · 示例',
          status: 'ready',
          missingUsage: 0,
          contract: 'partial',
          missing: ['推理 Token'],
          associationCoverage: { start: now - 4 * 3600000, end: now - 300000 },
        },
        {
          id: 'preview-harness',
          label: 'Harness · 示例',
          status: 'stale',
          missingUsage: 0,
          partialLine: true,
          associationCoverage: { start: null, end: null },
        },
      ],
    },
    association: { linkedRecords: 184, unlinkedRecords: 41, ambiguousRecords: 0, invalidRecords: 12 },
    rules: state.associations.rules,
  };
}
state.toolSources =
  new URLSearchParams(location.search).get('desktop-preview') === 'empty'
    ? []
    : [
        {
          id: 'preview-zcode',
          kind: 'zcode',
          label: 'Zcode · 示例',
          file: 'D:/Demo/Zcode/db.sqlite',
          enabled: true,
          status: 'ready',
          lastSuccessAt: now,
        },
        {
          id: 'preview-harness',
          kind: 'harness',
          label: 'Harness · 示例',
          file: 'D:/Demo/Harness/usage.jsonl',
          enabled: true,
          status: 'ready',
          lastSuccessAt: now,
          harnessVersion: '0.1.7-rc.1',
        },
      ];
state.accounts = state.hasCredential
  ? PROVIDERS.map((p) => ({
      id: p.id,
      provider: p.id,
      region: p.regions[0].id,
      label: p.name + ' · 示例',
      status: 'connected',
    }))
  : [];
state.activeAccountId = state.hasCredential ? 'commandcode' : '';
state.provider = 'commandcode';
state.region = 'global';
function selectPreview(id) {
  const entry = state.accounts.find((a) => a.id === id);
  if (!entry) return;
  state.activeAccountId = id;
  state.provider = entry.provider;
  state.capabilities = PROVIDERS.find((p) => p.id === entry.provider)?.capabilities;
  state.region = entry.region;
  state.data = snapshots[id];
  state.analyticsRevision++;
}
const selectedProvider = new URLSearchParams(location.search).get('provider');
if (selectedProvider) selectPreview(selectedProvider);
if (selectedProvider && scenario === 'offline') {
  state.data.status = 'offline';
  state.data.errors = [{ endpoint: 'credits', status: 503, message: '平台暂时不可用，当前显示上次数据。' }];
}
// T8.5: ?provider=claude&desktop-preview=claude-port-changed shows the local connection status after the collector
// moved to another port (same texts as desktop/subscription-status.cjs; the preview does not run the collector).
if (
  selectedProvider === 'claude' &&
  new URLSearchParams(location.search).get('desktop-preview') === 'claude-port-changed'
)
  state.connectionStatus = {
    quota: { status: 'stale', label: '最近额度 · 等待更新', message: '当前是上次观察值，尚未确认实时额度。' },
    details: {
      status: 'waiting',
      label: '采集端口已更换 · 需重开会话',
      message:
        '原端口 49835 不可用，已改用 52001。套餐额度会自动恢复；工具明细需要关闭正在运行的 Claude Code，再用生成的 Start-Claude.command 重新打开。',
    },
  };
if (selectedProvider === 'deepseek' && scenario === 'unknown') state.data.parts.balance.balances[0].granted = null;
// T10.1: ?provider=kimi&scenario=arrears (negative cash: available equals the voucher) / scenario=exhausted.
if (selectedProvider === 'kimi' && ['arrears', 'exhausted', 'unknown'].includes(scenario))
  state.data.parts.balance = normalizeKimi(
    {
      code: 0,
      data:
        scenario === 'arrears'
          ? { available_balance: 12.5, voucher_balance: 12.5, cash_balance: -3.2 }
          : scenario === 'exhausted'
            ? { available_balance: 0, voucher_balance: 0, cash_balance: -1.08 }
            : { available_balance: 49.58894 },
    },
    'CNY',
  );
const balanceProvider = ['deepseek', 'kimi'].includes(selectedProvider);
// T10.2: ?provider=openrouter&scenario=unlimited — a key without a spend limit and without budgets.
if (selectedProvider === 'openrouter' && scenario === 'unlimited') {
  const body = fixtureBody('openrouter', now);
  state.data.parts.credits = normalizeOpenRouter({
    data: { ...body.data, limit: null, limit_remaining: null, limit_reset: null, budgets: [] },
  });
}
if (selectedProvider && !balanceProvider && scenario === 'unknown')
  state.data.parts.credits.windows.forEach((w) => {
    w.used = null;
    w.cap = null;
    w.remainingPercent = null;
    w.usedPercent = null;
    w.resetAt = null;
    w.resetState = 'unknown';
    w.unlimited = false;
  });
if (selectedProvider === 'deepseek' && scenario === 'exhausted')
  state.data.parts.balance = normalizeDeepSeek({
    is_available: false,
    balance_infos: [{ currency: 'CNY', total_balance: '0', granted_balance: '0', topped_up_balance: '0' }],
  });
if (selectedProvider && !balanceProvider && scenario === 'exhausted') {
  const w = state.data.parts.credits.windows[0];
  w.remainingPercent = 0;
  w.usedPercent = 100;
  w.exceeded = true;
}
const listeners = new Set(),
  ok = (value) => ({ ok: true, value: structuredClone(value) }),
  publish = () => {
    for (const cb of listeners) cb(structuredClone(snapshot()));
  };
// The state main.cjs would send, with the all-accounts list derived from the preview snapshots (T11.1).
function snapshot() {
  return { ...state, overview: accountOverview(previewSummaries(), state.settings) };
}
const associationPreview = async () => ({ ok: false, error: '请在 Windows 应用中管理真实账户关联。' });
// Preview of a failed account-list load (?desktop-preview=credential-issue): re-read succeeds after a moment.
const credentialIssuePreview = new URLSearchParams(location.search).get('desktop-preview') === 'credential-issue';
if (credentialIssuePreview)
  state = {
    ...state,
    hasCredential: false,
    credentialIssue: '本机账户列表暂不可用，已有加密文件未被覆盖。请恢复备份后重启助手。',
    accounts: [],
    activeAccountId: '',
    data: { ...state.data, parts: {}, updatedAt: {}, errors: [], status: 'unconfigured', nextRefreshAt: null },
  };
// Preview of an available update (?desktop-preview=update-available, T5.2).
state.settings = { ...state.settings, updateCheck: true };
// T7.7 menu-bar settings (defaults) and ?desktop-preview=menubar-hidden for the "hidden by the system" notice.
state.settings = {
  ...state.settings,
  menubarForm: 'value',
  menubarUsage: true,
  menubarAlertColor: true,
  panelProtect: true,
};
state.menubar = { hidden: new URLSearchParams(location.search).get('desktop-preview') === 'menubar-hidden' };
if (new URLSearchParams(location.search).get('desktop-preview') === 'update-available')
  state.update = { status: 'available', version: '1.8.0-beta.8', checkedAt: now };
// T9.13 (D15) preview (?desktop-preview=contract-states): a Codex source missing an optional counter (partial) and a
// Claude source with incompatible events, next to the normal sources.
if (new URLSearchParams(location.search).get('desktop-preview') === 'contract-states')
  state.toolSources = [
    ...state.toolSources,
    {
      id: 'preview-codex',
      kind: 'codex',
      label: 'Codex · 示例',
      file: '/Users/demo/.codex',
      enabled: true,
      status: 'ready',
      lastSuccessAt: now,
      contract: 'partial',
      missing: ['缓存读取'],
      fields: [
        'cache_read_input_tokens',
        'cache_write_input_tokens',
        'input_tokens',
        'output_tokens',
        'reasoning_output_tokens',
        'total_tokens',
      ],
      fieldChange: { added: ['cache_read_input_tokens'], removed: ['cached_input_tokens'], at: now - 3600000 },
      message: '部分字段缺失：缓存读取，显示为「—」。Codex 本机用量快照，不等于请求次数',
      messageDetail:
        '按结构契约读取，任何版本只要核心字段齐全就照常统计。缺少终态的记录不参与成功率；历史继承与重复快照不累计。',
    },
    {
      id: 'preview-claude',
      kind: 'claude-code',
      label: 'Claude Code · 示例',
      file: '/Users/demo/Library/Application Support/TokenUsageAssistant/claude-collector/usage.jsonl',
      enabled: true,
      status: 'stale',
      lastSuccessAt: now - 3600000,
      message: '存在格式不兼容的事件，已排除，采集有缺口。只覆盖助手运行期间收到的用量事件',
      messageDetail: '需本机组件已启用。未报告的中间重试、离线及网页聊天不在覆盖范围内。',
    },
  ];
export const previewBridge = {
  retryCredentials: async () => {
    await new Promise((r) => setTimeout(r, 400));
    state = { ...state, credentialIssue: '' };
    publish();
    return { ok: true, value: state };
  },
  saveBillingGroup: associationPreview,
  removeBillingGroup: associationPreview,
  saveAccountLink: associationPreview,
  removeAccountLink: associationPreview,
  getState: async () => ok(snapshot()),
  selectAccount: async (id) => {
    selectPreview(id);
    publish();
    return ok(snapshot());
  },
  cancelAnalytics: async () => ok(true),
  updateToolSource: async (id, patch) => {
    const source = state.toolSources.find((s) => s.id === id);
    if (source) Object.assign(source, patch);
    state.analyticsRevision++;
    publish();
    return ok(source);
  },
  removeToolSource: async (id) => {
    state.toolSources = state.toolSources.filter((s) => s.id !== id);
    state.analyticsRevision++;
    publish();
    return ok(true);
  },
  addToolSource: async () => ({ ok: false, error: '请在 Windows 应用中选择用量文件。' }),
  chooseToolSource: async () => ({ ok: false, error: '请在 Windows 应用中更换文件位置。' }),
  syncToolSource: async (id) => {
    const source = state.toolSources.find((s) => s.id === id);
    if (source) source.lastSuccessAt = Date.now();
    publish();
    return ok(true);
  },
  analytics: async (query) =>
    ok(
      query.source === 'reconciliation' && coveragePreview
        ? coverageDemo(query)
        : query.source === 'tools'
          ? demoTools(query, state, demoPrices)
          : state.provider !== 'commandcode' && query.source === 'account'
            ? {
                status: 'unavailable',
                source: 'account',
                range: { id: query.range },
                ...(['deepseek', 'kimi'].includes(state.provider)
                  ? {
                      message: '此连接只有余额，没有 Token 或账单汇总',
                      messageDetail: '余额变化不是实际消费。请在总览查看余额，或切换到独立工具分析。',
                    }
                  : {
                      message: '此连接只有套餐额度，没有 Token 或账单汇总',
                      messageDetail: '请在总览查看额度，或切换到独立工具分析。',
                    }),
                summary: null,
              }
            : demoAnalytics(query, state),
    ),
  chooseLocalDatabase: async () => ({ ok: false, error: '请在 Windows 桌面应用中选择本机数据库。' }),
  saveModelPrice: async (value) => {
    demoPrices[value.key] = value.price;
    state.analyticsRevision++;
    publish();
    return ok(value.price);
  },
  onState: (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  ready: async () => ok(true),
  connect: async () => ({ ok: false, error: '请在 Windows 桌面应用中连接账户。' }),
  disconnect: async () => ({ ok: false, error: '浏览器仅预览界面。' }),
  setSettings: async (patch) => {
    state.settings = { ...state.settings, ...patch };
    publish();
    return ok(snapshot());
  },
  refresh: async () => {
    state.data.fetching = true;
    publish();
    await new Promise((r) => setTimeout(r, 600));
    state.data.fetching = false;
    state.data.updatedAt = ['deepseek', 'kimi'].includes(state.provider)
      ? { balance: Date.now() }
      : { credits: Date.now(), summary: Date.now() };
    state.data.nextRefreshAt = Date.now() + state.settings.refreshSeconds * 1000;
    publish();
    return ok(snapshot());
  },
  window: async () => ({ ok: false, error: '该功能在 Windows 桌面应用中可用。' }),
  openOfficial: async () => ({ ok: false, error: '网页预览不操作账户。' }),
  testNotification: async () => ({ ok: false, error: 'Windows 桌面应用可发送系统通知。' }),
  openUpdate: async () => ({ ok: false, error: '浏览器预览不打开外部页面。' }),
  previewDiagnostics: async () => ({
    ok: true,
    value: JSON.stringify(
      {
        schema: 1,
        generatedAt: new Date().toISOString(),
        app: { version: state.version, packaged: false, electron: '44.4.4', chrome: '—', node: '24.12.0' },
        system: { platform: 'darwin', arch: 'arm64', release: '15.6' },
        settings: state.settings,
        credentialIssue: false,
        accounts: state.accounts.map((a) => ({
          provider: a.provider,
          region: a.region,
          active: a.id === state.activeAccountId,
          status: a.status,
          lastSuccessAt: new Date().toISOString(),
          lastError: null,
        })),
        toolSources: [],
        log: {
          lines: 1,
          entries: [{ t: new Date().toISOString(), level: 'info', module: 'main', code: 'startup' }],
        },
      },
      null,
      2,
    ),
  }),
  saveDiagnostics: async () => ({ ok: true, value: true }),
};

// Account summaries in the shape desktop/main.cjs builds for the panel (also used by the T11 design mock).
export function previewSummaries() {
  return state.accounts.map((a) => ({
    id: a.id,
    label: a.label,
    provider: a.provider,
    active: a.id === state.activeAccountId,
    capabilities: PROVIDERS.find((p) => p.id === a.provider)?.capabilities || null,
    status: snapshots[a.provider]?.status,
    parts: snapshots[a.provider]?.parts,
    updatedAt: snapshots[a.provider]?.updatedAt,
  }));
}
// Popover panel preview (T7.6, ?surface=panel; ?theme=dark for the dark theme). The view model comes from the
// same pure module as the desktop app (desktop/menubar-panel.cjs, generated), fed with the preview snapshots.
function previewPanel() {
  // T11.3: like main.cjs, Command Code carries the (sample) forecast for the pace line.
  const summaries = previewSummaries().map((a) =>
    a.provider === 'commandcode'
      ? { ...a, prediction: demoAnalytics({ source: 'account', range: 'today' }, state).prediction }
      : a,
  );
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  return {
    ...panelState(summaries, state.settings),
    theme,
    officials: Object.fromEntries(summaries.map((a) => [a.id, true])),
    anchorX: 290,
    // ?platform=win32: the Windows panel sits against the taskbar without the arrow (T11.2).
    arrow: state.platform === 'win32' ? 0 : 8,
    openedAt: 1,
  };
}
export const previewPanelBridge = {
  ready: async () => ok(true),
  panelState: async () => ok(previewPanel()),
  panelResize: async () => ok(true),
  panelOfficial: async () => ({ ok: false, error: '浏览器预览不打开外部页面。' }),
  panelMain: async () => ok(true),
  onPanel: () => () => {},
};
