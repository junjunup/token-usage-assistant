import {useEffect,useRef,useState} from 'react';
export function useAnalytics(bridge,query,state,enabled=true){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[tick,setTick]=useState(0);
  const queryKey=JSON.stringify(query),previous=useRef(''),active=useRef(null);
  useEffect(()=>{if(!enabled)return;const id=setInterval(()=>setTick(n=>n+1),(state?.settings.refreshSeconds||60)*1000);return()=>clearInterval(id);},[enabled,state?.settings.refreshSeconds]);
  useEffect(()=>{
    if(!enabled||!state||!bridge.analytics)return;let alive=true;if(previous.current!==queryKey+'|'+state.analyticsRevision){setReport(null);previous.current=queryKey+'|'+state.analyticsRevision;}setLoading(true);setError('');
    const requestId=crypto.randomUUID();active.current=requestId;
    bridge.analytics({...JSON.parse(queryKey),requestId,force:reload>0}).then(r=>{if(!alive||active.current!==requestId)return;if(!r.ok)throw new Error(r.error);setReport(r.value);}).catch(e=>{if(alive&&active.current===requestId)setError(e.message||'分析暂时无法加载');}).finally(()=>{if(alive&&active.current===requestId){active.current=null;setLoading(false);}});
    return()=>{alive=false;bridge.cancelAnalytics?.(requestId);};
  },[queryKey,enabled,!!state,state?.data.updatedAt.summary,state?.analyticsRevision,reload,tick]);
  return {report,loading,error,refresh:()=>setReload(n=>n+1),cancel:()=>{const id=active.current;active.current=null;if(id)bridge.cancelAnalytics?.(id);setLoading(false);setError('分析已取消，可重新刷新。');}};
}
