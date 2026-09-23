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
const concurrency=Number(process.env.CONCURRENCY??50),seconds=Number(process.env.DURATION_SECONDS??600);
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
async function client(clientId:number){
 while(performance.now()<deadline){
  const requestIndex=ticket++,name=names[requestIndex%names.length]!,def=truth.scenarios[name]!,index=Math.floor(requestIndex/names.length)%2,t=performance.now();
  const requestId=randomUUID();
  let sample:any={requestId,clientId,requestIndex,instanceUrl:urls[index],candidate,configuredCache:cache,scenario:name,phase,requestAt:new Date().toISOString()};
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
 }
}
await Promise.all(Array.from({length:concurrency},(_,n)=>client(n)));gzip.end();await saving;stopLoop();loopFile.end();await once(loopFile,'finish');
function summarize(h:Record<string,number[]>){return Object.fromEntries(Object.entries(h).map(([key,a])=>{a.sort((x,y)=>x-y);const q=(p:number)=>a.length?a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;return[key,{count:a.length,p50:q(.5),p95:q(.95),p99:q(.99)}];}));}
const summary={startAt,endAt:new Date().toISOString(),durationMs:performance.now()-start,configuredSeconds:seconds,concurrency,total:ticket,candidate,cache,scenario,phase,urls,pageSize:50,queryCounts:queries,instances,cacheHits:hits,clientCounts,rotation:'Global requestIndex modulo four scenarios; each four-request cycle alternates instance. Single-scenario mode alternates each request.',referenceWindow:seconds===600&&concurrency===50,samplingRatio:1,clientLoopDroppedIntervals:loopDropped,clientLoopFile:'event-loop.jsonl',truthFile:'scenario-truth.json',...summarize(hist),perScenario:Object.fromEntries(Object.entries(perScenario).map(([name,h])=>[name,summarize(h)]))};
await writeFile(output+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
if(hist.authorization_error!.length||hist.measurement_error!.length||phase==='success'&&(hist.denial!.length||hist.failure!.length))process.exitCode=1;
