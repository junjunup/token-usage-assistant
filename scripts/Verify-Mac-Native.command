#!/bin/bash
# Verify the locally built ad-hoc signed Mac application bundle and run the native smoke test.
# Writes docs/verification-<version>/mac-app-integrity.json. Exits non-zero on any failed gate.
set -uo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
cd "$ROOT"
[[ "$(uname -s)" == Darwin ]] || { echo '校验 Mac 应用需要 macOS。'; exit 1; }
command -v node >/dev/null || { echo '需要 ARM64 Node.js 24。'; exit 1; }
command -v codesign >/dev/null || { echo '需要 codesign（Xcode 命令行工具）。'; exit 1; }

VERSION="$(node -p "require('./package.json').version")"
# CI overrides: TUA_RELEASE_DIR (build output) and TUA_REPORT_DIR (where mac-app-integrity.json goes).
OUT="${TUA_RELEASE_DIR:-$ROOT/release-v$VERSION}"
REPORT_DIR="${TUA_REPORT_DIR:-$ROOT/docs/verification-$VERSION}"
APP="$(find "$OUT" -maxdepth 3 -type d -name 'Token 用量助手.app' 2>/dev/null | head -1)"
if [ -z "$APP" ]; then
  echo "未在 $OUT 下找到 Token 用量助手.app；请先运行 scripts/Build-Mac-App.command。"
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/tua-mac-verify.XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/checks"
PASS=1
ORDER="$TMP/checks/order.txt"; : >"$ORDER"

record() { # record <name> <ok:0/1> <detail...>
  local name="$1" ok="$2"; shift 2
  printf '%s %s\n' "$name" "$ok" >>"$ORDER"
  printf '%s' "$*" >"$TMP/checks/$name.detail"
  if [ "$ok" -eq 1 ]; then echo "通过：$name"; else PASS=0; echo "失败：$name —— $*"; fi
}

echo "目标应用：$APP"

# 1. Strict deep code-signature verification (the core assertion this script exists for).
if codesign --verify --deep --strict --verbose=4 "$APP" >"$TMP/codesign-verify.log" 2>&1; then
  record 'codesignDeepStrict' 1 "$(tr '\n' ' ' <"$TMP/codesign-verify.log" | sed 's/  */ /g' | sed 's/ *$//')"
else
  record 'codesignDeepStrict' 0 "$(tr '\n' ' ' <"$TMP/codesign-verify.log" | sed 's/  */ /g')"
fi

# 2. Nested-bundle seal present and signature is ad-hoc.
if [ -f "$APP/Contents/_CodeSignature/CodeResources" ]; then
  SIGN_INFO="$(codesign -dv "$APP" 2>&1)"
  if echo "$SIGN_INFO" | grep -q 'Signature=adhoc'; then
    record 'codeResourcesAndAdhoc' 1 "CodeResources 存在；$(echo "$SIGN_INFO" | grep -E 'Signature=|Flags=' | tr '\n\t' '  ' | sed 's/  */ /g' | sed 's/ *$//')"
  else
    record 'codeResourcesAndAdhoc' 0 "CodeResources 存在但未显示 ad-hoc 签名：$(echo "$SIGN_INFO" | tr '\n\t' '  ')"
  fi
else
  record 'codeResourcesAndAdhoc' 0 '缺少 Contents/_CodeSignature/CodeResources（bundle seal）'
fi

# 3. Hardened-runtime entitlements.
ENTITLEMENTS="$(codesign -d --entitlements - --xml "$APP" 2>/dev/null)"
if echo "$ENTITLEMENTS" | grep -q 'allow-jit' && echo "$ENTITLEMENTS" | grep -q 'disable-library-validation'; then
  record 'entitlements' 1 'allow-jit 与 disable-library-validation 均存在'
else
  record 'entitlements' 0 "缺少 allow-jit 或 disable-library-validation：$(echo "$ENTITLEMENTS" | tr '\n\t' '  ' | head -c 400)"
fi

# 4. Info.plist identity, icon and version.
PLIST="$APP/Contents/Info.plist"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" 2>/dev/null || true)"
ICON_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$PLIST" 2>/dev/null || true)"
BUNDLE_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST" 2>/dev/null || true)"
ICON_OK=0
if [ -n "$ICON_NAME" ]; then
  [ -f "$APP/Contents/Resources/$ICON_NAME" ] && ICON_OK=1
  [ "$ICON_OK" -eq 0 ] && [ -f "$APP/Contents/Resources/$ICON_NAME.icns" ] && ICON_OK=1
