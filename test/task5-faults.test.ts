import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appendFile} from 'node:fs/promises';
import {createClient} from 'redis';
import {pool} from '../src/infrastructure/db.js';
import {start,observe} from './task3-helper.js';
const exec=promisify(execFile),docker=(...args:string[])=>exec('docker',['--context','colima-yxt-permission',...args]);
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
for(const candidate of ['native','casbin'])test(`${candidate}: all protected output classes fail closed and commit timeline`,async()=>{
 let a=await start(candidate,4311);const b=await start(candidate,4312),redis=createClient({socket:{host:'127.0.0.1',port:56379}});redis.on('error',()=>{});
 let redisStopped=false,pgStopped=false;
 const recovery=async()=>{for(let n=0;n<80;n++){try{if((await a.request('GET','/auth/me')).status===200&&(await b.request('GET','/auth/me')).status===200)return;}catch{}await pause(200);}throw Error('fault recovery failed');};
 try{
  await a.request('POST','/appointments',{personId:'L',projectId:'P',active:true});
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1','task5-media','cat-1','Z','Z','synthetic',true) ON CONFLICT DO NOTHING");
  const jobs:any={};for(const [name,path,actor] of [['report','/exports','M'],['training','/projects/P/exports','L'],['account','/account/exports','X']])jobs[name!]={id:(await a.request('POST',path!,{fixture:true},actor)).body.id,actor,base:name==='report'?'/exports':name==='training'?'/project-exports':'/account/exports'};
  const probes:[string,string,any,string][]=[['GET','/report?fixture=true',undefined,'M'],['GET','/history?fixture=true',undefined,'X'],['GET','/projects/P/media/next',undefined,'L'],['GET','/projects/P/people/A/attachment',undefined,'L'],['GET','/courses/task5-media/download',undefined,'Z'],['GET','/account/own',undefined,'X'],['GET','/account/export',undefined,'X']];
  for(const [domain,j] of Object.entries(jobs) as [string,any][]){await a.request('POST',j.base+'/'+j.id+'/execute',{},j.actor);probes.push(['POST',j.base+'/'+j.id+'/execute',{},j.actor],['GET',j.base+'/'+j.id+'/claim',undefined,j.actor],['POST','/worker/'+domain+'/exports/'+j.id+'/execute',{},'worker-'+domain]);}
  async function campaign(label:string,expected:number,api=b){
   for(const [method,path,body,actor] of probes){const r=await api.request(method,path,body,actor);const keys=['rows','bytes','fragment','id','payload'].filter(k=>k in r.body);await observe(candidate,label+' '+method+' '+path,{status:expected,...(expected===503?{businessKeys:[]}: {})},{status:r.status,...(expected===503?{businessKeys:keys}:{})});}
  }
  await campaign('warm protected controls',200);
  await redis.connect();await redis.sendCommand(['CLIENT','PAUSE','10000','ALL']);
  try{await campaign('Redis timeout warm',503);}finally{await redis.sendCommand(['CLIENT','UNPAUSE']);}
  await recovery();await campaign('Redis timeout recovery current authority',200);
  try{await docker('stop','--time','1','yxt-redis');redisStopped=true;await campaign('Redis disconnected warm',503);await a.close();a=await start(candidate,4311);await campaign('Redis disconnected cold restarted process',503,a);}finally{if(redisStopped){await docker('start','yxt-redis');redisStopped=false;}}
  await recovery();await campaign('Redis reconnected current authority',200);
  try{await docker('stop','--time','1','yxt-pg');pgStopped=true;await campaign('DB authority unavailable',503);}finally{if(pgStopped){await docker('start','yxt-pg');pgStopped=false;}}
  await recovery();await campaign('DB recovered authoritative current state',200);
  // Sole-writer appointment revoke. xmin belongs to the revision update by this exact txn.
  const warm1=await b.request('GET','/projects/P/media/1',undefined,'L'),warm2=await b.request('GET','/projects/P/media/2',undefined,'L');
  const cacheProbe=createClient({socket:{host:'127.0.0.1',port:56379,connectTimeout:1000,reconnectStrategy:()=>false},disableOfflineQueue:true});cacheProbe.on('error',()=>{});
  try{await cacheProbe.connect();await observe(candidate,'B actual L1 and retained L2 before sole writer revoke',{cache:'L1',l2:1},{cache:warm2.body.authorization?.cache,l2:await cacheProbe.exists('snapshot:T1:L:'+warm2.body.authorization?.revision)});}finally{if(cacheProbe.isOpen)cacheProbe.destroy();}
  const before=(await pool.query("SELECT revision::text,xmin::text FROM authz.revision WHERE tenant_id='T1'")).rows[0];
  const revoke=await a.request('POST','/appointments',{personId:'L',projectId:'P',active:false});
  const clockBracketStart=new Date().toISOString();
  const committed=(await pool.query("SELECT revision::text,xmin::text,pg_xact_commit_timestamp(xmin) AS committed_at,clock_timestamp() AS observed_at FROM authz.revision WHERE tenant_id='T1'")).rows[0];
  const clockBracketEnd=new Date().toISOString();
  const after=await b.request('GET','/projects/P/media/3',undefined,'L');
  await appendFile(process.env.TASK5_TIMELINE??'evidence/raw/task5-commit-timeline.jsonl',JSON.stringify({candidate,name:'sole-writer appointment revoke',clockDomains:{api:'host wallclock',commit:'PG/Colima wallclock',authorityRead:'PG/Colima wallclock'},clockBracketStart,clockBracketEnd,before,committed,warm:[warm1,warm2],revoke,next:after})+'\n');
  await observe(candidate,'sole writer exact revision transaction',{delta:1,committed:true,newXmin:true,afterCommit:true,afterAcknowledgment:true,pubsub:false,differentProcesses:true,status:403,observedRevision:Number(committed.revision)},{delta:Number(committed.revision)-Number(before.revision),committed:committed.committed_at!==null,newXmin:committed.xmin!==before.xmin,afterCommit:Date.parse(after.body.meta.authorityObservedAt)>=new Date(committed.committed_at).getTime(),afterAcknowledgment:Date.parse(after.body.meta.requestAt)>=Date.parse(revoke.body.meta.responseAt),pubsub:after.body.meta.pubsub,differentProcesses:warm1.body.meta.pid!==revoke.body.meta.pid,status:after.status,observedRevision:after.body.meta.observedRevision});
  for(const [domain,j] of Object.entries(jobs) as [string,any][])for(const [method,path,actor] of [['POST',j.base+'/'+j.id+'/execute',j.actor],['GET',j.base+'/'+j.id+'/claim',j.actor],['POST','/worker/'+domain+'/exports/'+j.id+'/execute','worker-'+domain]])await observe(candidate,'revoked revision invalidates '+domain+' '+path,403,(await b.request(method!,path!,method==='POST'?{}:undefined,actor)).status);
 }finally{
  if(redisStopped)await docker('start','yxt-redis');if(pgStopped)await docker('start','yxt-pg');if(redis.isOpen)redis.destroy();await b.close();await a.close();await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND person_id='L' AND project_id='P'");await pool.query("DELETE FROM knowledge.course WHERE tenant_id='T1' AND id='task5-media'");
 }
});test.after(()=>pool.end());
