const {count}=require('./domain.cjs');
const DAY=86400000;
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const sum=(rows,key)=>rows.reduce((n,r)=>n+(numeric(r[key])?r[key]:0),0);
function rangeFor(id,now=Date.now(),billingStart=null){
  const d=new Date(now);d.setHours(0,0,0,0);let start=d.getTime();
  if(id==='7d'){d.setDate(d.getDate()-6);start=d.getTime();}
  else if(id==='billing'){if(!billingStart||billingStart>now) return {id,label:'本账期',start:null,end:now,reason:'连接账户并确认账期后可查看'};start=billingStart;}
  else if(id!=='today')throw new Error('不支持的时间范围');
  return {id,label:{today:'今日','7d':'近 7 天',billing:'本账期'}[id],start,end:now,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
}
function makeBins(range){
  if(!range.start)return [];const bins=[],d=new Date(range.start);const hourly=range.id==='today';
  if(!hourly)d.setHours(0,0,0,0);else d.setMinutes(0,0,0);
  for(let i=0;d.getTime()<=range.end&&i<400;i++){
    const from=d.getTime(),label=hourly?`${String(d.getHours()).padStart(2,'0')}:00`:`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    if(hourly)d.setHours(d.getHours()+1);else d.setDate(d.getDate()+1);
    bins.push({from,to:d.getTime(),label,tokens:null,cost:null,requests:null,input:null,output:null,coverageMs:0});
  }return bins;
}
function priceKey(provider,model){return JSON.stringify([provider||'unknown',model||'unknown']);}
function validatePrice(value){
  if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['input','output','read','write','currency'].includes(k))||(value.currency!==undefined&&!['USD','CNY'].includes(value.currency)))throw new Error('单价格式不正确');
  const p={};for(const key of ['input','output','read','write']){if(!numeric(value[key])||value[key]<0||value[key]>1000000)throw new Error('单价应为非负数');p[key]=value[key];}if(value.currency!==undefined)p.currency=value.currency;return p;
}
function normalizeRecord(r){
  const input=count(r.input_tokens),output=count(r.output_tokens);
  const rawRead=count(r.cache_read_input_tokens),rawWrite=count(r.cache_creation_input_tokens);
  const cacheKnown=input!==null&&rawRead!==null&&rawWrite!==null&&rawRead+rawWrite<=input;
  const read=cacheKnown?Math.min(input,rawRead):null,write=cacheKnown?Math.min(input-read,rawWrite):null;
  const base=input!==null&&output!==null?input+output:null,total=base===null?null:Math.max(base,count(r.computed_total_tokens)||0);
  const provider=String(r.provider_id||'unknown'),model=String(r.model_id||'unknown');
  return {id:String(r.id),at:Number(r.started_at),status:String(r.status),session:String(r.session_id||'unknown'),project:String(r.directory||'未关联项目'),provider,model,modelKey:priceKey(provider,model),input,output,total,read,write,fresh:cacheKnown?input-read-write:null,cacheKnown,extra:base!==null?total-base:null};
}
function costFor(r,prices){
  const p=prices[r.modelKey];if(!p||!r.cacheKnown||r.output===null||r.extra>0)return null;
  return (r.fresh*p.input+r.output*p.output+r.read*p.read+r.write*p.write)/1e6;
}
function summarizeRecords(rows,prices={}){
  const done=rows.filter(r=>r.status==='completed'),failed=rows.filter(r=>['error','failed'].includes(r.status)).length,cancelled=rows.filter(r=>['cancelled','canceled'].includes(r.status)).length;
  const completed=done.length,tokenKnown=done.filter(r=>numeric(r.total)),cacheRows=done.filter(r=>r.cacheKnown),priced=done.filter(r=>numeric(r.cost));
  const input=sum(tokenKnown,'input'),output=sum(tokenKnown,'output'),total=sum(tokenKnown,'total'),knownCost=sum(priced,'cost');
  const denominator=completed+failed,cacheInput=sum(cacheRows,'input'),read=sum(cacheRows,'read'),write=sum(cacheRows,'write'),fresh=sum(cacheRows,'fresh');
  return {requests:rows.length,completed,failed,cancelled,pending:rows.length-completed-failed-cancelled,successRate:denominator?completed/denominator*100:null,
    input:tokenKnown.length===completed?input:null,output:tokenKnown.length===completed?output:null,total:tokenKnown.length===completed?total:null,
    knownTokens:total,missingTokenRequests:completed-tokenKnown.length,cost:priced.length===completed?knownCost:null,knownCost,pricedRequests:priced.length,unpricedRequests:completed-priced.length,
    averageTokens:completed&&tokenKnown.length===completed?total/completed:null,averageCost:completed&&priced.length===completed?knownCost/completed:null,
    cache:{input:cacheInput,read,write,fresh,coverage:completed?cacheRows.length/completed*100:null,requests:cacheRows.length,missing:completed-cacheRows.length,hitRate:cacheInput?read/cacheInput*100:null,
      estimatedSavings:cacheRows.length&&cacheRows.every(r=>prices[r.modelKey])?cacheRows.reduce((n,r)=>n+r.read*(prices[r.modelKey].input-prices[r.modelKey].read)/1e6,0):null},scope:'local'};
}
function grouped(rows,key,prices){const map=new Map();for(const r of rows){const id=r[key];if(!map.has(id))map.set(id,[]);map.get(id).push(r);}return [...map].map(([id,records])=>({id,model:records[0].model,provider:records[0].provider,project:records[0].project,first:records.reduce((n,r)=>Math.min(n,r.at),Infinity),last:records.reduce((n,r)=>Math.max(n,r.at),-Infinity),...summarizeRecords(records,prices)})).sort((a,b)=>b.knownTokens-a.knownTokens);}
function aggregateLocal(raw,range,filters={},prices={}){
  const rows=raw.map(normalizeRecord).filter(r=>Number.isFinite(r.at)&&r.at<=range.end).map(r=>({...r,cost:r.status==='completed'?costFor(r,prices):null}));
  const inRange=rows.filter(r=>r.at>=range.start);
  const options={models:grouped(inRange,'modelKey',prices).map(r=>({id:r.id,name:r.model,provider:r.provider})),projects:[...new Set(inRange.map(r=>r.project))].sort()};
  const match=r=>(!filters.model||r.modelKey===filters.model)&&(!filters.project||r.project===filters.project)&&(!filters.session||r.session===filters.session);
  const current=inRange.filter(match),previous=rows.filter(r=>r.at<range.start&&r.at>=range.start-(range.end-range.start)&&match(r));
  const bins=makeBins(range);for(const bin of bins){const slice=current.filter(r=>r.at>=bin.from&&r.at<bin.to),s=summarizeRecords(slice,prices);Object.assign(bin,{tokens:s.total,requests:s.requests,cost:s.cost,input:s.input,output:s.output,knownCost:s.knownCost,unpricedRequests:s.unpricedRequests,coverageMs:Math.min(bin.to,range.end)-Math.max(bin.from,range.start)});}
  return {range,source:'local',summary:summarizeRecords(current,prices),previous:summarizeRecords(previous,prices),bins,models:grouped(current,'modelKey',prices),projects:grouped(current,'project',prices),sessions:grouped(current,'session',prices),options,
    localRate:{tokensPerMinute:sum(current.filter(r=>r.status==='completed'&&r.at>=range.end-30*60000),'total')/30,windowMinutes:30},prices};
}
function accountBins(records,range,maxGap=5*60000){
  const bins=makeBins(range),samples=records.filter(r=>r.summary&&numeric(r.summary.total));
  for(let i=1;i<samples.length;i++){
    const a=samples[i-1],b=samples[i],dt=b.t-a.t;
    if(dt<=0||dt>maxGap||a.summary.periodStart!==b.summary.periodStart||a.t<range.start||b.t>range.end)continue;
    const bin=bins.find(x=>a.t>=x.from&&b.t<x.to);if(!bin)continue;
    for(const [field,key] of [['tokens','total'],['cost','cost'],['requests','requests'],['input','input'],['output','output']]){
      if(numeric(a.summary[key])&&numeric(b.summary[key])&&b.summary[key]>=a.summary[key])bin[field]=(bin[field]??0)+b.summary[key]-a.summary[key];
    }bin.coverageMs+=dt;
  }return bins;
}
function continuousTail(records,now,intervalMs=60000){
  const points=records.filter(r=>r.t>=now-30*60000&&r.t<=now),tail=[];
  for(let i=points.length-1;i>=0;i--){if(tail.length&&tail[0].t-points[i].t>Math.max(3*intervalMs,180000))break;tail.unshift(points[i]);}
  if(tail.length<3||now-tail.at(-1).t>Math.max(2*intervalMs,120000)||tail.at(-1).t-tail[0].t<10*60000)return [];
  return tail;
}
function forecast(records,now=Date.now(),interval=60){
  const tail=continuousTail(records,now,interval*1000);if(!tail.length)return {available:false,reason:'需要至少 10 分钟连续且新鲜的账户采样',windows:[]};
  const a=tail[0],b=tail.at(-1),minutes=(b.t-a.t)/60000,valid=a.summary&&b.summary&&a.summary.periodStart===b.summary.periodStart;
  const rate=key=>valid&&numeric(a.summary[key])&&numeric(b.summary[key])&&b.summary[key]>=a.summary[key]?(b.summary[key]-a.summary[key])/minutes:null;
  const windows=['five','week'].map(key=>{
    const eligible=tail.filter(r=>r.credits&&r.creditAt===r.t),end=eligible.at(-1),last=end?.credits[key];
    if(!last||!last.cap||!last.resetAt||last.resetAt<=now||now-end.t>Math.max(2*interval*1000,120000))return {key,status:'insufficient'};
    const start=eligible.find(r=>r.credits[key]?.cap===last.cap&&r.credits[key]?.resetAt===last.resetAt&&end.t-r.t>=10*60000);
    if(!start)return {key,status:'insufficient'};
    const first=start.credits[key],minutes=(end.t-start.t)/60000,delta=last.used-first.used;
    if(!numeric(first.used)||!numeric(last.used)||!numeric(delta)||delta<0)return {key,status:'insufficient'};
    const perMinute=delta/minutes,remaining=Math.max(0,last.cap-last.used),minutesToCap=perMinute>0?remaining/perMinute:null;
    return {key,perMinute,remaining,minutesToCap,resetAt:last.resetAt,status:remaining===0?'at-limit':perMinute===0?'idle':now+minutesToCap*60000<last.resetAt?'before-reset':'after-reset'};
  });return {available:true,minutes,tokensPerMinute:rate('total'),costPerHour:rate('cost')===null?null:rate('cost')*60,windows,purchasedAvailable:(b.credits?.purchased||0)>0,asOf:b.t};
}
module.exports={DAY,numeric,rangeFor,makeBins,priceKey,validatePrice,normalizeRecord,costFor,summarizeRecords,aggregateLocal,accountBins,continuousTail,forecast};
