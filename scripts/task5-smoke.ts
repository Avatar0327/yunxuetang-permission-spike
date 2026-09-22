import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {start} from '../test/task3-helper.js';
import {pool} from '../src/infrastructure/db.js';
const output=process.env.OUTPUT??'evidence/raw/task5-smoke';
for(const candidate of ['native','casbin'])for(const temperature of ['hot','cold']){
 const previous=process.env.CACHE_MODE;process.env.CACHE_MODE=temperature;const a=await start(candidate,4311),b=await start(candidate,4312);
 try{
  await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','scripts/benchmark.ts'],{env:{...process.env,CANDIDATE:candidate,CACHE_MODE:temperature,SCENARIO:'mixed',DURATION_SECONDS:'3',CONCURRENCY:'4',OUTPUT:output+'-'+candidate+'-'+temperature},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);child.on('exit',async code=>{await writeFile(output+'-'+candidate+'-'+temperature+'.txt',logs);code===0?resolve():reject(Error('smoke failed '+candidate+' '+temperature));});});
 }finally{await b.close();await a.close();if(previous===undefined)delete process.env.CACHE_MODE;else process.env.CACHE_MODE=previous;}
}
await pool.end();