fi
if [ "$BUNDLE_ID" = 'local.commandcode.tokenusageassistant' ] && [ "$ICON_OK" -eq 1 ] && [ "$BUNDLE_VERSION" = "$VERSION" ]; then
  record 'infoPlist' 1 "CFBundleIdentifier=${BUNDLE_ID}, CFBundleIconFile=${ICON_NAME}, CFBundleShortVersionString=${BUNDLE_VERSION}"
else
  record 'infoPlist' 0 "CFBundleIdentifier=${BUNDLE_ID}, CFBundleIconFile=${ICON_NAME}, CFBundleShortVersionString=${BUNDLE_VERSION}"
fi

# 5. Native smoke test in an isolated directory (first real nativeMacTest evidence).
SMOKE_DIR="$(mktemp -d "$TMP/smoke.XXXXXXXX")"
EXEC_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST" 2>/dev/null || true)"
[ -n "$EXEC_NAME" ] || { echo '无法读取 CFBundleExecutable。'; exit 1; }
echo "运行原生 smoke 测试 (隔离目录 ${SMOKE_DIR}) …… "
"$APP/Contents/MacOS/$EXEC_NAME" --smoke-test "--test-directory=$SMOKE_DIR" \
  >"$SMOKE_DIR/stdout.log" 2>"$SMOKE_DIR/stderr.log" &
SMOKE_PID=$!
SMOKE_TIMEOUT=0
for _ in $(seq 1 150); do
  kill -0 "$SMOKE_PID" 2>/dev/null || break
  sleep 1
done
if kill -0 "$SMOKE_PID" 2>/dev/null; then
  SMOKE_TIMEOUT=1
  kill "$SMOKE_PID" 2>/dev/null
fi
wait "$SMOKE_PID" 2>/dev/null
SMOKE_EXIT=$?
SMOKE_REPORT="$SMOKE_DIR/smoke-result.json"
SMOKE_COPY="$TMP/smoke-result.json"
if [ "$SMOKE_TIMEOUT" -eq 1 ]; then
  record 'nativeSmokeTest' 0 'smoke 测试 150 秒未退出，已终止'
elif [ ! -f "$SMOKE_REPORT" ]; then
  record 'nativeSmokeTest' 0 "exit=${SMOKE_EXIT}, 未生成 smoke-result.json; stderr: $(tail -c 400 "$SMOKE_DIR/stderr.log" 2>/dev/null | tr '\n\t' '  ')"
else
  cp "$SMOKE_REPORT" "$SMOKE_COPY"
  SMOKE_OK="$(SMOKE_REPORT="$SMOKE_REPORT" node -e 'try{const r=require(process.env.SMOKE_REPORT);console.log(r.ok?1:0)}catch{console.log(0)}')"
  SMOKE_VERSION="$(SMOKE_REPORT="$SMOKE_REPORT" node -e 'try{const r=require(process.env.SMOKE_REPORT);console.log(String(r.version||""))}catch{console.log("")}')"
  if [ "$SMOKE_OK" -eq 1 ] && [ "$SMOKE_VERSION" = "$VERSION" ]; then
    record 'nativeSmokeTest' 1 "exit=${SMOKE_EXIT}, ok=true, version=${SMOKE_VERSION} (隔离目录运行，未读取真实账户数据)"
  else
    record 'nativeSmokeTest' 0 "exit=${SMOKE_EXIT}, ok=false, version=${SMOKE_VERSION}"
  fi
fi

# 6. Packaged userData stays at ~/Library/Application Support/TokenUsageAssistant (source-level confirmation).
# Since T3.1 main.cjs derives the name from macDataName(app.isPackaged) in platform.cjs; development runs use
# TokenUsageAssistant-Dev. Whitespace-tolerant patterns (the source is Prettier-formatted).
ASAR="$APP/Contents/Resources/app.asar"
S='[[:space:]]*'
MAIN_RE="app\\.setPath\\(${S}'userData'${S},${S}path\\.join\\(${S}app\\.getPath\\(${S}'appData'${S}\\)${S},${S}macName${S}\\)${S}\\)"
NAME_RE="const macName = macDataName\\(app\\.isPackaged\\)"
PLATFORM_RE="isPackaged${S}\\?${S}'TokenUsageAssistant'${S}:${S}'TokenUsageAssistant-Dev'"
if [ -f "$ASAR" ] && grep -aqE "$MAIN_RE" "$ASAR" && grep -aqE "$NAME_RE" "$ASAR" && grep -aqE "$PLATFORM_RE" "$ASAR"; then
  record 'defaultUserDataPath' 1 'asar 内源码确认：打包版 userData 为 ~/Library/Application Support/TokenUsageAssistant（macDataName(app.isPackaged)），开发版另用 TokenUsageAssistant-Dev'
