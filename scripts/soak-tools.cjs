/* Isolated synthetic wall-clock soak. Never opens user tool databases or contacts a network. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const project=path.resolve(__dirname,'..'),work=path.join(project,'work');
const arg=name=>process.argv.find(item=>item.startsWith('--'+name+'='))?.slice(name.length+3);
const durationMs=Number(arg('duration-ms')||7200000),intervalMs=Number(arg('interval-ms')||30000);
if(!Number.isSafeInteger(durationMs)||durationMs<1||!Number.isSafeInteger(intervalMs)||intervalMs<100)throw new Error('Invalid soak duration or interval');
const root=path.resolve(arg('output')||path.join(work,'soak-tools-'+new Date().toISOString().replace(/[:.]/g,'-')));
if(!root.startsWith(path.resolve(work)+path.sep)||!path.basename(root).startsWith('soak-'))throw new Error('Soak output must be an isolated work/soak-* directory');
if(fs.existsSync(root)&&fs.readdirSync(root).length)throw new Error('Soak output must be new or empty');
fs.mkdirSync(root,{recursive:true});
const snapshot=path.join(root,'source-snapshot');
const relevant=['desktop','integrations/deepseek-harness'];
function sourceFiles(base){return relevant.flatMap(dir=>{const folder=path.join(base,dir);return fs.existsSync(folder)?fs.readdirSync(folder).filter(name=>/\.(cjs|js|json|ya?ml)$/.test(name)).sort().map(name=>path.join(dir,name).replaceAll('\\','/')):[];});}
const hashFile=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function hashSources(base){return Object.fromEntries(sourceFiles(base).map(file=>[file,hashFile(path.join(base,file))]));}
const sourceHashesStart=hashSources(project);
for(const file of Object.keys(sourceHashesStart)){const target=path.join(snapshot,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(project,file),target);}
// The source tree's package type is significant for the ESM Harness exporter.
fs.writeFileSync(path.join(snapshot,'package.json'),JSON.stringify({type:'module'}));
const {LocalStore,atomicWrite}=require(path.join(snapshot,'desktop/store.cjs'));
const {AccountManager}=require(path.join(snapshot,'desktop/accounts.cjs'));
const {ToolSources}=require(path.join(snapshot,'desktop/tool-sources.cjs'));
const {AnalyticsService}=require(path.join(snapshot,'desktop/analytics-service.cjs'));
const {DEFAULT_SETTINGS}=require(path.join(snapshot,'desktop/domain.cjs'));
const {createClient}=require(path.join(snapshot,'desktop/providers.cjs'));
const {fixtureFetch}=require(path.join(snapshot,'desktop/provider-fixture.cjs'));
const {client:commandFixture}=require(path.join(snapshot,'desktop/smoke-fixture.cjs'));
const {createZcode}=require(path.join(snapshot,'desktop/tool-fixture.cjs'));

const vaultKey=crypto.randomBytes(32);
// A synthetic AES fixture exercises persistence/reload. Windows DPAPI belongs to the native smoke test.
const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',vaultKey,iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);},decryptString:value=>{const decipher=crypto.createDecipheriv('aes-256-gcm',vaultKey,value.subarray(0,12));decipher.setAuthTag(value.subarray(-16));return Buffer.concat([decipher.update(value.subarray(12,-16)),decipher.final()]).toString('utf8');}};
const startedAt=Date.now(),startedMonotonic=process.hrtime.bigint(),cpuStart=process.cpuUsage();
const loop=monitorEventLoopDelay({resolution:20});loop.enable();
const store=new LocalStore(path.join(root,'assistant-data'),safeStorage);
const settings={...DEFAULT_SETTINGS,refreshSeconds:30,notifications:false};
const expected=new Map(),fixtureCalls={},errors=[],checks={exactTotals:0,repeatedScans:0,sourceIsolation:0,accountIsolation:0,cancellations:0,workerRecovery:0,managerRestarts:0,exporterRestarts:0,vaultReloads:0,privacyScans:0,legacyQueries:0,statusRestores:0,multipleWriters:0};
let accounts,sources,analytics,exporter,harnessSource,zdb,sessionCounter=0,cycles=0,maxRss=0,maxHeap=0,latencies=[],stopping=false,activeStartedMonotonic=null,lastCycleStart=null,maxCycleGapMs=0;
const state={schemaVersion:1,kind:'synthetic-isolated-soak',status:'starting',pid:process.pid,startedAt:new Date(startedAt).toISOString(),durationMs,intervalMs,root,snapshot,scriptSha256:hashFile(__filename),limitations:['Synthetic local metadata and official-contract platform fixtures; no paid accounts or user tool sessions.','Runs the real exporter/reader/worker/account modules from an isolated source snapshot; no desktop GUI exercise.','Vault encryption is a synthetic AES-GCM fixture, not Windows DPAPI.'],sourceHashesStart};
function liveChanges(){const now=hashSources(project);return [...new Set([...Object.keys(sourceHashesStart),...Object.keys(now)])].filter(file=>sourceHashesStart[file]!==now[file]);}
function elapsed(){return Number(process.hrtime.bigint()-startedMonotonic)/1e6;}
function activeElapsed(){return activeStartedMonotonic?Number(process.hrtime.bigint()-activeStartedMonotonic)/1e6:0;}
function heartbeat(status=state.status){const memory=process.memoryUsage();maxRss=Math.max(maxRss,memory.rss);maxHeap=Math.max(maxHeap,memory.heapUsed);const cpu=process.cpuUsage(cpuStart);Object.assign(state,{status,updatedAt:new Date().toISOString(),elapsedMs:elapsed(),activeRunElapsedMs:activeElapsed(),maxCycleGapMs,cycles,checks:{...checks},fixtureCalls:{...fixtureCalls},memory:{rss:memory.rss,heapUsed:memory.heapUsed,maxRss,maxHeap},cpuMicroseconds:cpu,eventLoopDelayMs:{mean:Number.isFinite(loop.mean)?loop.mean/1e6:null,max:loop.max/1e6,p99:loop.percentile(99)/1e6},queries:{count:latencies.length,maxMs:latencies.length?Math.max(...latencies):0,meanMs:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:0},workingSourceChanged:liveChanges(),errors:[...errors]});atomicWrite(path.join(root,'progress.json'),state);}
function expectedSummary(tool=null){const rows=[...expected.values()].filter(row=>!tool||row.tool===tool);const known=rows.filter(row=>row.total!==null);return {requests:rows.length,reportedRequests:known.length,knownTokens:known.reduce((sum,row)=>sum+row.total,0),total:known.length===rows.length?known.reduce((sum,row)=>sum+row.total,0):null,completed:rows.filter(row=>row.status==='completed').length,failed:rows.filter(row=>row.status==='failed').length,cancelled:rows.filter(row=>row.status==='cancelled').length};}
function assertSummary(report,tool=null){assert.ok(report.summary,'A source query must return a summary');const target=expectedSummary(tool);for(const [field,value]of Object.entries(target))assert.equal(report.summary[field],value,'Exact '+field+' for '+(tool||'both tools'));assert.equal(report.accountId,null);assert.equal(report.credits,null);assert.equal(report.prediction,null);assert.ok(report.sourceReports.every(row=>row.status==='ready'));checks.exactTotals++;state.lastSummaries={...state.lastSummaries,[tool||'combined']:target};}
async function query(sourceIds=[]){const start=process.hrtime.bigint();const report=await analytics.get({source:'tools',range:'7d',sourceIds,requestId:crypto.randomUUID()});latencies.push(Number(process.hrtime.bigint()-start)/1e6);assert.ok(latencies.at(-1)<15000,'A bounded sample query must finish before timeout');return report;}
function bindActive(){const active=accounts.active;analytics.monitor=active.monitor;analytics.history=active.history;analytics.client=active.client;analytics.resetAccount();}
function privacyScan(){const db=new DatabaseSync(store.file('tool-usage.sqlite'),{readOnly:true});try{const records=db.prepare('SELECT record FROM tool_records').all();assert.doesNotMatch(JSON.stringify(records),/PRIVATE_RAW_SECRET|PRIVATE_DIALOGUE|SOAK_BODY_SENTINEL|SOAK_CREDENTIAL_SENTINEL/);}finally{db.close();}for(const file of ['usage.jsonl','source.json','status.json'])assert.doesNotMatch(fs.readFileSync(path.join(root,'harness-export',file),'utf8'),/SOAK_BODY_SENTINEL|SOAK_CREDENTIAL_SENTINEL/);assert.doesNotMatch(fs.readFileSync(store.file('accounts.encrypted.json'),'utf8'),/soak-synthetic/);checks.privacyScans++;}

async function produceHarness(mode='normal',fork=false,writer=exporter){
  const id='soak-session-'+(++sessionCounter),session={id,inheritedEventCount:fork?3:0,header:{id,version:4,cwd:'D:/SyntheticSoak/harness-project',isSeeded:fork,...(fork?{origin:'subagent'}:{})}};
  let seq=0;const event=(type,data)=>({seq:seq++,time:Date.now(),type,data});const observe=(type,data)=>{const e=event(type,data);writer.observe(session,e);return e;};
  const usage={inputTokens:40,outputTokens:20,cacheReadTokens:50,cacheWriteTokens:10,reasoningTokens:5,totalTokens:120};
  const partial={...usage,outputTokens:10,totalTokens:110};
  const stream=value=>[{type:'text-chunks',texts:['SOAK_BODY_SENTINEL']},{type:'chunk',chunk:{type:'usage',usage:value}}];
  const finalData={turn:1,step:1,stream:stream(partial),usage,message:{source:{provider:'deepseek',model:'deepseek-chat'},content:['SOAK_BODY_SENTINEL']}};
  if(fork){observe('step/start',{turn:0,step:1});observe('assistant/message',{...finalData,turn:0});observe('step/end',{turn:0,step:1});}
  observe('request/context',{provider:'deepseek',model:'deepseek-chat'});
  const start=observe('step/start',{turn:1,step:1});writer.observe(session,start); // duplicate delivery is not a new call
  if(mode==='missing'){
    observe('assistant/attempt',{turn:1,step:1,stream:[]});observe('turn/end',{turn:1,reason:{kind:'error'}});
    expected.set(id,{tool:'harness',total:null,status:'failed'});
  }else{
    observe('assistant/attempt',{turn:1,step:1,stream:stream(partial)});
    if(mode==='retry'){observe('llm/retry',{turn:1,step:1,retry:1});observe('llm/retry-started',{turn:1,step:1,retry:1});expected.set(id+'-failed',{tool:'harness',total:110,status:'failed'});}
    const final=observe('assistant/message',{...finalData,interrupted:mode==='cancelled'});writer.observe(session,final);
    observe('step/end',{turn:1,step:1});observe('turn/end',{turn:1,reason:{kind:mode==='cancelled'?'aborted':'completed'}});
    expected.set(id,{tool:'harness',total:120,status:mode==='cancelled'?'cancelled':'completed'});
  }
  await writer.flush();assert.equal(writer.error,null,'Exporter remains operational');
}
async function cycle(){
  const cycleStart=activeElapsed();if(lastCycleStart!==null)maxCycleGapMs=Math.max(maxCycleGapMs,cycleStart-lastCycleStart);lastCycleStart=cycleStart;
  cycles++;const id='soak-z-'+cycles,status=['completed','failed','cancelled'][cycles%3];
  zdb.prepare('INSERT INTO model_usage VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'session-z',Date.now(),'deepseek-chat','pending',100,0,'deepseek',10,50,100,'PRIVATE_RAW_SECRET');
  zdb.prepare('UPDATE model_usage SET status=?,output_tokens=20,computed_total_tokens=120 WHERE id=?').run(status,id);
  expected.set(id,{tool:'zcode',total:120,status});
  await produceHarness(cycles%11===0?'missing':cycles%3===0?'retry':cycles%3===1?'normal':'cancelled');
  if(cycles%5===0)await produceHarness('normal',true);
  accounts.select(accounts.entries[cycles%accounts.entries.length].id);bindActive();await accounts.refreshAll();
  assert.ok(accounts.entries.length===4);assert.ok([...accounts.runtimes.values()].every(runtime=>runtime.monitor.state.status==='connected'&&runtime.monitor.timer));
  const report=await query();assertSummary(report);checks.accountIsolation++;
  assertSummary(await query());checks.repeatedScans++;
  assertSummary(await query(['legacy-zcode']),'zcode');assertSummary(await query([harnessSource.id]),'harness');checks.sourceIsolation+=2;
  assert.equal((await analytics.get({source:'tools',range:'billing'})).summary,null);
  if(cycles%10===0){
    const operation=sources.query({range:'7d',requestId:'soak-cancel'});await new Promise(resolve=>setTimeout(resolve,5));await sources.cancel('soak-cancel');assert.equal((await operation).status,'cancelled');checks.cancellations++;
    assertSummary(await query());checks.workerRecovery++;
    const timestamps=sources.list().map(source=>[source.id,source.lastSuccessAt]);await sources.dispose();sources=new ToolSources({store});assert.deepEqual(sources.list().map(source=>[source.id,source.lastSuccessAt]),timestamps);checks.statusRestores++;analytics.tools=sources;assertSummary(await query());checks.managerRestarts++;
    assertSummary(await analytics.get({source:'local',range:'7d'}),'zcode');checks.legacyQueries++;
    const restored=new AccountManager({store,settings,clientFactory:accounts.clientFactory});restored.load();assert.equal(restored.issue,'');assert.equal(restored.entries.length,4);assert.equal(restored.activeId,accounts.activeId);restored.dispose();checks.vaultReloads++;
  }
  if(cycles%20===0){
    const {UsageExporter,HARNESS_VERSION}=await import(pathToFileURL(path.join(snapshot,'integrations/deepseek-harness/exporter.js'))),outputDirectory=path.join(root,'harness-export');
    const second=new UsageExporter({outputDirectory,runtimeVersion:HARNESS_VERSION});await second.ready;assert.equal(second.error,null);await produceHarness('normal',true,second);
    let health=JSON.parse(fs.readFileSync(path.join(outputDirectory,'status.json'),'utf8'));assert.equal(health.state,'ready');assert.equal(health.writers.length,2);await second.close();await exporter.flush();
    health=JSON.parse(fs.readFileSync(path.join(outputDirectory,'status.json'),'utf8'));assert.equal(health.state,'ready');assert.equal(health.writers.length,1);assert.deepEqual(health.gaps,[]);checks.multipleWriters++;assertSummary(await query());
    await exporter.close();exporter=new UsageExporter({outputDirectory,runtimeVersion:HARNESS_VERSION});await exporter.ready;assert.equal(exporter.error,null);checks.exporterRestarts++;
  }
  privacyScan();heartbeat('running');
}

async function main(){
  const {UsageExporter,HARNESS_VERSION,HARNESS_COMMIT}=await import(pathToFileURL(path.join(snapshot,'integrations/deepseek-harness/exporter.js')));
  exporter=new UsageExporter({outputDirectory:path.join(root,'harness-export'),runtimeVersion:HARNESS_VERSION});await exporter.ready;assert.equal(exporter.error,null);
  state.harnessRuntime={version:HARNESS_VERSION,commit:HARNESS_COMMIT,transport:'UsageExporter synthetic session/event callback; no running user Harness process'};
  const zfile=createZcode(path.join(root,'zcode.sqlite'),Date.now(),0);zdb=new DatabaseSync(zfile);zdb.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');
  sources=new ToolSources({store,legacyFile:zfile});harnessSource=sources.add({kind:'harness',file:path.join(root,'harness-export/usage.jsonl'),label:'Harness synthetic soak'});
  const clientFactory=(provider,region)=>{const client=provider==='commandcode'?commandFixture:createClient(provider,region,fixtureFetch);return {...client,summary:client.summary?.bind(client),usage:async(...args)=>{fixtureCalls[provider]=(fixtureCalls[provider]||0)+1;return client.usage(...args);}};};
  accounts=new AccountManager({store,settings,clientFactory});
  for(const provider of ['commandcode','glm','minimax','volcengine'])await accounts.connect({provider,region:provider==='commandcode'?'global':provider==='volcengine'?'cn-beijing':'cn',label:provider+' synthetic soak',apiKey:'soak-synthetic-key-'+provider,accessKeyId:'soak-synthetic-ak',secretKey:'soak-synthetic-sk'});
  analytics=new AnalyticsService({store,monitor:accounts.active.monitor,history:accounts.active.history,client:accounts.active.client,tools:sources});
  activeStartedMonotonic=process.hrtime.bigint();state.activeStartedAt=new Date().toISOString();state.expectedFinishAt=new Date(Date.now()+durationMs).toISOString();
  heartbeat('running');
  while(!stopping){const tickStart=activeElapsed();await cycle();if(activeElapsed()>=durationMs)break;await new Promise(resolve=>setTimeout(resolve,Math.min(intervalMs-Math.min(intervalMs,activeElapsed()-tickStart),durationMs-activeElapsed())));}
  if(stopping)throw new Error('Soak interrupted before requested duration');
  assert.ok(activeElapsed()>=durationMs);assert.ok(maxCycleGapMs<=Math.max(intervalMs*3,60000),'Unexpected long pause prevents continuous-run acceptance');state.sourceHashesEnd=hashSources(project);state.snapshotHashesEnd=hashSources(snapshot);assert.deepEqual(state.snapshotHashesEnd,sourceHashesStart,'Frozen source snapshot must remain identical');
  state.finalSourceCounts={zcode:expectedSummary('zcode'),harness:expectedSummary('harness')};state.validationComplete=durationMs>=7200000;state.finalStatusReason=state.validationComplete?'Requested two-hour synthetic run completed.':'Short harness self-check; does not satisfy two-hour acceptance.';
  heartbeat('passed');
}
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
main().catch(error=>{errors.push({at:new Date().toISOString(),name:error.name,message:String(error.message).slice(0,500)});state.validationComplete=false;heartbeat('failed');process.exitCode=1;}).finally(async()=>{accounts?.dispose();await sources?.dispose();await exporter?.close();zdb?.close();loop.disable();atomicWrite(path.join(root,'result.json'),state);console.log(JSON.stringify({status:state.status,cycles,elapsedMs:state.elapsedMs,validationComplete:state.validationComplete,workingSourceChanged:state.workingSourceChanged,report:path.join(root,'result.json')}));});
