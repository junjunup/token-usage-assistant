// Synthetic usage metadata only; never used for live collection.
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {VERSION,COMMIT}=require('./harness-reader.cjs');
function harnessWire(now=Date.now(),patch={}){return {schema:'token-usage-assistant.harness',schemaVersion:1,sourceId:'fixture-installation',tool:'deepseek-harness',harnessVersion:VERSION,exporterVersion:'1.4.0',sessionId:'session-h',requestId:'session-h:turn-1:step-1',attemptId:'session-h:turn-1:step-1:3',revision:6,timestamp:now-60000,updatedAt:now-1000,provider:'deepseek',model:'deepseek-chat',project:'D:/Demo/harness-project',status:'completed',usage:{uncachedInputTokens:40,cacheReadTokens:50,cacheWriteTokens:10,outputTokens:20,reasoningTokens:5,totalTokens:120},usageReported:true,coverageStart:now-60000,provenance:'harness-plugin/provider-reported',accountId:null,...patch};}
function createHarness(root,rows=[harnessWire()],sourceId='fixture-installation'){
  fs.mkdirSync(root,{recursive:true});const file=path.join(root,'usage.jsonl');
  fs.writeFileSync(path.join(root,'source.json'),JSON.stringify({schema:'token-usage-assistant.harness-source',schemaVersion:1,sourceId,tool:'deepseek-harness',harnessVersion:VERSION,harnessCommit:COMMIT,sessionFormatVersion:4,exporterVersion:'1.4.0',createdAt:Date.now()}));
  fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({schema:'token-usage-assistant.harness-status',schemaVersion:1,sourceId,state:'ready',code:null,gaps:[],coverageStart:Date.now(),lastWriteAt:Date.now()}));
  fs.writeFileSync(file,rows.map(r=>JSON.stringify({...r,sourceId})).join('\n')+(rows.length?'\n':''));return file;
}
function createZcode(file,now=Date.now(),count=1){
  const db=new DatabaseSync(file);db.exec('CREATE TABLE model_usage(id TEXT PRIMARY KEY,session_id TEXT,started_at INTEGER,model_id TEXT,status TEXT,input_tokens INTEGER,output_tokens INTEGER,provider_id TEXT,cache_creation_input_tokens INTEGER,cache_read_input_tokens INTEGER,computed_total_tokens INTEGER,raw_usage_json TEXT); CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT,title TEXT);');
  db.prepare('INSERT INTO session VALUES(?,?,?)').run('session-z','D:/Demo/zcode-project','PRIVATE_DIALOGUE');
  const insert=db.prepare('INSERT INTO model_usage VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');db.exec('BEGIN');for(let i=0;i<count;i++)insert.run('z-'+i,'session-z',now-1000-(i%30000),'deepseek-chat','completed',100,20,'deepseek',10,50,120,'PRIVATE_RAW_SECRET');db.exec('COMMIT');db.close();return file;
}
module.exports={harnessWire,createHarness,createZcode};