else
  record 'defaultUserDataPath' 0 '未在 app.asar 中确认打包版 userData 路径设置'
fi

# 7. Gatekeeper assessment — expected rejected (no Developer ID / notarization). Recorded honestly, never a gate.
SPCTL_OUTPUT="$(spctl -a -vvv -t exec "$APP" 2>&1)"
SPCTL_EXIT=$?
if [ "$SPCTL_EXIT" -eq 0 ]; then SPCTL='accepted'; else SPCTL='rejected'; fi
echo "记录（非门禁）：spctl $SPCTL —— $SPCTL_OUTPUT"

# Artifact digests (DMG / ZIP / packaged ASAR) for the delivery manifest.
ARTIFACTS_JSON="$TMP/artifacts.json"
ARTIFACTS_JSON="$ARTIFACTS_JSON" OUT="$OUT" VERSION="$VERSION" node -e '
const fs=require("fs"),crypto=require("crypto");
const out=process.env.OUT,version=process.env.VERSION;
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const artifacts={};
for(const ext of ["dmg","zip"]){
  const p=out+"/TokenUsageAssistant-Mac-arm64-"+version+"."+ext;
  if(fs.existsSync(p))artifacts[ext]={file:"TokenUsageAssistant-Mac-arm64-"+version+"."+ext,bytes:fs.statSync(p).size,sha256:sha(p)};
}
const asar=out+"/mac-arm64/Token 用量助手.app/Contents/Resources/app.asar";
if(fs.existsSync(asar))artifacts.asar={file:"mac-arm64/Token 用量助手.app/Contents/Resources/app.asar",bytes:fs.statSync(asar).size,sha256:sha(asar)};
fs.writeFileSync(process.env.ARTIFACTS_JSON,JSON.stringify(artifacts));
'

REPORT_DIR="$REPORT_DIR" VERSION="$VERSION" APP="$APP" PASS="$PASS" SPCTL="$SPCTL" \
SPCTL_OUTPUT="$SPCTL_OUTPUT" ARTIFACTS_FILE="$ARTIFACTS_JSON" TMPDIR_CHECKS="$TMP" ORDER="$ORDER" node -e '
const fs=require("fs"),path=require("path");
const env=process.env,checksDir=env.TMPDIR_CHECKS+"/checks";
const checks={};let nativeMacTest=false;
for(const line of fs.readFileSync(env.ORDER,"utf8").split("\n").filter(Boolean)){
  const [name,ok]=line.split(" ");
  checks[name]={ok:ok==="1",detail:fs.readFileSync(path.join(checksDir,name+".detail"),"utf8")};
  if(name==="nativeSmokeTest")nativeMacTest=ok==="1";
}
let smokeEvidence=null;
try{smokeEvidence=JSON.parse(fs.readFileSync(env.TMPDIR_CHECKS+"/smoke-result.json","utf8"));}catch{}
const report={
  ok:env.PASS==="1",
  version:env.VERSION,
  generatedAt:new Date().toISOString(),
  appPath:env.APP,
  signature:"ad-hoc（本机临时签名，未做 Developer ID 签名与公证）",
  checks,
  spctl:{result:env.SPCTL,expected:"rejected（未公证，如实记录，不判通过）",output:env.SPCTL_OUTPUT,gate:false},
  artifacts:JSON.parse(fs.readFileSync(env.ARTIFACTS_FILE,"utf8")),
  nativeMacTest,
  smokeEvidence,
};
fs.mkdirSync(env.REPORT_DIR,{recursive:true});
const dest=path.join(env.REPORT_DIR,"mac-app-integrity.json");
fs.writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
console.log("报告已写入 "+dest);
console.log(env.PASS==="1"?"全部门禁检查通过。":"存在失败的门禁检查，详见报告。");
process.exit(env.PASS==="1"?0:1);
'
