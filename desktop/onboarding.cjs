// @ts-check
// First-run wizard (T11.4, D10): when it shows, how the platforms are grouped, and its steps. Pure: no Electron,
// no I/O. Also generated into src/generated/ for the browser preview.
// - It shows only while there is no account and no tool source, and only until the user finishes or skips it
//   (setting `setupWizard`). Users upgrading with data never see it.
// - An account list that could not be read (e.g. Keychain access denied) is not "no data": the wizard stays away so
//   it never suggests starting over on top of an encrypted file that still exists.

/**
 * @typedef {{ id: string, name: string, credential: string,
 *   capabilities: { quota: boolean, balance: boolean } }} WizardProvider
 * @typedef {{ id: string, title: string, providers: WizardProvider[] }} ProviderGroup
 * @typedef {{ settings?: { setupWizard?: boolean }|null, accounts?: unknown[]|null, toolSources?: unknown[]|null,
 *   hasCredential?: boolean, credentialIssue?: string|null }} WizardState
 */

// Display order inside each group; a platform missing here still appears, at the end of the group its kind picks.
const ORDER = [
  'commandcode',
  'glm',
  'minimax',
  'volcengine',
  'opencode-go',
  'codex',
  'claude',
  'deepseek',
  'kimi',
  'openrouter',
];
const GROUPS = [
  ['plan', '套餐额度'],
  ['subscription', '订阅额度（本机登录，无需 Key）'],
  ['balance', '按量余额'],
  ['key', 'Key 上限与花费'],
];

/** @param {WizardProvider} p */
function kindOf(p) {
  if (p.credential === 'local') return 'subscription';
  if (p.capabilities.balance && !p.capabilities.quota) return 'balance';
  // OpenRouter shows one key's spend limit and reported spend: neither a plan quota nor an account balance.
  if (p.id === 'openrouter') return 'key';
  return 'plan';
}

/**
 * The platform tiles of step 1, grouped by what each platform reports. Every platform appears exactly once.
 * @param {WizardProvider[]} providers
 * @returns {ProviderGroup[]}
 */
function providerGroups(providers) {
  const rank = (/** @type {WizardProvider} */ p) => {
    const i = ORDER.indexOf(p.id);
    return i < 0 ? ORDER.length : i;
  };
  const sorted = [...providers].sort((a, b) => rank(a) - rank(b));
  return GROUPS.map(([id, title]) => ({ id, title, providers: sorted.filter((p) => kindOf(p) === id) })).filter(
    (g) => g.providers.length,
  );
}

/**
 * Whether the wizard should open by itself: no account, no tool source, a readable account list, and the user has
 * neither finished nor skipped it.
 * @param {WizardState|null|undefined} state
 */
function wizardPending(state) {
  if (!state || state.settings?.setupWizard === false || state.credentialIssue) return false;
  return !state.hasCredential && !state.accounts?.length && !state.toolSources?.length;
}

/**
 * The step titles. Step 2 names what the chosen platform needs; Windows adds the tray-pin step (T11.2).
 * @param {{ platform?: string, credential?: string|null }} [options]
 */
function wizardSteps({ platform, credential } = {}) {
  return [
    '选择平台',
    credential === 'local' ? '连接本机登录' : '填写密钥',
    '本机工具（可选）',
    ...(platform === 'win32' ? ['固定托盘图标'] : []),
  ];
}

module.exports = { providerGroups, wizardPending, wizardSteps };
