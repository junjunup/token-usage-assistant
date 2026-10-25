#!/bin/bash
# Build the locally ad-hoc signed Mac application (.app + DMG + ZIP) from the source handoff.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
cd "$ROOT"
[[ "$(uname -s)" == Darwin ]] || { echo '构建 Mac 应用需要 macOS。'; exit 1; }
[[ "$(uname -m)" == arm64 ]] || { echo '请使用原生 ARM64 终端和 Node.js。'; exit 1; }
command -v node >/dev/null || { echo '请安装 ARM64 Node.js 24 LTS 后重新运行。'; exit 1; }
node -e "if(process.arch!=='arm64'||Number(process.versions.node.split('.')[0])<24)process.exit(1)" || { echo '需要 ARM64 Node.js 24 或更高版本。'; exit 1; }
command -v pnpm >/dev/null || { echo '请安装 pnpm 11.19.0 后重新运行。'; exit 1; }
# China-network accommodation: electron-builder revalidates GitHub downloads on every run and
# can stall for 10 minutes here. npmmirror mirrors the same checksummed artifacts; an explicit
# user-provided mirror always wins. All downloads remain checksum-verified.
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
# This installs locked development dependencies, never copies Windows node_modules.
pnpm install --frozen-lockfile
pnpm run build
# Local signing (2026-10-25): when the user's self-signed code-signing certificate is in the login keychain, sign
# with it instead of ad-hoc, so the signature stays the same across builds and macOS stops asking for Keychain
# access on every new build. TUA_MAC_IDENTITY=- forces ad-hoc. CI has no such certificate and stays ad-hoc.
LOCAL_IDENTITY="${TUA_MAC_IDENTITY:-TokenUsageAssistant Local Signing}"
if [ "$LOCAL_IDENTITY" != "-" ] && security find-identity -v -p codesigning | grep -q "\"$LOCAL_IDENTITY\""; then
  echo "使用本机代码签名证书：$LOCAL_IDENTITY"
  pnpm run package:mac -- "--config.mac.identity=$LOCAL_IDENTITY"
else
  pnpm run package:mac
fi
VERSION="$(node -p "require('./package.json').version")"
echo "构建完成。产物在 release-v${VERSION}：DMG 用于安装，ZIP 用于传输。"
echo '本包使用本机 ad-hoc 临时签名，未做 Developer ID 签名与公证；首次打开需右键 → 打开。'
