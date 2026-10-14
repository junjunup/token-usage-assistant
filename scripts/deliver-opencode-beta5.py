from pathlib import Path
import hashlib, json, re, stat, sys, zipfile
from datetime import datetime

ROOT=Path(__file__).resolve().parent.parent
VERSION='1.8.0-beta.5'
OUT=ROOT/('release-v'+VERSION)
E=ROOT/'docs'/('verification-'+VERSION)
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def record(p):return {'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
def zip_files(dest,files,prefix):
    with zipfile.ZipFile(dest,'x') as z:
        for name,data in files.items():
            i=zipfile.ZipInfo(prefix+name,datetime.now().timetuple()[:6]);i.create_system=3
            i.external_attr=(stat.S_IFREG|(0o755 if name.endswith('.command') else 0o644))<<16
            i.compress_type=zipfile.ZIP_STORED if name.endswith('.zip') else zipfile.ZIP_DEFLATED
            z.writestr(i,data)
    with zipfile.ZipFile(dest) as z:
        for name,data in files.items():
            assert sha(z.read(prefix+name))==sha(data),name
            if name.endswith('.command'):
                assert b'\r' not in data and not data.startswith(b'\xef\xbb\xbf')
                assert stat.S_IMODE(z.getinfo(prefix+name).external_attr>>16)==0o755

integrity=read(E/'package-integrity.json')
assert integrity['ok'] and integrity['version']==VERSION
asar=(OUT/'win-unpacked/resources/app.asar').read_bytes()
assert sha(asar)==integrity['asarSha256']

assert sys.argv[1]=='final'
assert read(E/'portable-smoke.json')['ok']
assert read(E/'payload-integrity.json')['asarSha256']==sha(asar)
assert read(E/'opencode-scope-integrity.json')['ok']
assert read(E/'portable-smoke.json')['opencode']['ok']
# Mac deliverables are built and verified on an arm64 Mac (mac-app-integrity.json),
# then copied back here; the old hand-assembled Full-*.zip report stays as history only.
macIntegrity=read(E/'mac-app-integrity.json')
assert macIntegrity['ok']
dirs=['src','desktop','tests','scripts','docs','integrations','worker','.openai','build']
names=['.npmrc','AGENTS.md','README.md','PROJECT_HANDOFF.md','DEVELOPMENT_READY.md','design-qa.md','desktop-verification.md','electron-builder.yml','index.html','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','vite.config.mjs']
paths=[ROOT/n for n in names]
for name in dirs:paths.extend(p for p in (ROOT/name).rglob('*') if p.is_file())
source={p.relative_to(ROOT).as_posix():p.read_bytes() for p in paths}
for name in source:
    assert not re.search(r'(^|/)(work|node_modules|release[^/]*|accounts|assistant-data)(/|$)',name)
    assert not re.search(r'\.(sqlite|sqlite-wal|sqlite-shm|jsonl)$',name)
    assert Path(name).name not in ('collector.json','claude-settings.json')
    if name.endswith('.command'):source[name]=source[name].replace(b'\r\n',b'\n')
dest=OUT/('TokenUsageAssistant-Source-Handoff-'+VERSION+'.zip')
zip_files(dest,source,'commandcode-companion/')
files=[record(OUT/x['file']) for x in integrity['files']]
for macArtifact in ['TokenUsageAssistant-Mac-arm64-'+VERSION+'.dmg','TokenUsageAssistant-Mac-arm64-'+VERSION+'.zip']:
    p=OUT/macArtifact
    if p.exists():files.append(record(p))
files.append(record(dest))
manifest={'version':VERSION,'scope':'OpenCode Go official quota and independent OpenCode SQLite metadata; existing visual design, logo and storage preserved; Mac delivery moved to locally built .app + DMG','asarSha256':sha(asar),'checks':{'desktopTestsPassed':249,'newOpenCodeTestsPassed':15,'sitesTestsPassed':4,'realGoAccountTest':False,'realOpenCodeToolTest':False,'portableNativeSmoke':True,'bothWindowsPayloadsMatchSource':True,'nativeMacTest':bool(macIntegrity.get('nativeMacTest',False)),'newLongStabilityTest':False},'files':files}
write_manifest=OUT/('TokenUsageAssistant-'+VERSION+'-manifest.json')
write_manifest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
