const path=require('node:path');
const {launcherName}=require('./platform.cjs');
const {sameLocation}=require('./codex-connect.cjs');
function connectionStatus(entry,data,sources=[],collectorIssue=''){
  if(!entry||!['codex','claude'].includes(entry.provider))return null;
  const claude=entry.provider==='claude',windows=data?.parts?.credits?.windows||[],at=data?.updatedAt?.credits||null;
  let quota={status:'waiting',label:claude?'组件已就绪 · 等待首次额度':'等待额度同步',message:claude?'请在项目目录运行生成的 '+launcherName()+'，收到套餐额度后才算同步成功。':'通过官方客户端读取订阅额度。'};
  if(collectorIssue&&claude)quota={status:'error',label:'采集组件暂不可用',message:collectorIssue};
  else if(['offline','auth-error','partial'].includes(data?.status))quota={status:'error',label:data.status==='auth-error'?'需要重新连接':'额度同步失败',message:data.errors?.[0]?.message||'请检查客户端、网络和登录状态。'};
  else if(windows.length)quota=data.status==='connected'?{status:'synced',label:'额度已同步',message:'订阅额度独立展示，不与本机 Token 相加。'}:{status:'stale',label:'最近额度 · 等待更新',message:'当前是上次观察值，尚未确认实时额度。'};
  else if(!claude&&data?.status==='connected')quota={status:'waiting',label:'登录已验证 · 额度暂未返回',message:'官方接口未返回可展示的窗口，不将缺失值当作零。'};
  let source;
  if(entry.credential?.home)source=sources.find(s=>claude?s.kind==='claude-code'&&sameLocation(path.dirname(s.file),entry.credential.home):s.kind==='codex'&&sameLocation(s.file,entry.credential.home));
  let details={status:'waiting',label:'工具明细待添加',message:'未添加此配置位置的数据源；不影响独立读取订阅额度。'};
  if(source){
    if(!source.enabled)details={status:'disabled',label:'工具明细已停用',message:'可在工具数据源中重新启用。'};
    else if(source.status==='ready'&&source.observedEndAt)details={status:'synced',label:'工具明细已同步',message:'仅覆盖本机已观察记录；计费账户关联需在设置中人工确认。'};
    else if(source.status==='idle'&&source.observedEndAt)details={status:'stale',label:'工具明细已保存 · 待刷新',message:'可在工具分析中刷新本机已保存的用量记录。'};
    else if(['schema','unsupported','error','missing','overlap','stale','partial','timeout'].includes(source.status))details={status:'error',label:'工具明细需要检查',message:source.message||'请在工具数据源中检查位置和支持版本。'};
    else details={status:'waiting',label:source.lastSuccessAt?'等待首次用量记录':'工具来源已添加 · 等待同步',message:claude?'使用采集启动配置运行 Claude Code，再在工具分析中刷新。':'在工具分析中刷新；缺少日志时不推算 Token。'};
  }
  return {quota:{...quota,observedAt:at},details};
}
module.exports={connectionStatus};
