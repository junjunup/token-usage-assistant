import { demoAnalytics, demoPrices } from './preview-analytics.js';
import { demoTools } from './tools-preview.js';
import { fixtureBody } from './generated/provider-fixture.js';
import {
  normalizeGlm,
  normalizeMiniMax,
  normalizeVolcengine,
  normalizeOpenCodeGo,
  quota,
} from './generated/provider-domain.js';
import { normalizeDeepSeek } from './generated/balance-domain.js';
import { PROVIDERS } from './generated/provider-catalog.js';
const now = Date.now();
let state = {
  version: '1.2.0',
  analyticsRevision: 0,
  hasCredential: true,
  credentialIssue: '',
  connecting: false,
  packaged: false,
  platform: 'preview',
  settings: {
    theme: 'light',
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
if (scenario === 'reset-missing')
  state.data.parts.credits.five = { ...state.data.parts.credits.five, resetAt: null, resetState: 'unknown' };
const snapshots = { commandcode: structuredClone(state.data) };
for (const [provider, normalize] of Object.entries({
  glm: normalizeGlm,
  minimax: normalizeMiniMax,
  volcengine: normalizeVolcengine,
  // OpenCode Go (beta.5) was missing here, so selecting its preview account blanked the page.
  'opencode-go': normalizeOpenCodeGo,
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
state.version = '1.8.0-beta.4';
if (new URLSearchParams(location.search).get('platform') === 'darwin') state.platform = 'darwin';
state.associations = { groups: [], rules: [], issue: '' };
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
if (selectedProvider === 'deepseek' && scenario === 'unknown') state.data.parts.balance.balances[0].granted = null;
if (selectedProvider && selectedProvider !== 'deepseek' && scenario === 'unknown')
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
if (selectedProvider && selectedProvider !== 'deepseek' && scenario === 'exhausted') {
  const w = state.data.parts.credits.windows[0];
  w.remainingPercent = 0;
  w.usedPercent = 100;
  w.exceeded = true;
}
const listeners = new Set(),
  ok = (value) => ({ ok: true, value: structuredClone(value) }),
  publish = () => {
    for (const cb of listeners) cb(structuredClone(state));
  };
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
// Preview of an unverified upstream version (?desktop-preview=unverified-version, T5.1): the Codex source reads a
// newer rollout version by its known structure and says so in its existing status message.
if (new URLSearchParams(location.search).get('desktop-preview') === 'unverified-version')
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
      contract: 'unverified-version',
      observedVersion: '0.160.0',
      message:
        '0.160 版本未经验证，按已知结构读取。Codex 0.155.x 本机已报告用量快照；不等同请求次数，缺少终态的记录不参与成功率。历史继承与重复快照不累计。',
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
  getState: async () => ok(state),
  selectAccount: async (id) => {
    selectPreview(id);
    publish();
    return ok(state);
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
      query.source === 'tools'
        ? demoTools(query, state, demoPrices)
        : state.provider !== 'commandcode' && query.source === 'account'
          ? {
              status: 'unavailable',
              source: 'account',
              range: { id: query.range },
              message:
                state.provider === 'deepseek'
                  ? '此连接仅提供余额；Token 与账单汇总暂不可获取。'
                  : '此连接提供套餐额度；Token 与账单汇总暂不可获取。',
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
    return ok(state);
  },
  refresh: async () => {
    state.data.fetching = true;
    publish();
    await new Promise((r) => setTimeout(r, 600));
    state.data.fetching = false;
    state.data.updatedAt =
      state.provider === 'deepseek' ? { balance: Date.now() } : { credits: Date.now(), summary: Date.now() };
    state.data.nextRefreshAt = Date.now() + state.settings.refreshSeconds * 1000;
    publish();
    return ok(state);
  },
  window: async () => ({ ok: false, error: '该功能在 Windows 桌面应用中可用。' }),
  openOfficial: async () => ({ ok: false, error: '网页预览不操作账户。' }),
  testNotification: async () => ({ ok: false, error: 'Windows 桌面应用可发送系统通知。' }),
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
