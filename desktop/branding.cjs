const path = require('node:path');

function windowIcon(directory, platform = process.platform) {
  // ICO makes Electron load the requested 16/32 px HICON on Windows. A large
  // PNG becomes an oversized HICON instead of selecting the shell's icon size.
  return path.join(directory, 'assets', platform === 'win32' ? 'app.ico' : 'app.png');
}

function taskbarDetails(
  app,
  appId,
  { executable = process.execPath, portable = process.env.PORTABLE_EXECUTABLE_FILE } = {},
) {
  // Explorer cannot read an icon inside app.asar. Use the branded executable;
  // portable launchers must remain pinnable after their temporary folder exits.
  const launch = portable || executable;
  return {
    appId,
    appIconPath: app.isPackaged ? launch : path.join(app.getAppPath(), 'desktop', 'assets', 'app.ico'),
    appIconIndex: 0,
    relaunchCommand: `"${launch}"${app.isPackaged ? '' : ` "${app.getAppPath()}"`}`,
    relaunchDisplayName: 'Token 用量助手',
  };
}

module.exports = { windowIcon, taskbarDetails };
