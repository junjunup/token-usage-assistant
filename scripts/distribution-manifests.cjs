// Windows package-manager manifests (T11.7, D17 ②): winget (multi-file, manifest schema 1.10.0) and Scoop.
// Generated per release from the public installer repository's file names and SHA256SUMS.txt; nothing is submitted
// from here — the winget-pkgs pull request is a public step confirmed with the release (T11.9).
// Usage:
//   node scripts/distribution-manifests.cjs --version <v> --sums <SHA256SUMS.txt> --out <dir> [--date YYYY-MM-DD]
//   node scripts/distribution-manifests.cjs --version <v> --placeholder --out <dir>   (schema check only, CI)
const fs = require('node:fs');
const path = require('node:path');

const ID = 'junjunup.TokenUsageAssistant';
const MANIFEST = '1.10.0';
const INSTALLERS = 'https://github.com/junjunup/TokenUsageAssistant';
const SOURCE = 'https://github.com/junjunup/token-usage-assistant';
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
const SHA = /^[0-9a-fA-F]{64}$/;

const setupName = (v) => `TokenUsageAssistant-Setup-${v}.exe`;
const portableName = (v) => `TokenUsageAssistant-Portable-${v}.exe`;
const download = (v, file) => `${INSTALLERS}/releases/download/v${v}/${file}`;
// YAML scalars: quote anything that is not a plain word, escaping as JSON does (a valid YAML double-quoted string).
const scalar = (v) => (/^[\w.:/@+-]+$/.test(v) && !/^\d/.test(v) ? v : JSON.stringify(v));
const yaml = (schema, fields) =>
  `# yaml-language-server: $schema=https://aka.ms/winget-manifest.${schema}.${MANIFEST}.schema.json\n\n` +
  fields
    .map(([k, v]) =>
      Array.isArray(v)
        ? `${k}:\n` + v.map((item) => (typeof item === 'string' ? `- ${scalar(item)}` : item.raw)).join('\n')
        : `${k}: ${typeof v === 'string' ? scalar(v) : v}`,
    )
    .join('\n') +
  '\n';

function check(version, sha) {
  if (!VERSION.test(String(version))) throw new Error('Unsupported version: ' + version);
  if (!SHA.test(String(sha))) throw new Error('Unsupported SHA256');
}

/**
 * The three winget files for one version: version, installer (per-user NSIS Setup, silent switches built in), and
 * the zh-CN default locale plus an en-US locale. File name -> content.
 * @param {{ version: string, setupSha256: string, releaseDate?: string }} o
 */
