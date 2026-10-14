// Only called in the isolated --smoke-test profile. All account data is synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createOpenCode}=require('./opencode-fixture.cjs');
const {AccountManager}=require('./accounts.cjs');
const {createClient}=require('./providers.cjs');
const {fixtureFetch}=require('./provider-fixture.cjs');
async function until(win,expression){const end=Date.now()+6000;while(Date.now()<end){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,40));}throw new Error('OpenCode renderer did not settle: '+expression);}
async function capture(win,file){await win.webContents.executeJavaScript('document.getAnimations().forEach(a=>{try{a.finish()}catch{}})');await win.webContents.capturePage();await new Promise(r=>setTimeout(r,180));fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());}
async function runOpenCodeSmoke({accounts,toolSources,analytics,store,mainWindow,widgetWindow,settings,applySettings}){
  const label='OpenCode Go · 接口样例';
  await accounts.connect({provider:'opencode-go',region:'global',label,apiKey:'native-opencode-synthetic-key'});
  await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"用量总览\"]').click()");
  await until(mainWindow,"document.querySelector('.provider-dashboard')?.textContent.includes('OpenCode Go') && document.querySelectorAll('.quota-row').length===3");
  applySettings({...settings,theme:'light',widgetExpanded:false});
  await until(mainWindow,"document.querySelector('.native-app') && !document.querySelector('.native-app.dark')");
  await until(widgetWindow,"document.querySelectorAll('.provider-widget-quota').length===2 && document.querySelector('.provider-widget-quota')?.textContent.includes('本周额度')");
  const text=await mainWindow.webContents.executeJavaScript("document.querySelector('.provider-dashboard').textContent");
  assert.ok(text.includes('72%')&&text.includes('37%')&&text.includes('58%'));assert.ok(!text.includes('NaN'));assert.ok(!text.includes('$'));
  await capture(mainWindow,store.file('opencode-go-light.png'));await capture(widgetWindow,store.file('opencode-widget.png'));
  applySettings({...settings,theme:'dark',widgetExpanded:true});
  await until(mainWindow,"document.querySelector('.native-app.dark')!==null");await until(widgetWindow,"document.querySelectorAll('.provider-widget-quota').length===3");
  await capture(mainWindow,store.file('opencode-go-dark.png'));
  const before=JSON.stringify(accounts.active.monitor.state.parts.credits);
  accounts.active.monitor.receive({parts:{},errors:[{endpoint:'credits',status:503,code:'503',message:'OpenCode Go 服务暂时不可用。'}]});accounts.emitState();
  await until(mainWindow,"document.querySelector('.inline-warning')?.textContent.includes('上次成功数据')");assert.equal(JSON.stringify(accounts.active.monitor.state.parts.credits),before);
  await accounts.active.monitor.refresh();
  const restored=new AccountManager({store,settings,clientFactory:(p,r)=>createClient(p,r,fixtureFetch)});
  try{restored.load();assert.equal(restored.issue,'');assert.equal(restored.entries.find(e=>e.id===accounts.activeId).provider,'opencode-go');}finally{restored.dispose();}
  assert.ok(!fs.readFileSync(store.file('accounts.encrypted.json'),'utf8').includes('native-opencode-synthetic-key'));
  const file=createOpenCode(store.file('opencode-fixture.db')),source=toolSources.add({kind:'opencode',file,label:'OpenCode · 本机样例'});
  const result=await analytics.get({source:'tools',range:'7d',sourceIds:[source.id]});assert.equal(result.summary.total,240);assert.equal(result.accountId,null);assert.equal(result.credits,null);assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  await mainWindow.webContents.executeJavaScript("document.querySelector('button[aria-label=\"账户与设置\"]').click()");
  await until(mainWindow,"[...document.querySelectorAll('.tool-source-label input')].some(e=>e.value==='OpenCode · 本机样例')");await capture(mainWindow,store.file('opencode-tools-dark.png'));
  return {ok:true,quotaWindows:3,lowestFirst:true,expandedWidget:true,lightDark:true,lastSuccessRetained:true,encryptedReload:true,sqliteReadOnly:true,toolTokens:240,forkAndMirrorExcluded:true,metadataOnly:true,realAccountTest:false,realToolTest:false};
}
module.exports={runOpenCodeSmoke};
