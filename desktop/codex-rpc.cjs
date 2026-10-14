const path=require('node:path');
const {spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const {codexCandidates,executableFile,toolEnvironment}=require('./platform.cjs');
function failure(message,code){return Object.assign(new Error(message),{publicMessage:message,code});}
function discoverCodexPrograms(options={}){
  const found=codexCandidates(options).map(p=>executableFile(p,options.platform)).filter(Boolean);
  return [...new Set(found)];
}
function discoverCodex(options={}){return discoverCodexPrograms(options)[0]||null;}
const stages={initialize:'初始化', 'account/read':'登录状态读取', 'account/rateLimits/read':'额度读取'};
const incompatible=()=>failure('当前 Codex 程序不支持所需的账户查询协议。请更新官方 Codex，或重新连接并选择 Codex.app（Windows 选择新版 codex.exe）。','codex-program-incompatible');
// Only initialization and two read-only account methods. Never invoke model/login/logout/reset APIs.
async function session({executable,home},{spawnImpl=spawn,timeoutMs=20000,initializeOnly=false}={}){
  if(!path.isAbsolute(executable||'')||!path.isAbsolute(home||''))throw failure('请先选择本机 Codex 程序和配置目录。','codex-location');
  let child;
  try{child=spawnImpl(executable,['app-server','--listen','stdio://'],{cwd:home,env:{...toolEnvironment(),CODEX_HOME:home},windowsHide:true,stdio:['pipe','pipe','pipe']});}
  catch{throw failure('Codex 程序未能启动，请检查程序位置与执行权限。','codex-program-start');}
  let buffer='',stderrTail='',badArguments=false,next=0,closed=false,exited=false,pipeFailed=false,timer,killTimer,stage='initialize',endError;
  const pending=new Map(),decoder=new StringDecoder('utf8');
  const stop=error=>{
    if(closed)return;closed=true;endError=error;clearTimeout(timer);
    for(const p of pending.values())p.reject(error||failure('Codex 查询已结束。','codex-query-ended'));
    pending.clear();stderrTail='';buffer='';
    child.stdin?.end();
    if(!exited){child.kill();killTimer=setTimeout(()=>{if(!exited)child.kill('SIGKILL');},1000);killTimer.unref?.();}
  };
  child.on('exit',()=>{exited=true;clearTimeout(killTimer);});
  child.on('close',code=>{if(!closed)stop(badArguments?incompatible():failure('Codex 程序在'+stages[stage]+'时退出'+(Number.isInteger(code)?'（退出码 '+code+'）':'')+'。请检查官方客户端能否正常运行。','codex-process-exit'));});
  child.on('error',()=>stop(failure('Codex 程序未能启动，请检查程序位置与执行权限。','codex-program-start')));
  // Retain only a short in-memory classifier window. Raw stderr never leaves this module.
  child.stderr?.on('data',data=>{if(closed)return;const text=stderrTail+data.toString('utf8');badArguments ||= /unrecognized (?:option|subcommand)|unexpected argument/i.test(text);stderrTail=text.slice(-256);});
  child.stdin.on('error',()=>{pipeFailed=true;}); // Let close drain stderr before classifying early CLI rejection.
  child.stdout.on('data',data=>{
    if(closed)return;buffer+=decoder.write(data);
    if(buffer.length>4_000_000){stop(failure('Codex 返回的数据过大，已停止本次查询。','codex-protocol'));return;}
    let n;
    while((n=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,n);buffer=buffer.slice(n+1);let msg;try{msg=JSON.parse(line);}catch{continue;}
      if(!msg||typeof msg!=='object'||Array.isArray(msg))continue;
      const p=pending.get(msg.id);if(!p)continue;pending.delete(msg.id);clearTimeout(timer);
      if(msg.error)p.reject([-32601,-32602].includes(msg.error.code)?incompatible():failure('Codex '+stages[stage]+'失败，请在官方客户端检查登录与网络状态。','codex-query-failed'));
      else if(Object.hasOwn(msg,'result'))p.resolve(msg.result);
      else p.reject(failure('Codex 返回了不支持的查询格式，请更新官方客户端。','codex-protocol'));
    }
  });
  const request=(method,params)=>new Promise((resolve,reject)=>{
    if(closed){reject(endError||failure('Codex 查询已结束。','codex-query-ended'));return;}
    stage=method;const id=++next;pending.set(id,{resolve,reject});
    clearTimeout(timer);timer=setTimeout(()=>stop(badArguments?incompatible():pipeFailed?failure('Codex 查询通道已中断，请重新连接官方客户端。','codex-transport'):failure('Codex '+stages[stage]+'超时，请检查官方客户端状态'+(stage==='initialize'?'与版本':'及网络')+'后重试。','codex-query-timeout')),timeoutMs);
    child.stdin.write(JSON.stringify({id,method,params})+'\n',e=>{if(e)pipeFailed=true;});
  });
  try{
    const init=await request('initialize',{clientInfo:{name:'token_usage_assistant',title:'Token 用量助手',version:require('../package.json').version},capabilities:{experimentalApi:false}});
    if(!init||typeof init!=='object'||typeof init.userAgent!=='string')throw failure('Codex 初始化响应格式不支持，请更新官方客户端。','codex-protocol');
    child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    const serverVersion=init.userAgent.slice(0,200);
    if(initializeOnly)return {serverVersion};
    const account=await request('account/read',{refreshToken:false});
    if(account?.account?.type!=='chatgpt')throw failure('当前 Codex 未使用 ChatGPT 套餐登录，请先在官方 Codex 中登录订阅账户。','codex-login-required');
    const limits=await request('account/rateLimits/read',{});
    return {account:account.account,limits,serverVersion};
  }finally{stop();}
}
const readCodexAccount=(credential,options)=>session(credential,options);
const probeCodex=(credential,options={})=>session(credential,{...options,timeoutMs:options.timeoutMs??8000,initializeOnly:true});
module.exports={discoverCodex,discoverCodexPrograms,readCodexAccount,probeCodex};
