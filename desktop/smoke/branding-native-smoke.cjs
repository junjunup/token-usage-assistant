// Isolated package regression: inspect rendered alignment and the actual native
// window icon, rather than accepting the executable's embedded icon as proof.
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { app, desktopCapturer, nativeImage } = require('electron');
const { taskbarDetails } = require('../branding.cjs');

async function runBrandingSmoke({ mainWindow, store, settings, applySettings }) {
  const original = mainWindow.getBounds(),
    wasVisible = mainWindow.isVisible(),
    alignment = [];
  const geometry = `(()=>{const b=document.querySelector('.app-mark'),s=b.querySelector('svg'),p=s.querySelector('path');const br=b.getBoundingClientRect(),sr=s.getBoundingClientRect(),pr=p.getBoundingClientRect();return {button:{x:br.x,y:br.y,width:br.width,height:br.height},svg:{x:sr.x,y:sr.y,width:sr.width,height:sr.height},centerOffset:{x:sr.x+sr.width/2-br.x-br.width/2,y:sr.y+sr.height/2-br.y-br.height/2},visibleOffset:{x:pr.x+pr.width/2-br.x-br.width/2,y:pr.y+pr.height/2-br.y-br.height/2},padding:getComputedStyle(b).padding,dpr:devicePixelRatio}})()`;
  try {
    for (const width of [1260, 780])
      for (const theme of ['light', 'dark']) {
        mainWindow.setBounds({ ...original, width, height: 960 });
        applySettings({ ...settings, theme });
        await mainWindow.webContents.executeJavaScript(
          "(()=>{getComputedStyle(document.querySelector('.native-app')).color;document.getAnimations().forEach(a=>{try{a.finish()}catch{}});return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()",
        );
        const result = await mainWindow.webContents.executeJavaScript(geometry);
        if (process.platform !== 'darwin') {
          assert.ok(
            Math.abs(result.centerOffset.x) < 0.1 && Math.abs(result.centerOffset.y) < 0.1,
            'Brand SVG must be centered in its button',
          );
          assert.ok(
            Math.abs(result.visibleOffset.x) < 0.2 && Math.abs(result.visibleOffset.y) < 0.2,
            'Visible ring must be centered',
          );
        }
        alignment.push({ width, theme, ...result });
        const image = await mainWindow.webContents.capturePage({ x: 0, y: 0, width: 68, height: 78 });
        fs.writeFileSync(store.file(`brand-rail-${width}-${theme}.png`), image.toPNG());
      }
    let windowsIcon = { skipped: process.platform !== 'win32' };
    if (process.platform === 'win32') {
      mainWindow.showInactive();
      const id = mainWindow.getMediaSourceId();
      // Only use our own source's appIcon; no screen/window contents are fetched.
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: true,
      });
      const icon = sources.find((source) => source.id === id)?.appIcon;
      assert.ok(icon && !icon.isEmpty(), 'Actual native window icon must exist');
      const size = icon.getSize();
      assert.ok(size.width <= 64 && size.height <= 64, 'Window must use a small HICON, not the 512 px PNG');
      const bitmap = icon.resize({ width: 32, height: 32 }).toBitmap();
      const expected = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')).toBitmap();
      assert.equal(bitmap.length, expected.length);
      let delta = 0;
      for (let i = 0; i < bitmap.length; i++) delta += Math.abs(bitmap[i] - expected[i]);
      const averageChannelDelta = delta / bitmap.length;
      assert.ok(averageChannelDelta < 4, 'OS-reported window icon must match the ring, not Electron');
      fs.writeFileSync(store.file('brand-native-window-icon.png'), icon.toPNG());
      const details = taskbarDetails(app, 'local.commandcode.tokenusageassistant');
      assert.ok(fs.statSync(details.appIconPath).isFile());
      assert.ok(!details.appIconPath.includes('app.asar'), 'Explorer icon must be a real filesystem resource');
      if (process.env.PORTABLE_EXECUTABLE_FILE) assert.equal(details.appIconPath, process.env.PORTABLE_EXECUTABLE_FILE);
      windowsIcon = {
        skipped: false,
        size,
        averageChannelDelta,
        readFromActualWindow: true,
        portableLauncher: !!process.env.PORTABLE_EXECUTABLE_FILE,
        shellIconFileExists: true,
      };
    }
    const report = { ok: true, version: app.getVersion(), alignment, windowsIcon };
    fs.writeFileSync(store.file('brand-native.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    mainWindow.setBounds(original);
    applySettings(settings);
    if (!wasVisible) mainWindow.hide();
  }
}
module.exports = { runBrandingSmoke };
