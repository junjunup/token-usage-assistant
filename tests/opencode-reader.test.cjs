const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {createOpenCode,tokenFixture}=require('../desktop/opencode-fixture.cjs');
const {readOpenCodeRows}=require('../desktop/opencode-reader.cjs');
const {normalizeOpenCodeRecord,aggregateTools}=require('../desktop/tool-analytics.cjs');
const {ToolSources}=require('../desktop/tool-sources.cjs');
const {LocalStore}=require('../desktop/store.cjs');
const NOW=Date.now(),range={id:'today',start:NOW-3600000,end:NOW};
function fixture(t,opts){const root=path.resolve(__dirname,'../work/opencode-tests');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'case-'));t.after(()=>{assert.ok(dir.startsWith(root+path.sep));fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});return {dir,file:createOpenCode(path.join(dir,'opencode.db'),NOW,opts)};}
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function mutate(file,fn){const db=new DatabaseSync(file);try{fn(db);}finally{db.close();}}
const read=file=>readOpenCodeRows(file,range,'source-test');

test('OpenCode mixed schemas exclude fork copies and legacy mirrors, select metadata only, preserve original DB',t=>{
  const {file}=fixture(t),before=digest(file),r=read(file);
  assert.equal(r.status,'ready');assert.equal(r.rows.length,2);assert.equal(r.inherited,1);assert.equal(digest(file),before);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE_|snapshot|error.message|content/);
  const report=aggregateTools(r.rows,range,{},{});
  assert.equal(report.summary.total,240);assert.equal(report.summary.input,200);assert.equal(report.summary.output,40);assert.equal(report.summary.cache.read,100);
  assert.equal(report.summary.successRate,null);assert.equal(report.summary.averageTokens,null);assert.equal(report.summary.cost,null);assert.equal(report.accountId,null);
});
for(const [v1,v2] of [[true,false],[false,true]])test(`OpenCode schema v1=${v1} v2=${v2} is supported independently`,t=>{
  const {file}=fixture(t,{v1,v2}),r=read(file);assert.equal(r.status,'ready');assert.equal(r.rows.length,1);assert.equal(r.rows[0].total,120);
});

test('OpenCode uses every persisted step once rather than adding message/session totals',t=>{
  const {file}=fixture(t,{v1:true,v2:false});
  mutate(file,db=>db.prepare('INSERT INTO part VALUES(?,?,?,?,?,?)').run('retry-step','message-v1','session-v1',NOW-54000,NOW-54000,JSON.stringify({type:'step-finish',tokens:tokenFixture()})));
  const r=read(file);assert.equal(r.rows.length,2);assert.equal(new Set(r.rows.map(r=>r.attemptId)).size,2);assert.equal(r.rows.reduce((s,r)=>s+r.total,0),240);
});

test('OpenCode repeated reads replace observations, preserve updates, and do not duplicate counts',t=>{
  const {file}=fixture(t,{v1:false,v2:true}),a=read(file);
  mutate(file,db=>db.prepare("UPDATE session_message SET data=json_set(data,'$.tokens.input',80,'$.tokens.total',160),time_updated=?").run(NOW-1));
  const b=read(file),report=aggregateTools([...a.rows,...b.rows],range,{},{});
  assert.equal(report.summary.requests,1);assert.equal(report.summary.total,160);
});

test('OpenCode missing and inconsistent Token fields remain unknown, reasoning is added only once',()=>{
  const raw={id:'v2:test',session_id:'s',format:'v2-message',at:NOW,input:40,read:50,write:10,output:15,reasoning:5,total:120};
  const good=normalizeOpenCodeRecord(raw,'source');assert.equal(good.output,20);assert.equal(good.input,100);assert.equal(good.total,120);assert.equal(good.accountId,null);
  const missing=normalizeOpenCodeRecord({...raw,read:null,total:null},'source');assert.equal(missing.input,null);assert.equal(missing.total,null);assert.equal(missing.cacheKnown,false);
  const bad=normalizeOpenCodeRecord({...raw,total:20},'source');assert.equal(bad.invalidUsage,true);assert.equal(bad.total,null);
  assert.equal(normalizeOpenCodeRecord({...raw,input:'40'},'source').total,null);
});

test('OpenCode invalid JSON and unknown schema fail explicitly without affecting other sources',t=>{
  const {file,dir}=fixture(t);mutate(file,db=>db.prepare('UPDATE session_message SET data=?').run('{broken'));
  assert.ok(['schema','error'].includes(read(file).status));
  const unknown=path.join(dir,'unknown.db');mutate(unknown,db=>db.exec('CREATE TABLE unexpected(id TEXT)'));assert.equal(read(unknown).status,'schema');
  assert.equal(read(path.join(dir,'missing.db')).status,'missing');
});

test('OpenCode rejects corrupt assistant times rather than silently treating data as empty',t=>{
  const {file}=fixture(t,{v1:false,v2:true});mutate(file,db=>db.exec("UPDATE session_message SET data=json_remove(data,'$.time.created')"));
  assert.equal(read(file).status,'schema');
});

test('OpenCode source persists and worker supports copied-source overlap isolation and removal',async t=>{
  const {file,dir}=fixture(t),store=new LocalStore(path.join(dir,'assistant'),{isEncryptionAvailable:()=>true}),sources=new ToolSources({store,now:()=>NOW});
  try{
    const source=sources.add({kind:'opencode',file});assert.equal(source.label,'OpenCode');
    let r=await sources.query({range:'today'});assert.equal(r.summary.total,240);assert.equal(r.accountId,null);assert.equal(r.credits,null);
    const copy=path.join(dir,'copy.db');fs.copyFileSync(file,copy);const second=sources.add({kind:'opencode',file:copy});
    r=await sources.query({range:'today'});assert.equal(r.summary.total,240);assert.equal(r.status,'partial');assert.ok(r.sourceReports.some(s=>s.status==='overlap'));
    assert.equal((await sources.query({range:'today',sourceIds:[second.id]})).summary.total,240);
    const restored=new ToolSources({store});assert.equal(restored.entries.length,2);assert.equal(restored.issue,'');await restored.dispose();
    await sources.remove(second.id);assert.equal(sources.entries.length,1);assert.ok(fs.existsSync(copy));
  }finally{await sources.dispose();}
});
