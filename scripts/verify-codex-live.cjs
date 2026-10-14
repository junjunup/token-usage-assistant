// Explicit opt-in only. Queries the signed-in official client, never sends model requests.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {discoverCodex,readCodexAccount}=require('../desktop/codex-rpc.cjs');
const {normalizeCodex}=require('../desktop/subscriptions.cjs');
const {readFile}=require('../desktop/codex-reader.cjs');
if(!process.argv.includes('--allow-local-account-read')){console.error('Requires --allow-local-account-read');process.exit(2);}
const root=path.resolve(__dirname,'..'),home=path.join(os.homedir(),'.codex');
(async()=>{
  const raw=await readCodexAccount({executable:discoverCodex(),home}),normalized=normalizeCodex(raw.limits,raw.account.planType);
  const report={kind:'read-only-local-codex-observation',at:new Date().toISOString(),ok:true,plan:raw.account.planType,officialClientVersion:raw.serverVersion,quotaWindows:normalized.windows.length,allQuotaPercentagesValid:normalized.windows.every(w=>w.remainingPercent>=0&&w.remainingPercent<=100),modelCalls:false,credentialsExported:false,conversationContentExported:false,realClaudeAccount:false,metadata:{sampledFiles:0,supportedFiles:0,unsupportedFiles:0,hasReportedTokens:false}};
  const sessions=path.join(home,'sessions');
  const files=fs.readdirSync(sessions,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()&&/^rollout-.*\.jsonl$/.test(e.name)).map(e=>path.join(e.parentPath,e.name)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs).slice(0,2);
  for(const file of files){report.metadata.sampledFiles++;try{const rows=readFile(file,'verification-only');report.metadata.supportedFiles++;report.metadata.hasReportedTokens ||= rows.some(r=>r.total>0);}catch{report.metadata.unsupportedFiles++;}}
  fs.writeFileSync(path.join(root,'docs/verification-1.5.0/codex-live.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
})().catch(()=>{console.error('Local read-only validation could not complete. No raw diagnostics were exported.');process.exitCode=1;});
