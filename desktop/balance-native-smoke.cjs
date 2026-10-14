// Only loaded by --smoke-test. Uses synthetic responses and an isolated encrypted vault.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {ipcMain}=require('electron');
const {createClient}=require('./providers.cjs');
const {AccountManager}=require('./accounts.cjs');
async function until(win,expression){const end=Date.now()+5000;while(Date.now()<end){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,35));}throw Error('Balance view did not settle: '+expression);}
async function capture(win,file){await win.webContents.capturePage();await new Promise(r=>setTimeout(r,180));fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());}
async function runBalanceSmoke({accounts,analytics,store,mainWindow,widgetWindow,settings,applySettings}){
  const oldFactory=accounts.clientFactory,checks={};let scenario='multi',requests=0;
  const raw=()=>({is_available:scenario!=='zero',balance_infos:scenario==='empty'?[]:scenario==='zero'?[{currency:'CNY',total_balance:'0',granted_balance:'0',topped_up_balance:'0'}]:[{currency:'CNY',total_balance:'110.000001',granted_balance:'10.000001',topped_up_balance:'100.00'},{currency:'USD',total_balance:'5.125',granted_balance:'0.125',topped_up_balance:'5.00'}]});
  accounts.clientFactory=(p,r)=>p==='deepseek'?createClient(p,r,async(url,options)=>{requests++;assert.equal(url,'https://api.deepseek.com/user/balance');assert.equal(options.method,'GET');return new Response(JSON.stringify(scenario==='auth'?{error:'PRIVATE_DO_NOT_EXPORT'}:raw()),{status:scenario==='auth'?401:200});}):oldFactory(p,r);
  ipcMain.removeHandler('assistant:connect');
  ipcMain.handle('assistant:connect',async(event,value)=>{assert.equal(event.sender,mainWindow.webContents);assert.equal(value.provider,'deepseek');await accounts.connect(value);return {ok:true,value:{connectionMessage:'本机连接已保存，可在总览查看余额。'}};});
  try{
    await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"账户与设置\"]').click()");
    await until(mainWindow,"!!document.querySelector('.connection-panel')");
    await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"选择平台\"]').click()");
    await until(mainWindow,"[...document.querySelectorAll('[role=option]')].some(x=>x.textContent.includes('DeepSeek'))");
    await mainWindow.webContents.executeJavaScript("[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.includes('DeepSeek')).click()");
    await until(mainWindow,"document.querySelector('#api-key')?.placeholder.includes('官方 API Key')");
    await mainWindow.webContents.executeJavaScript("(()=>{const e=document.querySelector('#api-key');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'native-synthetic-deepseek-key');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until(mainWindow,"!document.querySelector('.connect-actions button[type=submit]').disabled");
    await mainWindow.webContents.executeJavaScript("document.querySelector('.connect-actions button[type=submit]').click()");
    await until(mainWindow,"document.querySelectorAll('.balance-currency').length===2");
    await until(widgetWindow,"document.querySelectorAll('.balance-widget-currency').length===2");
    checks.realFormToBalance=true;assert.equal(accounts.active.monitor.state.status,'connected');
    assert.equal(await mainWindow.webContents.executeJavaScript("document.querySelectorAll('.balance-dashboard [role=progressbar]').length"),0);
    assert.equal(await mainWindow.webContents.executeJavaScript("document.querySelector('.balance-dashboard').textContent.includes('110.000001') && document.querySelector('.balance-dashboard').textContent.includes('5.125')"),true);checks.precisionAndCurrencyIsolation=true;
    applySettings({...settings,theme:'light',widgetExpanded:false});await until(mainWindow,"!document.querySelector('.native-app.dark')");
    await capture(mainWindow,store.file('balance-multi-light.png'));await capture(widgetWindow,store.file('balance-widget-compact.png'));
    applySettings({...settings,theme:'dark',widgetExpanded:true});await until(widgetWindow,"document.querySelectorAll('.balance-widget dl').length===2");
    await capture(mainWindow,store.file('balance-multi-dark.png'));await capture(widgetWindow,store.file('balance-widget-expanded.png'));checks.themesAndWidget=true;
    scenario='zero';await accounts.active.monitor.refresh();await until(mainWindow,"document.querySelectorAll('.balance-currency').length===1 && document.querySelector('.balance-total')?.textContent.includes('0.00')");
    assert.equal(accounts.active.monitor.state.status,'connected');assert.equal(accounts.active.monitor.state.errors.length,0);checks.zeroIsSuccessfulQuery=true;await capture(mainWindow,store.file('balance-zero-dark.png'));
    const stamp=accounts.active.monitor.state.updatedAt.balance;scenario='auth';await accounts.active.monitor.refresh();await until(mainWindow,"document.querySelector('.balance-dashboard .inline-warning')?.textContent.includes('密钥无效')");
    assert.equal(accounts.active.monitor.state.parts.balance.balances[0].total,'0');assert.equal(accounts.active.monitor.state.updatedAt.balance,stamp);assert.equal(accounts.active.monitor.state.status,'auth-error');checks.failedQueryRetainsDatedBalance=true;await capture(mainWindow,store.file('balance-auth-dark.png'));
    scenario='empty';await accounts.active.monitor.refresh();await until(mainWindow,"document.querySelector('.balance-dashboard').textContent.includes('金额保持未知')");checks.emptyIsUnknown=true;
    scenario='multi';await accounts.active.monitor.refresh();const id=accounts.activeId;
    const restored=new AccountManager({store,settings,clientFactory:accounts.clientFactory});try{restored.load();assert.equal(restored.activeId,id);assert.equal(restored.active.monitor.state.parts.balance.balances.length,2);assert.equal(restored.issue,'');}finally{restored.dispose();}checks.nativeEncryptedReload=true;
    assert.doesNotMatch(fs.readFileSync(store.file('accounts.encrypted.json'),'utf8'),/native-synthetic-deepseek-key/);
    const report=await analytics.get({source:'account',range:'today'});assert.equal(report.summary,null);assert.equal(report.prediction,null);assert.equal(accounts.active.history.records.length,0);checks.noFabricatedBilling=true;
    await mainWindow.webContents.executeJavaScript("document.querySelector('.balance-tools button').click()");await until(mainWindow,"!!document.querySelector('.analytics-page .analysis-source-picker')");checks.independentToolNavigation=true;
    return {ok:true,checks,syntheticOnly:true,requests,realDeepSeekAccount:false,modelCalls:false};
  }finally{accounts.clientFactory=oldFactory;ipcMain.removeHandler('assistant:connect');}
}
module.exports={runBalanceSmoke};
