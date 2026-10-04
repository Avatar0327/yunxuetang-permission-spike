import {randomUUID} from 'node:crypto';
import {observedFetch} from './benchmark-telemetry.js';
import {safeError,startEventLoopMonitor} from '../src/infrastructure/telemetry.js';
import {createWriteStream} from 'node:fs';
import {writeFile,mkdir} from 'node:fs/promises';
import {createGzip} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';
import {scenarioTruth} from './benchmark-truth.js';
import {checkObservation} from './benchmark-observation.js';
const scenario=process.env.SCENARIO??'list-broad',phase=process.env.PHASE??'success',candidate=process.env.CANDIDATE??'native',cache=process.env.CACHE_MODE??'hot';
const truth=scenarioTruth(),names=scenario==='mixed'?Object.keys(truth.scenarios):[scenario];
if(names.some(n=>!truth.scenarios[n])||!['success','denial','fault'].includes(phase)||!['native','casbin'].includes(candidate)||!['hot','cold'].includes(cache))throw Error('invalid scenario/candidate/cache/phase');
// Load model. Default 'reference' is the original D-47 load: CONCURRENCY clients, no think time, equal rotation.
// 'd51' is the business-estimated load of D-51 (2026-10-04): 200 closed-loop virtual users, exponential think
// time with mean 5 s, and a fixed interleaved 20-slot schedule giving history-broad 5%, history-constrained 5%,
// list-broad 45%, list-constrained 45%. Thresholds, truth checks and request paths are identical in both models.
const loadModel=process.env.LOAD_MODEL??'reference';
if(!['reference','d51'].includes(loadModel))throw Error('invalid LOAD_MODEL');
const d51=loadModel==='d51';
const concurrency=Number(process.env.CONCURRENCY??(d51?200:50)),seconds=Number(process.env.DURATION_SECONDS??600);
const thinkMeanMs=d51?Number(process.env.THINK_MEAN_MS??5000):0,seed=Number(process.env.BENCH_SEED??20261004);
const d51Schedule=['list-broad','list-constrained','list-broad','list-constrained','list-broad','list-constrained','list-broad','list-constrained','list-broad','history-broad','list-constrained','list-broad','list-constrained','list-broad','list-constrained','list-broad','list-constrained','list-broad','list-constrained','history-constrained'];
// Deterministic per-client PRNG (mulberry32) so a rerun with the same seed reproduces the think-time draws.
function prng(n:number){let a=(seed+Math.imul(n+1,0x9e3779b9))>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
if(!Number.isSafeInteger(concurrency)||concurrency<1||!Number.isFinite(seconds)||seconds<=0)throw Error('invalid run parameters');
const urls=[process.env.API_A??'http://127.0.0.1:4311',process.env.API_B??'http://127.0.0.1:4312'];
const output=process.env.OUTPUT??`evidence/raw/benchmark-${candidate}-${cache}-${scenario}-${phase}-${Date.now()}`;
await mkdir(output,{recursive:true});
const loopFile=createWriteStream(output+'/event-loop.jsonl');let loopDropped=0;
const stopLoop=startEventLoopMonitor('client',record=>{if(loopFile.writableLength>1024*1024){loopDropped++;return;}loopFile.write(JSON.stringify({...record,droppedIntervals:loopDropped})+'\n');});
await writeFile(output+'/scenario-truth.json',JSON.stringify(truth,null,2));
if(cache==='hot'&&phase==='success'){
 const prewarm=[];
 for(const url of urls)for(const name of names){const def=truth.scenarios[name]!,observed=await observedFetch(url+def.path,{headers:{authorization:'Bearer spike-'+def.actor},signal:AbortSignal.timeout(20000)},randomUUID());
  if(observed.error){prewarm.push({name,url,...observed.telemetry});await writeFile(output+'/prewarm.json',JSON.stringify(prewarm,null,2));stopLoop();loopFile.end();throw observed.error;}
  const res=observed.res!,body=observed.body;
  const checked=checkObservation(body,res.status,def,candidate,body.evidence?.cache==='cold'?'cold':'hot',phase);prewarm.push({name,url,...observed.telemetry,status:res.status,...checked,evidence:body.evidence,meta:body.meta});
  if(checked.classification!=='success'){await writeFile(output+'/prewarm.json',JSON.stringify(prewarm,null,2));stopLoop();loopFile.end();throw Error('prewarm correctness/measurement failed');}
 }
 await writeFile(output+'/prewarm.json',JSON.stringify(prewarm,null,2));
}
const gzip=createGzip();gzip.setMaxListeners(concurrency+10);const saving=pipeline(gzip,createWriteStream(output+'/samples.jsonl.gz'));
const newHist=()=>Object.fromEntries(['success','denial','failure','authorization_error','measurement_error','permission','data'].map(k=>[k,[] as number[]]));
const hist=newHist(),perScenario=Object.fromEntries(names.map(n=>[n,newHist()]));
const queries:Record<string,number>={},instances:Record<string,number>={},hits:Record<string,number>={},clientCounts:Record<string,number>={};
const startAt=new Date().toISOString(),start=performance.now(),deadline=start+seconds*1000;let ticket=0;
const thinkStats={count:0,totalMs:0,maxMs:0};
async function client(clientId:number){
 const random=prng(clientId);let thinkMs=0;
 // D-51: users arrive spread over the first mean think time instead of all at once.
 if(d51){thinkMs=random()*thinkMeanMs;await pause(thinkMs);}
 while(performance.now()<deadline){
  const requestIndex=ticket++,schedule=d51&&scenario==='mixed'?d51Schedule:names,name=schedule[requestIndex%schedule.length]!,def=truth.scenarios[name]!,index=Math.floor(requestIndex/schedule.length)%2,t=performance.now();
  const requestId=randomUUID();
  let sample:any={requestId,clientId,requestIndex,instanceUrl:urls[index],candidate,configuredCache:cache,scenario:name,phase,requestAt:new Date().toISOString(),...(d51?{precedingThinkMs:thinkMs}:{})};
  try{
   const observed=await observedFetch(urls[index]+def.path,{headers:{authorization:'Bearer spike-'+(phase==='denial'?'L':def.actor)},signal:AbortSignal.timeout(20000)},requestId);
   sample={...sample,...observed.telemetry};if(observed.error)throw observed.error;const res=observed.res!,body=observed.body;
   const elapsedMs=performance.now()-t,responseAt=new Date().toISOString();
   const truthStart=performance.now(),checked=checkObservation(body,res.status,def,candidate,cache,phase),truthCheckMs=performance.now()-truthStart;
   sample={...sample,status:res.status,elapsedMs,responseAt,permissionMs:body.evidence?.permissionMs,dataMs:body.evidence?.dataMs,cache:body.evidence?.cache,revision:body.evidence?.revision,sourceIds:body.evidence?.sourceIds,queryCount:body.meta?.queryCount,instance:body.meta?.instance,serverRequestAt:body.meta?.requestAt,serverResponseAt:body.meta?.responseAt,...checked,truthCheckMs,...(res.status!==200?{failureCode:'HTTP_'+res.status}:{} )};
   if(['authorization_error','measurement_error'].includes(sample.classification))sample.actualResult={count:body.count,rows:body.rows};
  }catch(e){sample={...sample,classification:'failure',elapsedMs:performance.now()-t,responseAt:new Date().toISOString(),error:sample.error??safeError(e),failurePhase:sample.failurePhase??'observation'};}
  for(const h of [hist,perScenario[name]!]){h[sample.classification]!.push(sample.elapsedMs);if(sample.classification==='success'){h.permission!.push(sample.permissionMs);h.data!.push(sample.dataMs);}}
  for(const [map,key] of [[queries,String(sample.queryCount)],[instances,String(sample.instance)],[hits,sample.cache??'none'],[clientCounts,String(clientId)]] as const)map[key]=(map[key]??0)+1;
  if(!gzip.write(JSON.stringify(sample)+'\n'))await once(gzip,'drain');
  if(d51){thinkMs=-Math.log(1-random())*thinkMeanMs;thinkStats.count++;thinkStats.totalMs+=thinkMs;thinkStats.maxMs=Math.max(thinkStats.maxMs,thinkMs);await pause(Math.min(thinkMs,Math.max(0,deadline-performance.now())));}
 }
}
await Promise.all(Array.from({length:concurrency},(_,n)=>client(n)));gzip.end();await saving;stopLoop();loopFile.end();await once(loopFile,'finish');
function summarize(h:Record<string,number[]>){return Object.fromEntries(Object.entries(h).map(([key,a])=>{a.sort((x,y)=>x-y);const q=(p:number)=>a.length?a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;return[key,{count:a.length,p50:q(.5),p95:q(.95),p99:q(.99)}];}));}
const summary={startAt,endAt:new Date().toISOString(),durationMs:performance.now()-start,configuredSeconds:seconds,concurrency,total:ticket,candidate,cache,scenario,phase,urls,pageSize:50,queryCounts:queries,instances,cacheHits:hits,clientCounts,rotation:d51?'D-51: global requestIndex over a fixed interleaved 20-slot schedule (history-broad 1, history-constrained 1, list-broad 9, list-constrained 9); each 20-request cycle alternates instance.':'Global requestIndex modulo four scenarios; each four-request cycle alternates instance. Single-scenario mode alternates each request.',loadModel:d51?{id:'D-51',users:concurrency,closedLoop:true,thinkDistribution:'exponential',thinkMeanMs,seed,initialArrival:'uniform over [0, thinkMeanMs)',schedule:d51Schedule,mix:{'history-broad':0.05,'history-constrained':0.05,'list-broad':0.45,'list-constrained':0.45},realizedThink:{count:thinkStats.count,meanMs:thinkStats.count?thinkStats.totalMs/thinkStats.count:null,maxMs:thinkStats.maxMs},requestRatePerSecond:ticket/((performance.now()-start)/1000)}:{id:'reference'},referenceWindow:seconds===600&&(d51?concurrency===200:concurrency===50),samplingRatio:1,clientLoopDroppedIntervals:loopDropped,clientLoopFile:'event-loop.jsonl',truthFile:'scenario-truth.json',...summarize(hist),perScenario:Object.fromEntries(Object.entries(perScenario).map(([name,h])=>[name,summarize(h)]))};
await writeFile(output+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
if(hist.authorization_error!.length||hist.measurement_error!.length||phase==='success'&&(hist.denial!.length||hist.failure!.length))process.exitCode=1;
