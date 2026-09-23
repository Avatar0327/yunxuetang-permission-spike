import pg from 'pg';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {scenarioTruth,digest} from '../scripts/benchmark-truth.js';
import {observedFetch} from '../scripts/benchmark-telemetry.js';
const enabled=process.env.TELEMETRY_HTTP_TEST==='1';
test('Native HTTP truth, business payload, error diagnostics and request IDs agree with observation off/on',{skip:!enabled},async()=>{
 const output=process.env.TELEMETRY_OUTPUT??'/tmp/native-task1-smoke';await mkdir(output,{recursive:true});const truth=scenarioTruth();const results:any[]=[];
 async function launch(port:number,extra:Record<string,string>){let stdout='',stderr='';const child=spawn(process.execPath,['dist/src/bootstrap.js'],{env:{...process.env,PORT:String(port),CANDIDATE:'native',INSTANCE_ID:'telemetry-smoke',...extra},stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);for(let i=0;i<200&&!stdout.includes('"ready":true');i++){if(child.exitCode!==null)throw Error(stderr);await sleep(25);}assert.match(stdout,/"ready":true/);return {url:'http://127.0.0.1:'+port,lines:()=>stdout.split('\n').flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}}),close:async()=>{child.kill('SIGTERM');await new Promise<void>(resolve=>child.once('exit',()=>resolve()));await writeFile(output+'/'+port+'.jsonl',stdout);await writeFile(output+'/'+port+'.stderr',stderr);}};}
 for(const cache of ['hot','cold']){
  const off=await launch(14311,{OBSERVE:'0',CACHE_MODE:cache}),on=await launch(14312,{OBSERVE:'1',CACHE_MODE:cache});
  try{
   if(cache==='hot')for(const[mode,server]of [['off',off],['on',on]] as const)for(const[name,def]of Object.entries(truth.scenarios)){const r=await observedFetch(server.url+def.path,{headers:{authorization:'Bearer spike-'+def.actor},signal:AbortSignal.timeout(20000)},'prewarm-'+mode+'-'+name);assert.equal(r.res?.status,200);}
   // Alternate instance order to limit warmup/order bias. A small diagnostic smoke, not a gate window.
   for(let repetition=0;repetition<3;repetition++)for(const[name,def]of Object.entries(truth.scenarios)){
    const pair:any[]=[];for(const[mode,server]of (repetition%2?[['on',on],['off',off]]:[['off',off],['on',on]]) as ['on'|'off',typeof on][]){const id=`${cache}-${name}-${repetition}-${mode}`,start=performance.now(),observed=await observedFetch(server.url+def.path,{headers:{authorization:'Bearer '+`spike-${def.actor}`},signal:AbortSignal.timeout(20000)},id);assert.equal(observed.error,undefined,JSON.stringify(observed.telemetry));assert.equal(observed.res!.status,200);const body=observed.body;assert.equal(digest({count:body.count,rows:body.rows}),def.resultDigest);assert.equal(body.meta.candidate,'native');assert.equal(observed.telemetry.serverRequestId,mode==='on'?id:null);pair.push({mode,body});results.push({mode,cache,name,repetition,elapsedMs:performance.now()-start,serverElapsedMs:body.meta.elapsedMs,queryCount:body.meta.queryCount,...observed.telemetry});}
    const stable=(body:any)=>({...body,meta:{...body.meta,requestAt:undefined,responseAt:undefined,pid:undefined,elapsedMs:undefined,authorityObservedAt:undefined},evidence:{...body.evidence,permissionMs:undefined,dataMs:undefined,cache:undefined}});assert.equal(JSON.stringify(stable(pair[0].body)),JSON.stringify(stable(pair[1].body)));
   }
   const denied=await observedFetch(on.url+'/report',{headers:{authorization:'Bearer invalid'},signal:AbortSignal.timeout(20000)},cache+'-denied');assert.equal(denied.res!.status,403);assert.deepEqual(Object.keys(denied.body).sort(),['message','meta']);
   await sleep(50);const records=on.lines().filter(x=>x.type==='request_diagnostic');assert.equal(records.length,cache==='hot'?17:13);for(const r of records){assert.equal(r.droppedSpans,0);assert.equal(r.droppedErrors,0);assert.equal(r.diagnosticDroppedRecords,0);assert.ok(r.spans.some((s:any)=>s.name==='response.serialize'));assert.ok(r.spans.some((s:any)=>s.name==='pool.acquire'));assert.ok(r.spans.some((s:any)=>s.name==='sql.roundtrip'&&s.sqlFingerprint));}
   assert.ok(on.lines().some(x=>x.type==='event_loop_interval'));assert.equal(off.lines().filter(x=>x.type==='request_diagnostic').length,0);
   await writeFile(output+'/'+cache+'-diagnostics.json',JSON.stringify(records,null,2));
  }finally{await off.close();await on.close();}
 }
 for(const[kind,extra,code]of [['pg',{PGPORT:'1'},'ECONNREFUSED'],['redis',{REDIS_PORT:'1'},'ECONNREFUSED']] as const){const server=await launch(14313,{OBSERVE:'1',CACHE_MODE:'hot',...extra});try{const r=await observedFetch(server.url+'/report',{headers:{authorization:'Bearer spike-M'},signal:AbortSignal.timeout(20000)},kind+'-failure');assert.equal(r.res!.status,503);assert.deepEqual(Object.keys(r.body).sort(),['message','meta']);await sleep(30);const d=server.lines().find(x=>x.requestId===kind+'-failure');assert.ok(d.errors.some((e:any)=>e.code===code),JSON.stringify(d.errors));await writeFile(output+'/'+kind+'-failure.json',JSON.stringify(d,null,2));}finally{await server.close();}}
 const abortServer=await launch(14314,{OBSERVE:'1',CACHE_MODE:'hot'});
 const blocker=new pg.Client({host:'127.0.0.1',port:55432,user:'spike',password:'spike',database:'permission_spike'});
 try{await blocker.connect();await blocker.query('BEGIN');await blocker.query('LOCK report.person_projection IN ACCESS EXCLUSIVE MODE');
  const r=await observedFetch(abortServer.url+'/report',{headers:{authorization:'Bearer spike-M'},signal:AbortSignal.timeout(250)},'http-abort-late-sql');assert.equal(r.telemetry.error.code,'CLIENT_TIMEOUT');
  for(let i=0;i<240&&!abortServer.lines().some(d=>d.type==='request_diagnostic'&&d.requestId==='http-abort-late-sql');i++)await sleep(50);
  const d=abortServer.lines().find(d=>d.type==='request_diagnostic'&&d.requestId==='http-abort-late-sql');assert.ok(d);assert.equal(d.outcome,'transport_abort');assert.equal(d.statusCode,503);assert.ok(d.errors.some((e:any)=>e.code==='57014'));assert.ok(abortServer.lines().some(d=>d.type==='request_transport_abort'));await writeFile(output+'/http-abort-late-sql.json',JSON.stringify(d,null,2));
 }finally{await blocker.query('ROLLBACK');await blocker.end();await abortServer.close();}
 await writeFile(output+'/observations.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({output,requests:results.length,truth:'all match independent oracle',notes:'3 repeats/scenario/mode/cache, no load qualification'}));
});