function wingetManifests({ version, setupSha256, releaseDate }) {
  check(version, setupSha256);
  if (releaseDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new Error('Unsupported date');
  const head = [
    ['PackageIdentifier', ID],
    ['PackageVersion', version],
  ];
  const locale = (code, type, name, short, description) =>
    yaml(type === 'defaultLocale' ? 'defaultLocale' : 'locale', [
      ...head,
      ['PackageLocale', code],
      ['Publisher', 'junjunup'],
      ['PublisherUrl', 'https://github.com/junjunup'],
      ['PublisherSupportUrl', `${SOURCE}/issues`],
      ['PrivacyUrl', `${SOURCE}/blob/main/docs/PRIVACY.md`],
      ['PackageName', name],
      ['PackageUrl', SOURCE],
      ['License', 'MIT'],
      ['LicenseUrl', `${SOURCE}/blob/main/LICENSE`],
      ['ShortDescription', short],
      ['Description', description],
      ...(type === 'defaultLocale' ? [['Moniker', 'token-usage-assistant']] : []),
      ['Tags', ['ai', 'quota', 'usage', 'tokens', 'codex', 'claude-code', 'deepseek', 'tray']],
      ['ReleaseNotesUrl', `${SOURCE}/blob/main/CHANGELOG.md`],
      ['ManifestType', type],
      ['ManifestVersion', MANIFEST],
    ]);
  return {
    [`${ID}.yaml`]: yaml('version', [
      ...head,
      ['DefaultLocale', 'zh-CN'],
      ['ManifestType', 'version'],
      ['ManifestVersion', MANIFEST],
    ]),
    [`${ID}.installer.yaml`]: yaml('installer', [
      ...head,
      ['InstallerLocale', 'zh-CN'],
      ['MinimumOSVersion', '10.0.0.0'],
      ['InstallerType', 'nullsoft'],
      ['Scope', 'user'],
      ['InstallModes', ['interactive', 'silent']],
      ['UpgradeBehavior', 'install'],
      ...(releaseDate ? [['ReleaseDate', releaseDate]] : []),
      [
        'Installers',
        [
          {
            raw: `- Architecture: x64\n  InstallerUrl: ${download(version, setupName(version))}\n  InstallerSha256: ${setupSha256.toUpperCase()}`,
          },
        ],
      ],
      ['ManifestType', 'installer'],
      ['ManifestVersion', MANIFEST],
    ]),
    [`${ID}.locale.zh-CN.yaml`]: locale(
      'zh-CN',
      'defaultLocale',
      'Token 用量助手',
      '同时查看多个 AI 编程平台的额度、余额与本机编程工具用量的桌面助手（只读，非任何平台的官方客户端）',
      '在托盘与悬浮窗里一眼看全多个账户的剩余额度、重置时间与按量余额；只调用平台官方的只读接口，凭据只在本机加密保存，不读取对话内容。界面为中文。',
    ),
    [`${ID}.locale.en-US.yaml`]: locale(
      'en-US',
      'locale',
      'Token Usage Assistant',
      'Desktop assistant for the quota, balance and local tool usage of several AI coding platforms (read-only, unofficial)',
      'Shows the remaining quota, reset times and pay-as-you-go balances of several accounts at a glance in the tray and a floating widget. Uses only official read-only endpoints, keeps credentials encrypted on this machine and never reads conversation content. The interface is in Chinese.',
    ),
  };
}

/**
 * Scoop manifest for the portable executable (a single self-extracting exe; data stays in %APPDATA%).
 * @param {{ version: string, portableSha256: string }} o
 */
function scoopManifest({ version, portableSha256 }) {
  check(version, portableSha256);
  const url = (v) => `${download(v, portableName(v))}#/TokenUsageAssistant.exe`;
  return {
    version,
    description:
      'Desktop assistant for AI coding platform quotas, balances and local tool usage (read-only, unofficial; Chinese UI)',
    homepage: SOURCE,
    license: 'MIT',
    architecture: { '64bit': { url: url(version), hash: portableSha256.toLowerCase() } },
    shortcuts: [['TokenUsageAssistant.exe', 'Token 用量助手']],
    checkver: { github: INSTALLERS },
    autoupdate: { architecture: { '64bit': { url: url('$version') } } },
  };
}

/** @param {string} text SHA256SUMS.txt ("<sha>  <file>" per line) */
function parseSums(text) {
  const sums = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (m) sums[m[2]] = m[1];
  }
  return sums;
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const version = arg('--version'),
    out = path.resolve(arg('--out') || 'distribution-out');
  let setup, portable;
  if (argv.includes('--placeholder')) setup = portable = 'A'.repeat(64);
  else {
    const sums = parseSums(fs.readFileSync(arg('--sums'), 'utf8'));
    setup = sums[setupName(version)];
    portable = sums[portableName(version)];
    if (!setup || !portable) throw new Error('SHA256SUMS.txt has no line for the Setup or Portable file of ' + version);
  }
  const winget = path.join(out, 'winget', 'manifests', 'j', 'junjunup', 'TokenUsageAssistant', version);
  fs.mkdirSync(winget, { recursive: true });
  for (const [file, text] of Object.entries(
    wingetManifests({ version, setupSha256: setup, releaseDate: arg('--date') }),
  ))
    fs.writeFileSync(path.join(winget, file), text);
  fs.mkdirSync(path.join(out, 'scoop'), { recursive: true });
  fs.writeFileSync(
    path.join(out, 'scoop', 'token-usage-assistant.json'),
    JSON.stringify(scoopManifest({ version, portableSha256: portable }), null, 2) + '\n',
  );
  console.log('winget: ' + winget + '\nscoop: ' + path.join(out, 'scoop', 'token-usage-assistant.json'));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { wingetManifests, scoopManifest, parseSums, ID, MANIFEST };
