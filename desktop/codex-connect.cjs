const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { sameFile, pathKey, executableFile } = require('./platform.cjs');
const { discoverCodexPrograms, probeCodex } = require('./codex-rpc.cjs');
function fail(message) {
  return Object.assign(new Error(message), { publicMessage: message });
}
function directory(value) {
  try {
    if (typeof value !== 'string' || !path.isAbsolute(value)) return null;
    const real = fs.realpathSync(value);
    return fs.statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}
function sameLocation(a, b) {
  return !!directory(a) && !!directory(b) && sameFile(a, b);
}
function executable(value, platform = process.platform) {
  // A user-selected .app resolves only to the known CLI location, never its GUI executable.
  if (platform === 'darwin' && typeof value === 'string' && value.endsWith('.app'))
    return executableFile(path.join(value, 'Contents', 'Resources', 'codex'), platform);
  return executableFile(value, platform);
}

// Only known locations: saved connections, explicit CODEX_HOME, and the current user's default.
// No disk-wide search, credential-file reads, or probing other users' profiles.
function discoverProfiles({ entries = [], env = process.env, userHome = os.homedir() } = {}) {
  const candidates = [
    ...entries
      .filter((e) => e.provider === 'codex')
      .map((e) => ({ home: e.credential.home, label: e.label || '已保存的 Codex 配置' })),
    { home: env.CODEX_HOME, label: '自定义 Codex 配置' },
    { home: path.join(userHome, '.codex'), label: '本机默认 Codex 配置' },
  ];
  const seen = new Set(),
    profiles = [];
  for (const candidate of candidates) {
    const home = directory(candidate.home);
    if (!home || profiles.some((p) => sameLocation(p.home, home)) || seen.has(pathKey(home))) continue;
    seen.add(pathKey(home));
    profiles.push({
      id: crypto.createHash('sha256').update(pathKey(home)).digest('hex'),
      home,
      label: candidate.label,
    });
  }
  return profiles;
}
async function resolveLocation(
  value,
  {
    entries = [],
    env = process.env,
    userHome = os.homedir(),
    platform = process.platform,
    findExecutable = discoverCodexPrograms,
    checkProgram = probeCodex,
    chooseHome,
    chooseExecutable,
  } = {},
) {
  const current = value.accountId ? entries.find((e) => e.id === value.accountId) : null;
  if (value.accountId && current?.provider !== 'codex') throw fail('要更新的 Codex 连接已不存在，请重新选择。');
  let home;
  if (value.manual === true) {
    home = await chooseHome();
    if (!home) return { cancelled: true };
    home = directory(home);
    if (!home) throw fail('所选配置目录无法访问，请检查位置与权限。');
  } else {
    const profiles = discoverProfiles({ entries, env, userHome });
    if (value.profileId) {
      const selected = profiles.find((p) => p.id === value.profileId);
      if (!selected) throw fail('配置位置已变化，请重新自动识别或手动选择。');
      home = selected.home;
    } else if (current && directory(current.credential.home)) home = directory(current.credential.home);
    else if (profiles.length > 1 || (current && profiles.length))
      return {
        needsProfileSelection: true,
        profiles,
        message: current
          ? '原配置位置不可用，请选择要更新到的位置。'
          : '发现多个 Codex 配置位置，请选择本次要连接的一项。',
      };
    else if (profiles.length === 1) home = profiles[0].home;
    else {
      home = await chooseHome();
      if (!home) return { cancelled: true };
      home = directory(home);
      if (!home) throw fail('所选配置目录无法访问，请检查位置与权限。');
    }
  }
  const saved = entries.find((e) => e.provider === 'codex' && sameLocation(e.credential.home, home));
  const seen = new Set();
  let issue;
  const check = async (value) => {
    const program = executable(value, platform);
    if (!program || seen.has(pathKey(program, platform))) return null;
    seen.add(pathKey(program, platform));
    try {
      await checkProgram({ executable: program, home });
      return { home, executable: program };
    } catch (e) {
      issue ||= e.publicMessage || '所找到的 Codex 程序无法完成初始化。';
      return null;
    }
  };
  const savedResult = await check(saved?.credential.executable);
  if (savedResult) return savedResult;
  const found = await findExecutable({ platform, env, home: userHome });
  for (const candidate of (Array.isArray(found) ? found : [found]).slice(0, 8)) {
    const result = await check(candidate);
    if (result) return result;
  }
  const selected = await chooseExecutable({
    message:
      (issue ? issue + '\n' : '') +
      (platform === 'darwin'
        ? '请选择已安装的官方 Codex.app，可直接选择应用，无需展开包内容。'
        : '请选择新版官方 Codex 的 codex.exe。'),
  });
  if (!selected) return { cancelled: true };
  const program = executable(selected, platform);
  if (!program)
    throw fail(
      platform === 'darwin'
        ? '所选应用中未找到可执行的 Codex 程序，请选择完整的官方 Codex.app。'
        : '请选择可访问的官方 Codex 可执行程序。',
    );
  await checkProgram({ executable: program, home });
  return { home, executable: program };
}
function attachCodexSource(tools, home) {
  const existing = tools.entries.find((s) => s.kind === 'codex' && sameLocation(s.file, home));
  if (existing)
    return existing.enabled
      ? { status: 'existing', message: '工具数据源已保留，可在工具分析查看同步结果。' }
      : { status: 'disabled', message: '原工具数据源处于停用状态，可在工具数据源中启用。' };
  if (!fs.existsSync(path.join(home, 'sessions')) && !fs.existsSync(path.join(home, 'archived_sessions')))
    return { status: 'waiting', message: '尚未发现本机用量日志；额度连接已保留，产生记录后可添加工具数据源。' };
  try {
    tools.add({ kind: 'codex', file: home, label: 'Codex' });
    return { status: 'added', message: '已添加独立工具数据源，等待分析同步。' };
  } catch {
    return { status: 'unavailable', message: '工具数据源暂未添加，请在设置中检查；额度连接已保留。' };
  }
}
async function connectCodex(value, { accounts, tools, ...options }) {
  const resolved = await resolveLocation(value, { entries: accounts.entries, ...options });
  if (resolved.cancelled || resolved.needsProfileSelection) return resolved;
  const accountId = await accounts.connect({ ...value, ...resolved, binding: undefined });
  const details = attachCodexSource(tools, resolved.home);
  const windows = accounts.active?.monitor?.state?.parts?.credits?.windows || [];
  return {
    connected: true,
    accountId,
    details,
    message: (windows.length ? 'Codex 额度已同步。' : 'Codex 登录已验证，额度窗口暂未返回。') + details.message,
  };
}
module.exports = { discoverProfiles, resolveLocation, connectCodex, attachCodexSource, sameLocation };
