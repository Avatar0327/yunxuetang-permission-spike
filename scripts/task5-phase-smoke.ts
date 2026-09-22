import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createClient} from 'redis';
import {start} from '../test/task3-helper.js';
const temperature=process.env.CACHE_MODE??'hot',prefix=process.env.OUTPUT??('evidence/raw/task5-phase-'+temperature+'-'+Date.now());
if(!['hot','cold'].includes(temperature))throw Error('invalid CACHE_MODE');
process.env.CACHE_MODE=temperature;
for(const candidate of ['native','casbin'])for(const phase of ['denial','fault']){
 const output=`${prefix}-${candidate}-${phase}`,startAt=new Date().toISOString(),a=await start(candidate,4311),aReadyAt=new Date().toISOString(),b=await start(candidate,4312),bReadyAt=new Date().toISOString(),redis=createClient({socket:{host:'127.0.0.1',port:56379}});redis.on('error',()=>{});
 try{
  if(phase==='fault'){await redis.connect();await redis.sendCommand(['CLIENT','PAUSE','10000','ALL']);}
  await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','scripts/benchmark.ts'],{env:{...process.env,CANDIDATE:candidate,CACHE_MODE:temperature,SCENARIO:'mixed',PHASE:phase,DURATION_SECONDS:'2',CONCURRENCY:'4',OUTPUT:output},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);child.on('exit',async code=>{await writeFile(output+'.txt',logs);code===0?resolve():reject(Error('phase smoke failed'));});});
  await writeFile(output+'/process-startup.json',JSON.stringify({configuredCache:temperature,startAt,aReadyAt,bReadyAt,logs:{a:a.logs(),b:b.logs()},note:'Host process start-to-ready boundaries, separate from request histogram; not a capped container cold-start measurement.'},null,2));
 }finally{if(redis.isOpen){await redis.sendCommand(['CLIENT','UNPAUSE']);redis.destroy();}await b.close();await a.close();}
}
