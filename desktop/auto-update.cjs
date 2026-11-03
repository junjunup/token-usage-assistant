// Windows automatic update (T12.8, D19 ⑤). The daily check (update-check.cjs) still only tells the user; this
// module acts only after the user clicks: it asks the public installer repository (D8) for the update description
// (latest.yml), downloads the Setup EXE it names, checks the SHA-512 in it, and runs the installer only after a
// second click. Nothing happens in the background, nothing installs on quit.
// - Only the installed (NSIS) build on Windows: the portable EXE cannot replace itself and macOS is unsigned (D4),
//   so both keep the "view the new version" page.
// - electron-updater is loaded only on that first click, so other builds never load it.
// - The repository is a constant (no configurable address). The installers are not code-signed: the SHA-512 from
//   the same release is the integrity check, the same trust as a manual download from that page.
// - Errors are reported as a fixed code; error texts and URLs are never logged or shown.
const { log } = require('./logger.cjs');

const OWNER = 'junjunup';
const REPO = 'TokenUsageAssistant';
// electron-updater error codes that mean something to the user; anything else is 'failed'.
const ERRORS = {
  ERR_UPDATER_LATEST_VERSION_NOT_FOUND: 'not-found',
  ERR_UPDATER_CHANNEL_FILE_NOT_FOUND: 'not-found',
  ERR_UPDATER_NO_PUBLISHED_VERSIONS: 'not-found',
  ERR_UPDATER_INVALID_UPDATE_INFO: 'not-found',
  ERR_CHECKSUM_MISMATCH: 'integrity',
  ERR_UPDATER_INVALID_SIGNATURE: 'integrity',
};

/**
 * Whether this build can install updates itself: the installed Windows build (not portable, not development).
 * @param {{ platform: string, isPackaged: boolean, env: Record<string, string|undefined> }} where
 */
function canInstall({ platform, isPackaged, env }) {
  return platform === 'win32' && isPackaged && !env.PORTABLE_EXECUTABLE_FILE;
}

/** @param {any} error */
function errorCode(error) {
  const code = error?.code;
  return typeof code === 'string' && Object.hasOwn(ERRORS, code)
    ? ERRORS[/** @type {keyof typeof ERRORS} */ (code)]
    : 'failed';
}

class AutoInstaller {
  /**
   * @param {{ supported: boolean, createUpdater?: () => any, onChange?: (state: any) => void }} options
   */
  constructor({ supported, createUpdater = defaultUpdater, onChange = () => {} }) {
    this.supported = supported;
    this.createUpdater = createUpdater;
    this.onChange = onChange;
    this.updater = null;
    /** @type {{ status: 'idle'|'checking'|'downloading'|'ready'|'failed', version: string|null, percent: number|null, error: string|null }} */
    this.state = { status: 'idle', version: null, percent: null, error: null };
  }
  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
  updaterOnce() {
    if (this.updater) return this.updater;
    const updater = this.createUpdater();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.on('download-progress', (/** @type {any} */ p) => {
      const percent = Number.isFinite(p?.percent) ? Math.max(0, Math.min(100, Math.floor(p.percent))) : null;
      if (this.state.status === 'downloading' && percent !== this.state.percent) this.set({ percent });
    });
    // Errors also reach the awaited promises below; this listener only keeps them from going unhandled.
    updater.on('error', () => {});
    return (this.updater = updater);
  }
  // First click: find the update and download it. Resolves with the state; never throws.
  async download() {
    if (!this.supported || ['checking', 'downloading', 'ready'].includes(this.state.status)) return this.state;
    this.set({ status: 'checking', version: null, percent: null, error: null });
    try {
      const updater = this.updaterOnce();
      const result = await updater.checkForUpdates();
      const version = typeof result?.updateInfo?.version === 'string' ? result.updateInfo.version : null;
      if (!result || !version || result.isUpdateAvailable === false) {
        log.info('update', 'install-none', {});
        this.set({ status: 'failed', error: 'not-found' });
        return this.state;
      }
      this.set({ status: 'downloading', version, percent: 0 });
      await updater.downloadUpdate();
      log.info('update', 'downloaded', {});
      this.set({ status: 'ready', percent: 100 });
    } catch (e) {
      const error = errorCode(e);
      log.info('update', 'install-failed', { kind: error });
      this.set({ status: 'failed', percent: null, error });
    }
    return this.state;
  }
  // Second click: quit and run the downloaded installer (with its normal window, not silent).
  install() {
    if (this.state.status !== 'ready' || !this.updater) return false;
    log.info('update', 'install', {});
    this.updater.quitAndInstall(false, true);
    return true;
  }
}

function defaultUpdater() {
  const { NsisUpdater } = require('electron-updater');
  const updater = new NsisUpdater({ provider: 'github', owner: OWNER, repo: REPO });
  updater.logger = null;
  return updater;
}

module.exports = { AutoInstaller, canInstall, errorCode, OWNER, REPO };
