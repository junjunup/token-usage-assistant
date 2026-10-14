const test=require('node:test');
const assert=require('node:assert/strict');
const {rangeFor,priceKey}=require('../desktop/analytics-core.cjs');
const {normalizeZcodeRecord,normalizeHarnessRecord,aggregateTools}=require('../desktop/tool-analytics.cjs');
const now=new Date(2026,8,24,12).getTime(),range=rangeFor('today',now),key=priceKey('deepseek','deepseek-chat');
const prices={[key]:{input:1,read:.1,write:2,output:3}};
const z=(patch={})=>normalizeZcodeRecord({id:'z1',started_at:now-60000,session_id:'session-1',directory:'D:/project-a',provider_id:'deepseek',model_id:'deepseek-chat',status:'completed',input_tokens:100,output_tokens:20,cache_read_input_tokens:40,cache_creation_input_tokens:10,computed_total_tokens:120,...patch},'z-source');
const wire=(patch={})=>({schema:'token-usage-assistant.harness',schemaVersion:1,sourceId:'export-source',tool:'deepseek-harness',harnessVersion:'0.1.7-rc.1',exporterVersion:'1.4.0',sessionId:'session-1',requestId:'session-1:turn1:step1',attemptId:'session-1:turn1:step1:4',revision:8,timestamp:now-60000,updatedAt:now-1000,provider:'deepseek',model:'deepseek-chat',project:'D:/project-a',status:'completed',usage:{uncachedInputTokens:50,outputTokens:20,cacheReadTokens:40,cacheWriteTokens:10,reasoningTokens:5,totalTokens:null},usageReported:true,coverageStart:now-3600000,provenance:'harness-plugin/provider-reported',accountId:null,...patch});
const h=(patch={})=>normalizeHarnessRecord(wire(patch),'h-source');
const report=(id,patch={})=>({id,kind:id==='z-source'?'zcode':'deepseek-harness',label:id,status:'ready',lastSuccessAt:now,coverage:{start:now-60000,end:now-1000,complete:false},...patch});
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('tool normalizers whitelist metadata and never assign the selected platform account',()=>{
  const a=z({raw_usage_json:'PRIVATE_TEXT',error_message:'PRIVATE_KEY',prompt:'PRIVATE_PROMPT'}),b=h({secret:'PRIVATE_KEY',message:{content:'PRIVATE_TEXT'},accountId:'UNTRUSTED_ACCOUNT'});
  assert.equal(a.accountId,null);assert.equal(b.accountId,null);assert.equal(a.provenance,'zcode-sqlite/reported-metadata');assert.equal(b.provenance,'harness-plugin/provider-reported');
  assert.equal(JSON.stringify([a,b]).includes('PRIVATE'),false);assert.equal(JSON.stringify([a,b]).includes('UNTRUSTED'),false);
  assert.equal(a.session,JSON.stringify(['z-source','session-1']));assert.notEqual(a.session,b.session);
});
test('Harness partitions uncached input and cache, and reasoning stays inside output',()=>{
  const r=h();assert.equal(r.input,100);assert.equal(r.total,120);assert.equal(r.reasoning,5);assert.equal(r.fresh,50);
  const s=aggregateTools([r],range,{},prices).summary;assert.equal(s.total,120);assert.equal(s.cache.input,100);assert.equal(s.cache.read,40);approx(s.cost,(50+4+20+60)/1e6);assert.equal(s.currency,'USD');
});
test('failed and cancelled attempts with reported usage count tokens independently from completion statistics',()=>{
  const rows=[z(),h({status:'failed'}),h({attemptId:'cancel',status:'cancelled',usage:{uncachedInputTokens:10,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:5,reasoningTokens:null,totalTokens:null}})];
  const s=aggregateTools(rows,range,{},prices).summary;
  assert.equal(s.requests,3);assert.equal(s.completed,1);assert.equal(s.failed,1);assert.equal(s.cancelled,1);assert.equal(s.reportedRequests,3);assert.equal(s.total,255);assert.equal(s.averageTokens,120);assert.equal(s.successRate,50);assert.equal(s.pricedRequests,3);assert.equal(s.cache.requests,3);assert.equal(s.tokenBasis,'reported-usage');
});
test('absent usage remains unknown, including empty reports and zero-token reported attempts',()=>{
  const absent=h({attemptId:'unknown',usageReported:false,usage:{}}),zero=h({attemptId:'zero',usage:{uncachedInputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:0,totalTokens:0,reasoningTokens:0}});
  const s=aggregateTools([z(),absent],range,{},prices).summary;assert.equal(s.total,null);assert.equal(s.knownTokens,120);assert.equal(s.reportedRequests,1);assert.equal(s.missingUsageRequests,1);assert.equal(s.missingTokenRequests,1);assert.equal(s.cost,null);
  const zs=aggregateTools([zero],range,{},prices).summary;assert.equal(zs.total,0);assert.equal(zs.cost,0);assert.equal(zs.reportedRequests,1);assert.equal(zs.cache.hitRate,null);
  assert.equal(aggregateTools([],range).summary.total,null);assert.equal(aggregateTools([],range).bins[0].tokens,null);
});
test('partial token fields are not silently zero-filled and estimates require an exact partition',()=>{
  const a=h({usage:{uncachedInputTokens:10,outputTokens:5,cacheReadTokens:null,cacheWriteTokens:0,totalTokens:30,reasoningTokens:null}}),b=z({id:'partial',output_tokens:null});
  assert.equal(a.input,null);assert.equal(a.total,30);assert.equal(a.cacheKnown,false);
  const s=aggregateTools([a,b],range,{},prices).summary;assert.equal(s.input,null);assert.equal(s.total,150);assert.equal(s.output,null);assert.equal(s.cost,null);assert.equal(s.cache.requests,1);
  const missing=h({usage:{uncachedInputTokens:10,outputTokens:5}});assert.equal(missing.total,null);assert.equal(missing.input,null);assert.equal(aggregateTools([missing],range).summary.missingTokenRequests,1);
});
test('inconsistent token subsets or totals produce unknown values and no fabricated estimate',()=>{
  const cache=z({cache_read_input_tokens:100,cache_creation_input_tokens:10}),total=z({computed_total_tokens:99}),reasoning=h({usage:{uncachedInputTokens:50,outputTokens:20,cacheReadTokens:40,cacheWriteTokens:10,reasoningTokens:30,totalTokens:null}});
  assert.equal(cache.cacheKnown,false);assert.equal(cache.invalidUsage,true);assert.equal(total.total,null);assert.equal(reasoning.reasoning,null);assert.equal(reasoning.total,120);
  const s=aggregateTools([cache,reasoning],range,{},prices).summary;assert.equal(s.pricedRequests,0);assert.equal(s.invalidUsageRequests,2);
});
test('stream updates replace the same attempt, retries count separately, replay order is stable',()=>{
  const stream=h({revision:4,status:'pending',updatedAt:now-5000,usage:{uncachedInputTokens:10,outputTokens:1,cacheReadTokens:0,cacheWriteTokens:0,totalTokens:null,reasoningTokens:null}}),final=h(),retry=h({attemptId:'retry-attempt',revision:15,status:'failed'});
  for(const rows of [[stream,final,stream,final,retry],[retry,final,stream,final]]){const s=aggregateTools(rows,range,{},prices).summary;assert.equal(s.requests,2);assert.equal(s.total,240);assert.equal(s.completed,1);assert.equal(s.failed,1);}
});
test('terminal status-only records retain the latest usage regardless of import order',()=>{
  const terminal=h({revision:10,status:'cancelled',usageReported:false,usage:{}}),usage=h({revision:9,status:'pending'});
  for(const rows of [[usage,terminal],[terminal,usage]]){const s=aggregateTools(rows,range,{},prices).summary;assert.equal(s.cancelled,1);assert.equal(s.total,120);assert.equal(s.reportedRequests,1);}
});
test('sessions and attempt identities stay isolated across tools, with consistent filtering',()=>{
  const rows=[z(),h(),h({attemptId:'other',sessionId:'session-2',model:'model-other',project:'D:/project-b'})];
  const all=aggregateTools(rows,range,{},prices,[report('z-source'),report('h-source')]);assert.equal(all.summary.requests,3);assert.equal(all.sessions.length,3);assert.equal(all.models.length,2);
  const filtered=aggregateTools(rows,range,{session:h().session,model:key,project:'D:/project-a'},prices);assert.equal(filtered.summary.requests,1);assert.equal(filtered.models[0].requests,1);assert.equal(filtered.projects[0].requests,1);assert.equal(filtered.bins.reduce((n,b)=>n+(b.requests||0),0),1);assert.equal(filtered.options.models.length,2);assert.equal(filtered.options.projects.length,2);
  const single=aggregateTools(rows,range,{sourceIds:['z-source']},prices,[report('z-source'),report('h-source')]);assert.equal(single.summary.requests,1);assert.equal(single.sourceReports.length,1);assert.equal(single.options.models.length,1);
});
test('observed metadata does not prove full coverage or enable a fabricated period comparison',()=>{
  const rows=[z(),z({id:'previous',started_at:range.start-1000})],r=aggregateTools(rows,range,{},prices,[report('z-source')]);
  assert.equal(r.previous,null);assert.equal(r.comparison.available,false);assert.equal(r.coverage.complete,false);assert.equal(r.coverage.start,now-60000);assert.equal(r.partial,true);assert.equal(r.bins.every(b=>b.coverageMs===0),true);
  const complete=report('z-source',{coverage:{start:range.start-(range.end-range.start),end:range.end,complete:true}}),full=aggregateTools(rows,range,{},prices,[complete]);assert.equal(full.comparison.available,true);assert.equal(full.previous.total,120);assert.equal(full.coverage.complete,true);
  assert.equal(aggregateTools(rows,range,{},prices,[{...complete,truncated:true}]).previous,null);
  const partial=aggregateTools(rows,range,{},prices,[complete,report('missing',{status:'missing'})]);assert.deepEqual(partial.missing.sourceIds,['missing']);assert.equal(partial.previous,null);
});
test('currencies remain explicit, mixed estimates are grouped without implicit exchange or summed totals',()=>{
  const otherKey=priceKey('deepseek','model-cny'),p={...prices,[otherKey]:{input:7,output:20,read:1,write:8,currency:'CNY'}},r=aggregateTools([z(),h({model:'model-cny'})],range,{},p),s=r.summary;
  assert.equal(r.prices[key].currency,'USD');assert.equal(s.cost,null);assert.equal(s.knownCost,null);assert.equal(s.currency,null);assert.ok(s.costsByCurrency.USD.knownCost>0);assert.ok(s.costsByCurrency.CNY.knownCost>0);assert.equal(s.cache.estimatedSavings,null);assert.equal(s.cache.currency,null);assert.deepEqual(Object.keys(s.cache.savingsByCurrency).sort(),['CNY','USD']);assert.equal(r.bins.find(b=>b.requests===2).cost,null);
  const separated=aggregateTools([z(),h({model:'model-cny',timestamp:now-2*3600000})],range,{},p);assert.equal(separated.bins.every(b=>b.cost===null),true);
});
test('unknown model prices remain partial instead of treating unpriced requests as free',()=>{
  const s=aggregateTools([z(),h({model:'unknown-price'})],range,{},prices).summary;assert.equal(s.cost,null);assert.ok(s.knownCost>0);assert.equal(s.pricedRequests,1);assert.equal(s.unpricedRequests,1);assert.equal(s.costsByCurrency.USD.cost,null);assert.equal(s.costsByCurrency.USD.partial,true);
});
test('unsupported Harness version, schema and non-count values fail explicitly without raw error data',()=>{
  for(const patch of [{schemaVersion:2},{harnessVersion:'future'},{revision:-1},{timestamp:null},{status:'future-status'},{usageReported:false},{usage:{outputTokens:'SECRET'}},{usage:{outputTokens:-1}}])assert.throws(()=>h(patch),e=>e.code==='UNSUPPORTED_HARNESS_FORMAT'&&!e.message.includes('SECRET'));
});
test('long stable identities remain distinct and oversized identities fail explicitly',()=>{
  const session='s'.repeat(2048),prefix='a'.repeat(2100),a=h({sessionId:session,attemptId:prefix+'1'}),b=h({sessionId:session,attemptId:prefix+'2'});
  assert.equal(a.sessionId,session);assert.equal(a.attemptId,prefix+'1');assert.notEqual(a.id,b.id);assert.equal(aggregateTools([a,b],range).summary.requests,2);
  assert.throws(()=>h({attemptId:'a'.repeat(8193)}),e=>e.code==='UNSUPPORTED_HARNESS_FORMAT');
});
test('100,000 metadata attempts aggregate without recursive or spread-stack limits',()=>{
  const rows=Array.from({length:100000},(_,i)=>z({id:`load-${i}`,session_id:`session-${i%100}`,started_at:range.start+1000+i,status:i%10===0?'failed':'completed'}));
  const r=aggregateTools(rows,range,{},prices,[report('z-source')]);assert.equal(r.summary.requests,100000);assert.equal(r.summary.total,12000000);assert.equal(r.summary.failed,10000);assert.equal(r.sessions.length,100);assert.equal(r.bins.reduce((n,b)=>n+(b.requests||0),0),100000);
});

test('empty source selection means all enabled inputs rather than no data',()=>{const rows=[z(),h()];const r=aggregateTools(rows,range,{sourceIds:[]},prices,[report('z-source'),report('h-source')]);assert.equal(r.summary.requests,2);assert.equal(r.sourceReports.length,2);});
