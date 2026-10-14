const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const asar=require('../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar');
const root=path.resolve(__dirname,'..'),archive=path.join(root,'release-v1.8.0-beta.5/win-unpacked/resources/app.asar');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=asar.listPackage(archive).map(p=>p.replace(/^[/\\]+/,'')).filter(p=>!asar.statFile(archive,p).files);
const checks=[];
for(const p of names){
  const name=p.replaceAll('\\','/');
  assert.ok(name==='package.json'||name.startsWith('desktop/')||name.startsWith('dist/client/'),'unexpected packaged file: '+name);
  if(name!=='package.json'){
    const sha256=digest(asar.extractFile(archive,p));
    assert.equal(sha256,digest(fs.readFileSync(path.join(root,name))),'packaged file differs: '+name);
    checks.push({file:name,sha256});
  }
}
const packaged=JSON.parse(asar.extractFile(archive,'package.json')),source=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
for(const key of ['name','version','main','description'])assert.equal(packaged[key],source[key]);
assert.equal(packaged.version,'1.8.0-beta.5');assert.ok(!packaged.devDependencies);
for(const name of fs.readdirSync(path.join(root,'desktop')).filter(x=>x.endsWith('.cjs')))assert.ok(checks.some(x=>x.file==='desktop/'+name),'missing desktop module '+name);
const files=['TokenUsageAssistant-Portable-1.8.0-beta.5.exe','TokenUsageAssistant-Setup-1.8.0-beta.5.exe'].map(file=>{const bytes=fs.readFileSync(path.join(root,'release-v1.8.0-beta.5',file));return {file,bytes:bytes.length,sha256:digest(bytes)};});
const report={ok:true,version:packaged.version,at:new Date().toISOString(),asarSha256:digest(fs.readFileSync(archive)),verifiedFiles:checks.length,desktopFiles:checks.filter(p=>p.file.startsWith('desktop/')).length,excludedScratch:true,files,checks};
fs.writeFileSync(path.join(root,'docs/verification-1.8.0-beta.5/package-integrity.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,checks:undefined}));

