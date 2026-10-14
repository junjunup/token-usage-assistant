// Isolated test data only. No OpenCode installation, login or model request is required.
const {DatabaseSync}=require('node:sqlite');
const tokenFixture=()=>({input:40,output:15,reasoning:5,cache:{read:50,write:10},total:120});
function createOpenCode(file,now=Date.now(),{v1=true,v2=true}={}){
  const db=new DatabaseSync(file);
  try{
    db.exec('CREATE TABLE session(id TEXT PRIMARY KEY,directory TEXT,time_created INTEGER,title TEXT);');
    const session=(id,created)=>db.prepare('INSERT INTO session VALUES(?,?,?,?)').run(id,'D:/Demo/opencode-project',created,'PRIVATE_TITLE');
    if(v1){
      db.exec('CREATE TABLE message(id TEXT PRIMARY KEY,session_id TEXT,time_created INTEGER,time_updated INTEGER,data TEXT); CREATE TABLE part(id TEXT PRIMARY KEY,message_id TEXT,session_id TEXT,time_created INTEGER,time_updated INTEGER,data TEXT);');
      session('session-v1',now-120000);session('session-fork',now-30000);
      const info={role:'assistant',time:{created:now-60000,completed:now-55000},providerID:'opencode-go',modelID:'model-fixture',tokens:tokenFixture(),finish:'stop',error:{message:'PRIVATE_ERROR'},content:'PRIVATE_MESSAGE'};
      for(const [id,sid] of [['message-v1','session-v1'],['message-fork','session-fork']]){
        db.prepare('INSERT INTO message VALUES(?,?,?,?,?)').run(id,sid,now-60000,now-55000,JSON.stringify(info));
        db.prepare('INSERT INTO part VALUES(?,?,?,?,?,?)').run('part-'+id,id,sid,now-55000,now-55000,JSON.stringify({type:'step-finish',tokens:tokenFixture(),reason:'stop',snapshot:'PRIVATE_SNAPSHOT'}));
      }
      db.prepare('INSERT INTO part VALUES(?,?,?,?,?,?)').run('body-v1','message-v1','session-v1',now-60000,now-55000,JSON.stringify({type:'text',text:'PRIVATE_RESPONSE'}));
    }
    if(v2){
      db.exec('CREATE TABLE session_message(id TEXT PRIMARY KEY,session_id TEXT,type TEXT,time_created INTEGER,time_updated INTEGER,data TEXT);');session('session-v2',now-120000);
      const info={model:{providerID:'opencode',id:'model-fixture'},time:{created:now-45000,completed:now-40000},tokens:tokenFixture(),content:[{type:'text',text:'PRIVATE_RESPONSE'}],finish:'stop'};
      db.prepare('INSERT INTO session_message VALUES(?,?,?,?,?,?)').run('message-v2','session-v2','assistant',now-45000,now-40000,JSON.stringify(info));
      if(v1)db.prepare('INSERT INTO message VALUES(?,?,?,?,?)').run('legacy-mirror','session-v2',now-45000,now-40000,JSON.stringify({role:'assistant',time:info.time,providerID:'opencode',modelID:'model-fixture',tokens:tokenFixture()}));
    }
    return file;
  }finally{db.close();}
}
module.exports={createOpenCode,tokenFixture};
