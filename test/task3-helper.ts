import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pool } from '../src/infrastructure/db.js';
export const admin={tenantId:'T1',personId:'Z'};
export const policy=(nodeId:string,actions:string[],scope:any={kind:'all'},rawFields:string[]=[],delegableActions=actions)=>({nodeId,navigation:true,actions,scope,rawFields,delegableActions});
export const courseActions=['knowledge.course.browse','knowledge.course.maintain','knowledge.course.distribute','knowledge.course.download'];
export const categoryActions=['knowledge.category.create','knowledge.category.configure','knowledge.category.append'];
export async function prepareAdmin() {
 const data=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id='admin'")).rows[0].data;
 const extra=[policy('course',courseActions),policy('category',categoryActions),policy('role-management',['authz.role.create','authz.role.update','authz.role.recheck']),policy('face-to-face',['training.face-to-face.view','training.face-to-face.update'])];
 data.policies=data.policies.filter((p:any)=>!extra.some(e=>e.nodeId===p.nodeId)).concat(extra);
 for (const p of data.policies) p.delegableActions=p.actions;
 await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[data]);
}
export async function observe(candidate:string,name:string,expected:unknown,actual:unknown) {
 await appendFile(process.env.TASK3_OBSERVATIONS??'evidence/raw/task3-observations.jsonl',JSON.stringify({candidate,name,expected,actual,at:new Date().toISOString()})+'\n');
 assert.deepEqual(actual,expected);
}
export async function start(candidate:string,port=4311) {
 const child=spawn(process.execPath,['--import','tsx','src/bootstrap.ts'],{env:{...process.env,CANDIDATE:candidate,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 for(let n=0;n<200&&!logs.includes('"ready":true');n++){if(child.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,20));}
 if(!logs.includes('"ready":true')){child.kill();throw Error(logs);}
 return {logs:()=>logs,async request(method:string,path:string,body?:unknown,actor='Z') { const response=await fetch('http://127.0.0.1:'+port+path,{method,headers:{authorization:'Bearer spike-'+actor,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json() as any};},async close(){child.kill('SIGTERM');await new Promise<void>(r=>child.once('exit',()=>r()));}};
}
