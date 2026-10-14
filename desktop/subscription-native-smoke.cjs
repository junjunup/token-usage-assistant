// Runs only in a fresh --smoke-test profile; all accounts and calls are synthetic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {SubscriptionClient}=require('./subscriptions.cjs');
const {ClaudeCollector}=require('./claude-collector.cjs');
const {connectCodex}=require('./codex-connect.cjs');
async function until(win,expression){const end=Date.now()+6000;while(Date.now()<end){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,40));}throw new Error('subscription renderer did not settle: '+expression);}
async function capture(win,file){await win.webContents.executeJavaScript('document.getAnimations().forEach(a=>{try{a.finish()}catch{}})');await win.webContents.capturePage();await new Promise(r=>setTimeout(r,180));fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());}
async function runSubscriptionSmoke({accounts,toolSources,analytics,store,mainWindow,widgetWindow,settings,applySettings}){
  const checks={},now=Date.now(),oldFactory=accounts.clientFactory,home=store.file('codex-fixture');fs.mkdirSync(path.join(home,'sessions'),{recursive:true});
  const tokens={input_tokens:100,cached_input_tokens:30,cache_write_input_tokens:5,output_tokens:20,reasoning_output_tokens:5,total_tokens:120};
  fs.writeFileSync(path.join(home,'sessions','rollout-synthetic.jsonl'),[
    {timestamp:new Date(now-3000).toISOString(),type:'session_meta',payload:{id:'native-codex',cwd:'D:/Synthetic/Codex',cli_version:'0.155.0-alpha.16.4',instructions:'PRIVATE_NOT_EXPORTED'}},
    {timestamp:new Date(now-2500).toISOString(),type:'turn_context',payload:{model:'codex-test'}},
    {timestamp:new Date(now-2000).toISOString(),type:'event_msg',payload:{type:'token_count',info:{total_token_usage:tokens,last_token_usage:tokens}}}
  ].map(x=>JSON.stringify(x)).join('\n')+'\n');
  const collector=new ClaudeCollector(store.file('claude-fixture'));await collector.start();collector.generateLauncher();
  try{
    accounts.clientFactory=(p,r)=>p==='codex'?new SubscriptionClient('codex',{read:async()=>({account:{email:'synthetic@example.test',planType:'pro'},limits:{rateLimitsByLimitId:{codex:{primary:{usedPercent:23,windowDurationMins:300,resetsAt:Math.floor(now/1000)+1800},secondary:{usedPercent:42,windowDurationMins:10080,resetsAt:Math.floor(now/1000)+30000}}}}})}):oldFactory(p,r);
    const executable=path.join(home,'codex.exe');fs.writeFileSync(executable,'synthetic: never executed',{mode:0o700});
    const discovery={env:{CODEX_HOME:home},userHome:store.file('synthetic-user'),findExecutable:()=>executable,checkProgram:async c=>{assert.equal(c.executable,executable);checks.programPreflightInvoked=true;return {serverVersion:'synthetic'};},chooseHome:()=>{throw Error('Unexpected folder picker');},chooseExecutable:()=>{throw Error('Unexpected executable picker');}};
    await connectCodex({provider:'codex',label:'GPT Pro native fixture'},{accounts,tools:toolSources,...discovery});checks.autoConnectWithoutPicker=true;
    await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"用量总览\"]').click()");
    await until(mainWindow,"document.querySelector('.provider-dashboard')?.textContent.includes('ChatGPT pro')");
    await until(widgetWindow,"document.querySelector('.provider-widget-account')?.textContent.includes('GPT Pro native fixture')");
    assert.equal(accounts.active.monitor.state.parts.credits.windows.length,2);checks.codexQuotaAndWidget=true;
    await capture(mainWindow,store.file('subscription-codex-dark.png'));
    const source=toolSources.entries.find(s=>s.kind==='codex'&&s.file===home);
    await accounts.connect({provider:'claude',home:collector.home,label:'Claude native fixture'});
    await until(mainWindow,"document.querySelector('.local-connection-status')?.textContent.includes('组件已就绪 · 等待首次额度')");
    await until(widgetWindow,"document.querySelector('.provider-widget-account')?.textContent.includes('等待首次额度')");checks.claudeWaitingBeforeFirstQuota=true;
    assert.equal(await mainWindow.webContents.executeJavaScript("document.querySelector('.provider-quota-panel .analysis-note').textContent.includes('最近观察值')"),false);
    await capture(mainWindow,store.file('subscription-claude-waiting.png'));
    const input={session_id:'native-claude',version:'2.1.251',workspace:{current_dir:'D:/Synthetic/Claude'},rate_limits:{five_hour:{used_percentage:40,resets_at:now/1000+3000},seven_day:{used_percentage:10,resets_at:now/1000+5000}},transcript_path:'PRIVATE_DO_NOT_OPEN',prompt:'PRIVATE_NOT_EXPORTED'};
    await new Promise((resolve,reject)=>{const child=spawn(process.platform==='darwin'?process.execPath:'powershell.exe',process.platform==='darwin'?[path.join(collector.home,'StatusLine.cjs')]:['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(collector.home,'StatusLine.ps1')],{env:{...process.env,...(process.platform==='darwin'?{ELECTRON_RUN_AS_NODE:'1'}:{})},windowsHide:true,stdio:['pipe','pipe','pipe']});const timeout=setTimeout(()=>{child.kill();reject(new Error('statusline timeout'));},6000);child.stdout.resume();child.stderr.resume();child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('statusline failed'));});child.stdin.end(JSON.stringify(input));});
    assert.ok(fs.existsSync(path.join(collector.home,'quota.json')));checks[process.platform==='darwin'?'actualMacComponent':'actualPowerShellComponent']=true;
    await accounts.connect({provider:'claude',home:collector.home,label:'Claude native fixture'});
    await until(mainWindow,"document.querySelector('.provider-dashboard')?.textContent.includes('Claude 本机订阅观察')");
    assert.equal(accounts.active.monitor.state.parts.credits.windows[0].remainingPercent,60);checks.claudeQuota=true;
    const attrs={'event.name':'api_request','event.timestamp':new Date(now-1000).toISOString(),'session.id':'native-claude',request_id:'synthetic-request',model:'claude-test',input_tokens:10,output_tokens:5,cache_read_tokens:20,cache_creation_tokens:3,apiKey:'PRIVATE_NOT_EXPORTED'};
    const body={resourceLogs:[{scopeLogs:[{logRecords:[{attributes:Object.entries(attrs).map(([key,value])=>({key,value:typeof value==='number'?{intValue:String(value)}:{stringValue:value}}))}]}]}]};
    for(let i=0;i<2;i++){const res=await fetch('http://127.0.0.1:'+collector.config.port+'/v1/logs',{method:'POST',headers:{'Content-Type':'application/json','x-tua-token':collector.config.token},body:JSON.stringify(body)});assert.equal(res.status,200);}
    const claudeSource=toolSources.add({kind:'claude-code',file:path.join(collector.home,'usage.jsonl'),label:'Claude Code native fixture'});
    const r=await analytics.get({source:'tools',range:'today',sourceIds:[source.id,claudeSource.id]});assert.equal(r.summary.total,158);assert.equal(r.summary.requests,2);assert.equal(r.summary.completed,1);assert.equal(r.models.length,2);assert.equal(r.accountId,null);checks.nativeWorkerTotals=true;checks.replayDeduplication=true;checks.independentAccount=true;
    await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"用量分析\"]').click()");
    await until(mainWindow,"document.querySelectorAll('.analysis-source-picker input').length===4 && document.querySelector('.analysis-stats') && !document.querySelector('.analysis-loading')");
    await until(mainWindow,"document.querySelector('.analytics-page').textContent.includes('记录数不等于请求次数')");checks.fourToolSelector=true;
    await capture(mainWindow,store.file('subscription-tools-dark.png'));
    await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"账户与设置\"]').click()");
    await until(mainWindow,"document.querySelectorAll('.tool-source-row').length===4");
    await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"选择平台\"]').click()");
    await until(mainWindow,"[...document.querySelectorAll('[role=option]')].some(x=>x.textContent.includes('ChatGPT'))");
    await mainWindow.webContents.executeJavaScript("[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.includes('ChatGPT')).click()");
    await until(mainWindow,"!document.querySelector('#api-key') && document.querySelector('.connection-panel').textContent.includes('连接本机 Codex')");checks.noApiKeyField=true;
    applySettings({...settings,theme:'light'});await until(mainWindow,"!document.querySelector('.native-app.dark')");
    await capture(mainWindow,store.file('subscription-settings-light.png'));checks.lightDark=true;
    // Replace only this isolated smoke profile's connector with synthetic dependencies.
    // Exercise the real packaged React form, IPC result handling and discovery module.
    const {ipcMain}=require('electron'),otherHome=store.file('codex-no-history');fs.mkdirSync(otherHome);
    ipcMain.removeHandler('assistant:connect');
    ipcMain.handle('assistant:connect',async(event,value)=>{
      assert.equal(event.sender,mainWindow.webContents);
      if(value.manual)return {ok:true,value:{cancelled:true}};
      const result=await connectCodex(value,{accounts,tools:toolSources,...discovery,env:{CODEX_HOME:otherHome}});
      return {ok:true,value:{...result,connectionMessage:result.message}};
    });
    try{
      await mainWindow.webContents.executeJavaScript("[...document.querySelectorAll('.connect-actions button')].find(x=>x.textContent.includes('手动选择目录')).click()");
      await until(mainWindow,"!document.querySelector('.connect-actions button').disabled");
      assert.equal(await mainWindow.webContents.executeJavaScript("!!document.querySelector('.connection-panel') && !document.querySelector('.toast')"),true);checks.manualCancellation=true;
      await mainWindow.webContents.executeJavaScript("document.querySelector('.connect-actions button[type=submit]').click()");
      await until(mainWindow,"!!document.querySelector('button[aria-label=\"选择 Codex 配置\"]')");
      assert.equal(await mainWindow.webContents.executeJavaScript("document.querySelector('.connect-actions button[type=submit]').disabled && !document.querySelector('.toast')"),true);
      await mainWindow.webContents.executeJavaScript("document.querySelector('.codex-profile-choice').scrollIntoView({block:'center',behavior:'instant'})");
      // Let the scroll event finish before opening a menu that closes on page scroll.
      await new Promise(resolve=>setTimeout(resolve,100));
      await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"选择 Codex 配置\"]').click()");
      await until(mainWindow,"document.querySelectorAll('[role=option]').length===2");
      await capture(mainWindow,store.file('subscription-profile-choice-light.png'));
      await mainWindow.webContents.executeJavaScript("(()=>{const b=document.querySelector('button[aria-label=\"选择 Codex 配置\"]');b.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));})()");
      await until(mainWindow,"document.querySelector('[role=option].active')?.textContent.includes('自定义')");
      await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"选择 Codex 配置\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
      await until(mainWindow,"!document.querySelector('.connect-actions button[type=submit]').disabled");
      await mainWindow.webContents.executeJavaScript("document.querySelector('.connect-actions button[type=submit]').click()");
      await until(mainWindow,"!!document.querySelector('.provider-dashboard') && document.querySelector('.local-connection-status')?.textContent.includes('工具明细待添加')");
      await until(mainWindow,"document.querySelector('.toast')?.textContent.includes('额度已同步')");
      assert.equal(accounts.active.entry.credential.home,otherHome);assert.equal(accounts.active.monitor.state.status,'connected');
      checks.profileChoiceAndKeyboard=true;checks.noHistoryQuotaSuccess=true;
      await capture(mainWindow,store.file('subscription-no-history-light.png'));
    }finally{ipcMain.removeHandler('assistant:connect');}
    assert.doesNotMatch(fs.readFileSync(path.join(collector.home,'usage.jsonl'),'utf8'),/PRIVATE/);assert.doesNotMatch(fs.readFileSync(path.join(collector.home,'quota.json'),'utf8'),/PRIVATE/);checks.metadataPrivacy=true;
    return {ok:true,checks,synthetic:true,realClaudeAccount:false,modelCalls:false};
  }finally{accounts.clientFactory=oldFactory;collector.close();}
}
module.exports={runSubscriptionSmoke};
