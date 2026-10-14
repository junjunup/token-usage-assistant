const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {readCodexAccount,probeCodex}=require(path.join(process.env.TUA_TEST_ASAR||path.resolve(__dirname,'..'),'desktop/codex-rpc.cjs'));
const credential={executable:path.resolve('fixture codex.exe'),home:path.resolve('fixture home')};
function mock(handler){
  const calls=[],child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=0,done=false;
  child.exit=(code=0)=>{if(done)return;done=true;child.emit('exit',code);child.emit('close',code);};
  child.kill=()=>{killed++;child.exit();return true;};
  child.reply=(id,result)=>child.stdout.write(JSON.stringify({id,result})+'\n');
  child.stdin=new Writable({write(data,encoding,cb){const message=JSON.parse(data);calls.push(message);queueMicrotask(()=>handler(message,child));cb();}});
  return {child,calls,get killed(){return killed;},spawnImpl:(exe,args,options)=>{assert.equal(exe,credential.executable);assert.deepEqual(args,['app-server','--listen','stdio://']);assert.equal(options.cwd,credential.home);assert.equal(options.env.CODEX_HOME,credential.home);assert.equal(options.windowsHide,true);return child;}};
}
function normal(msg,child){
  if(msg.method==='initialize')child.reply(msg.id,{userAgent:'codex/0.155.0'});
  if(msg.method==='account/read')child.reply(msg.id,{account:{type:'chatgpt',email:'fixture@example.test',planType:'pro'}});
  if(msg.method==='account/rateLimits/read')child.reply(msg.id,{rateLimits:{primary:{usedPercent:20}}});
}
test('read-only RPC uses the exact handshake and account allowlist and closes once',async()=>{
  const m=mock(normal),r=await readCodexAccount(credential,m);
  assert.equal(r.account.planType,'pro');assert.equal(r.limits.rateLimits.primary.usedPercent,20);
  assert.deepEqual(m.calls.map(m=>m.method),['initialize','initialized','account/read','account/rateLimits/read']);
  assert.deepEqual(m.calls[1].params,{});assert.deepEqual(m.calls[2].params,{refreshToken:false});assert.equal(m.killed,1);
});
test('program preflight initializes only, without reading any account or quota',async()=>{
  const m=mock(normal);assert.equal((await probeCodex(credential,m)).serverVersion,'codex/0.155.0');
  assert.deepEqual(m.calls.map(m=>m.method),['initialize','initialized']);assert.equal(m.killed,1);
});
test('reported old CLI argument rejection exits as incompatible, not timeout; stderr stays private',async()=>{
  const m=mock((msg,c)=>{if(msg.method==='initialize'){c.stdin.emit('error',Error('PRIVATE pipe'));c.stderr.write('PRIVATE /Users/test token unexpected argu');c.stderr.write('ment --listen');c.exit(2);}});
  await assert.rejects(readCodexAccount(credential,m),e=>e.code==='codex-program-incompatible'&&!/PRIVATE|\/Users|超时/.test(e.message));assert.equal(m.killed,0);
});
test('an early process exit without a classifier stays distinct from timeout',async()=>{
  const m=mock((msg,c)=>c.exit(7));await assert.rejects(readCodexAccount(credential,m),e=>e.code==='codex-process-exit'&&e.message.includes('退出码 7')&&!e.message.includes('超时'));
});
test('a genuinely stalled initialization times out and closes the owned child',async()=>{
  const m=mock(()=>{});await assert.rejects(readCodexAccount(credential,{...m,timeoutMs:15}),e=>e.code==='codex-query-timeout'&&e.message.includes('初始化'));assert.equal(m.killed,1);
});
test('timeouts identify the stalled login and quota stages separately',async()=>{
  for(const [method,label] of [['account/read','登录状态读取'],['account/rateLimits/read','额度读取']]){
    const m=mock((msg,c)=>{if(msg.method!==method)normal(msg,c);});await assert.rejects(readCodexAccount(credential,{...m,timeoutMs:15}),e=>e.code==='codex-query-timeout'&&e.message.includes(label));
  }
});
test('each completed stage gets its own timeout budget',async()=>{
  const m=mock((msg,c)=>{setTimeout(()=>normal(msg,c),20);});const r=await readCodexAccount(credential,{...m,timeoutMs:50});assert.equal(r.account.type,'chatgpt');
});
test('spawn failures and error events have a safe startup error',async()=>{
  await assert.rejects(readCodexAccount(credential,{spawnImpl:()=>{throw Error('PRIVATE');}}),e=>e.code==='codex-program-start'&&!e.message.includes('PRIVATE'));
  const m=mock((msg,c)=>c.emit('error',Error('PRIVATE')));await assert.rejects(readCodexAccount(credential,m),e=>e.code==='codex-program-start');
});
test('unsupported account methods preserve version guidance without raw JSON-RPC errors',async()=>{
  const m=mock((msg,c)=>{if(msg.method==='account/read')c.stdout.write(JSON.stringify({id:msg.id,error:{code:-32601,message:'PRIVATE'}})+'\n');else normal(msg,c);});
  await assert.rejects(readCodexAccount(credential,m),e=>e.code==='codex-program-incompatible'&&!e.message.includes('PRIVATE'));
});
test('non-ChatGPT login stops before quota, without login mutation',async()=>{
  const m=mock((msg,c)=>{if(msg.method==='account/read')c.reply(msg.id,{account:{type:'apiKey'}});else normal(msg,c);});await assert.rejects(readCodexAccount(credential,m),e=>e.code==='codex-login-required');
  assert.equal(m.calls.some(m=>m.method==='account/rateLimits/read'),false);
});
test('null, malformed lines and notifications do not crash parsing; UTF8 split replies work',async()=>{
  const m=mock((msg,c)=>{if(msg.method==='initialize'){c.stdout.write('null\n[]\ninvalid\n{"method":"notice"}\n');const b=Buffer.from(JSON.stringify({id:msg.id,result:{userAgent:'codex 中文'}})+'\n');for(const byte of b)c.stdout.write(Buffer.from([byte]));}else normal(msg,c);});
  assert.equal((await readCodexAccount(credential,m)).serverVersion,'codex 中文');
});
test('missing initialize fields and oversized output fail safely',async()=>{
  const m=mock((msg,c)=>c.reply(msg.id,null));await assert.rejects(probeCodex(credential,m),e=>e.code==='codex-protocol');
  const big=mock((msg,c)=>c.stdout.write('x'.repeat(4000001)));await assert.rejects(probeCodex(credential,big),e=>e.code==='codex-protocol');
});
test('network RPC errors identify their stage without exporting raw credentials or bodies',async()=>{
  const m=mock((msg,c)=>{if(msg.method==='account/rateLimits/read')c.stdout.write(JSON.stringify({id:msg.id,error:{code:-32000,message:'PRIVATE key/body'}})+'\n');else normal(msg,c);});
  await assert.rejects(readCodexAccount(credential,m),e=>e.code==='codex-query-failed'&&e.message.includes('额度读取')&&!e.message.includes('PRIVATE'));
});
