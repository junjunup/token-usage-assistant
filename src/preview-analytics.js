import {aggregateLocal,rangeFor} from './generated/analytics-core.js';
import {sampleRows,samplePrices} from './generated/analytics-fixture.js';
export const demoPrices=samplePrices();
export function demoAnalytics(query,state){
  const now=Date.now(),billingStart=new Date(new Date(now).getFullYear(),new Date(now).getMonth(),1).getTime(),range=rangeFor(query.range,now,state.hasCredential?billingStart:null);
  if(!range.start)return {source:query.source,range,status:'unavailable',message:range.reason};
  if(new URLSearchParams(location.search).get('desktop-preview')==='empty')return {source:query.source,range,status:query.source==='local'?'missing':'unconfigured',message:query.source==='local'?'未找到本机 Zcode 用量数据库。':'连接账户后开始统计。'};
  const report=aggregateLocal(sampleRows(now),range,query,query.source==='local'?demoPrices:samplePrices());
  const common={status:'ready',updatedAt:now,creditUpdatedAt:now,sourceFile:'示例数据',prices:demoPrices,credits:{monthly:175.4,purchased:24.8,free:0},prediction:{available:true,minutes:25,tokensPerMinute:21400,costPerHour:3.42,purchasedAvailable:true,windows:[{key:'five',status:'after-reset',resetAt:now+8314000},{key:'week',status:'before-reset',minutesToCap:186,resetAt:now+223200000}]}};
  if(query.source==='local')return {...report,...common};
  return {...report,...common,source:'account',models:[],projects:[],sessions:[],sampled:true,historyStart:now-8*86400000,summary:{...report.summary,successRate:report.summary.requests?report.summary.completed/report.summary.requests*100:null,averageTokens:report.summary.requests?report.summary.total/report.summary.requests:null,averageCost:report.summary.requests?report.summary.cost/report.summary.requests:null,scope:'range',periodStart:range.start,periodEnd:now,funding:{monthly:report.summary.cost*.72,purchased:report.summary.cost*.23,free:report.summary.cost*.05}}};
}
