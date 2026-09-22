import {writeFile,mkdir} from 'node:fs/promises';
import {pool,type DB} from '../src/infrastructure/db.js';
import {Authority} from '../src/authz/revision.js';
import {SessionCache} from '../src/authz/cache.js';
import {ReportService} from '../src/report/service.js';
import {scenarioTruth} from './benchmark-truth.js';
const cache=new SessionCache(),service=new ReportService(new Authority(cache)),output=process.env.OUTPUT??'evidence/raw/explain';
await mkdir(output,{recursive:true});
try{
 for(const candidate of ['native','casbin'] as const)for(const [scenario,def] of Object.entries(scenarioTruth().scenarios)){
  const captured:any[]=[];
  const db={query:async(sql:string,parameters:unknown[]=[])=>{
   if(/^SELECT (?:r\.id|r\.historical_department_id|count\(\*\)::int count FROM report\.)/.test(sql)){
    const before=new Date().toISOString(),plan=await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,parameters);
    captured.push({sql,parameters,startedAt:before,endedAt:new Date().toISOString(),plan:plan.rows});
   }
   return pool.query(sql,parameters);
  }} as DB;
  const result=await service.list({tenantId:'T1',personId:def.actor},candidate,{limit:50,history:def.history,aggregate:def.history,groupBy:def.history?'department,job,status':undefined},db);
  await writeFile(`${output}/${candidate}-${scenario}.json`,JSON.stringify({candidate,scenario,actualEndpointPath:def.path,revision:result.evidence.revision,captured},null,2));
 }
 console.log('Saved exact executed endpoint count/list/aggregate SQL, parameters and EXPLAIN ANALYZE BUFFERS');
}finally{await cache.close();await pool.end();}
