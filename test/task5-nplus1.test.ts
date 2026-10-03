import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import {pool} from '../src/infrastructure/db.js';
import {Authority} from '../src/authz/revision.js';
import {SessionCache} from '../src/authz/cache.js';
import {start,observe} from './task3-helper.js';
// Round 2 merges per-request authority reads: the two mid-request fences are one statement each
// instead of a full three-statement current() read, so a hot page is 10 queries instead of 14.
// The property under test is unchanged: the count is constant for 20/50/200 rows.
const QUERIES=10;
for(const candidate of ['native','casbin'] as const)test(`${candidate}: measured page queries and non-ALL large-cap workload`,async()=>{
 const a=await start(candidate,4311),b=await start(candidate,4312),cache=new SessionCache(),authority=new Authority(cache);const observations:any[]=[];
 try{
  for(const [instance,api] of [['A',a],['B',b]] as const)for(const actor of ['M','person-00003']){
   await api.request('GET','/report?limit=20',undefined,actor);const counts=[];
   for(const limit of [20,50,200]){const r=await api.request('GET','/report?limit='+limit,undefined,actor);await observe(candidate,instance+' '+actor+' page '+limit,{status:200,rows:limit,count:actor==='M'?49998:22875,queries:QUERIES},{status:r.status,rows:r.body.rows?.length,count:r.body.count,queries:r.body.meta?.queryCount});counts.push(r.body.meta.queryCount);observations.push({instance,actor,limit,...r});}
   await observe(candidate,instance+' '+actor+' page-independent query count',[QUERIES,QUERIES,QUERIES],counts);
  }
  const before=process.memoryUsage(),startAt=performance.now();const auth=await authority.plan({tenantId:'T1',personId:'person-00003'},candidate,'history','report.history.view');
  const measured={candidate,elapsedMs:performance.now()-startAt,before,after:process.memoryUsage(),sourceIds:auth.plan.sources.map(s=>s.sourceId),resolvedCounts:auth.plan.sources.map(s=>s.resolved.personIds.length),allFlags:auth.plan.sources.map(s=>s.resolved.all),pairCaps:auth.plan.sources.map(s=>s.resolved.spec.personCompanyPairs?.length),companyIds:auth.plan.companyIds};
  await observe(candidate,'complex actor actual non-ALL resolved scope and relevant pair caps',{resolvedCounts:[23062,15000],allFlags:[false,false],pairCaps:[30750,20000],companyIds:['A','I']},{resolvedCounts:measured.resolvedCounts,allFlags:measured.allFlags,pairCaps:measured.pairCaps,companyIds:measured.companyIds});
  const storage=(await pool.query("SELECT id,pg_column_size(data) AS stored_bytes,octet_length(data::text) AS json_bytes FROM authz.membership WHERE tenant_id='T1' AND person_id='person-00003' ORDER BY id")).rows;
  await writeFile('evidence/raw/task5-complex-'+candidate+'.json',JSON.stringify({measured,storage,observations,note:'Diagnostic single-process heap/RSS snapshots and actual source resolution, not isolated retained-heap/production capacity or reference-window SLA.'},null,2));
 }finally{await cache.close();await b.close();await a.close();}
});test.after(()=>pool.end());
