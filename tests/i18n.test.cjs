// T14.4 (D21 ④): the interface language — "system" follows the system (any Chinese locale reads Chinese, everything
// else English), untranslated text stays Chinese, and every string wrapped in t() on the translated pages has English.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SETTINGS, patchSettings } = require('../desktop/domain.cjs');

const load = () => import('../src/i18n.js');
// The pages translated in T14.4; the rest (analytics, coverage, account links) still read Chinese.
const TRANSLATED = [
  'DesktopApp',
  'AccountsOverview',
  'ProviderViews',
  'BalanceViews',
  'ProviderStatus',
  'Panel',
  'Onboarding',
  'Disclosure',
  'Select',
  'ToolSources',
];

test('T14.4: the language setting defaults to the system and accepts only system / zh / en', async () => {
  assert.equal(DEFAULT_SETTINGS.language, 'system');
  assert.equal(patchSettings(DEFAULT_SETTINGS, { language: 'en' }).language, 'en');
  assert.throws(() => patchSettings(DEFAULT_SETTINGS, { language: 'fr' }), /设置值不正确/);
  const { resolveLanguage } = await load();
  assert.equal(resolveLanguage('system', 'zh-Hans-CN'), 'zh');
  assert.equal(resolveLanguage('system', 'zh-TW'), 'zh');
  assert.equal(resolveLanguage('system', 'en-US'), 'en');
  assert.equal(resolveLanguage('system', 'ja-JP'), 'en');
  assert.equal(resolveLanguage('system', null), 'zh', 'unknown system language: Chinese');
  assert.equal(resolveLanguage('zh', 'en-US'), 'zh');
  assert.equal(resolveLanguage('en', 'zh-CN'), 'en');
});

test('T14.4: t() keeps Chinese unless English is on; untranslated text stays as it is', async () => {
  const { t, setLanguage, locale } = await load();
  setLanguage('zh');
  assert.equal(t('刷新'), '刷新');
  assert.equal(t('低于 {v0}%', { v0: 20 }), '低于 20%');
  assert.equal(locale(), 'zh-CN');
  setLanguage('en');
  assert.equal(locale(), 'en-US');
  assert.equal(t('刷新'), 'Refresh');
  assert.equal(t('低于 {v0}%', { v0: 20 }), 'Below 20%');
  assert.equal(t(' 剩余'), ' left', 'surrounding spaces are kept');
  assert.equal(t('一段没有翻译的文字'), '一段没有翻译的文字', 'no machine translation');
  assert.equal(t('GLM 主号'), 'GLM 主号', 'account labels stay');
  // Built elsewhere: shared domain modules.
  assert.equal(t('2 天 13 小时后重置'), 'Resets in 2d 13h');
  assert.equal(t('01:59:59 后重置'), 'Resets in 01:59:59');
  assert.equal(t('5 小时窗口'), '5-hour window');
  assert.equal(t('3 天窗口'), '3-day window');
  assert.equal(t('成员预算 · 每周'), 'Member budget · Weekly');
  assert.equal(
    t('按最近 25 分钟的速度，每周窗口约 3 小时 6 分钟后触顶（早于重置）'),
    'At the pace of the last 25 min, Weekly window reaches its limit in about 3 h 6 min (before reset)',
  );
  assert.equal(t('额度充足'), 'Quota OK');
  setLanguage('zh');
});

test('T14.4: every t() string on the translated pages has English; English never carries stray Chinese', async () => {
  const { EN } = await import('../src/i18n-en.js');
  const missing = [];
  for (const name of TRANSLATED) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', name + '.jsx'), 'utf8');
    for (const m of source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1].replace(/\\'/g, "'").replace(/\\n/g, '\n').trim();
      if (/[㐀-鿿]/.test(key) && !Object.hasOwn(EN, key)) missing.push(name + ': ' + key);
    }
  }
  assert.deepEqual(missing, []);
  // Chinese may remain only inside quotes (the app's own name as the system shows it, sample output).
  for (const [key, value] of Object.entries(EN)) assert.doesNotMatch(value.replace(/“[^”]*”/g, ''), /[㐀-鿿]/, key);
});
