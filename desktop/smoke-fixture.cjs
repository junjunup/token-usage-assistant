const {normalizeIdentity,normalizeCredits,normalizeSubscription,normalizeSummary}=require('./domain.cjs');
const {DatabaseSync}=require('node:sqlite');
const {sampleRows}=require('./analytics-fixture.cjs');
const path=require('node:path');
const periodStart=()=>new Date(new Date().getFullYear(),new Date().getMonth(),1).getTime();
const periodEnd=()=>new Date(new Date().getFullYear(),new Date().getMonth()+1,1).getTime();
const summary=since=>normalizeSummary({totalTokensIn:10200000,totalTokensOut:2600000,totalTokens:12800000,totalCount:284,completedCount:279,failedCount:5,totalCost:24.6,totalMonthlyCredits:23.6,totalPurchasedCredits:1,totalFreeCredits:0,totalCredits:24.6},since,periodEnd());
module.exports.client={
  summary:async(_key,_org,since)=>summary(since),
  usage:async()=>({parts:{
    identity:normalizeIdentity({success:true,user:{id:'test-account',userName:'demo'},org:null}),
    credits:normalizeCredits({credits:{monthlyCredits:175.4,purchasedCredits:5,freeCredits:0},windowLimits:{limited:true,fiveHour:{used:32,cap:100,resetAt:Date.now()+8300000},weekly:{used:58,cap:100,resetAt:Date.now()+220000000}}}),
    subscription:normalizeSubscription({success:true,data:{status:'active',planId:'demo',currentPeriodStart:periodStart(),currentPeriodEnd:periodEnd()}}),
    summary:summary(periodStart()),
  },errors:[]})
};
module.exports.createDatabase=root=>{
  const file=path.join(root,'smoke-usage.sqlite');const db=new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS model_usage (id TEXT PRIMARY KEY, session_id TEXT, started_at INTEGER, model_id TEXT, provider_id TEXT, status TEXT, input_tokens INTEGER, output_tokens INTEGER, computed_total_tokens INTEGER, cache_read_input_tokens INTEGER, cache_creation_input_tokens INTEGER); CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, directory TEXT); DELETE FROM model_usage; DELETE FROM session; BEGIN');
  const put=db.prepare('INSERT INTO model_usage VALUES (?,?,?,?,?,?,?,?,?,?,?)'),session=db.prepare('INSERT OR IGNORE INTO session VALUES (?,?)');
  for(const r of sampleRows(Date.now())){put.run(r.id,r.session_id,r.started_at,r.model_id,r.provider_id,r.status,r.input_tokens,r.output_tokens,r.computed_total_tokens,r.cache_read_input_tokens,r.cache_creation_input_tokens);session.run(r.session_id,r.directory);}
  db.exec('COMMIT');db.close();return file;
};
