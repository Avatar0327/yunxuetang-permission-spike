import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {Authority} from '../src/authz/revision.js';
import {SessionCache} from '../src/authz/cache.js';
import {ReportService, type ListOptions} from '../src/report/service.js';
import {refreshHistoryAggregate} from '../src/report/history-aggregate.js';
import {observe} from './task3-helper.js';

// Round 2 (DIFF-05) equivalence: on the facts of the current refresh batch, the T-1 aggregate must equal
// the original live per-fact aggregate for the same actor, options and live authorization state. Facts
// changed after the refresh appear only after the next refresh. Requires a fresh seed; restores what it changes.
test('native: T-1 history aggregate equals the live aggregate under live authorization',async()=>{
 const cache=new SessionCache(),service=new ReportService(new Authority(cache));
 const pair=async(personId:string,o:ListOptions)=>{
  const id={tenantId:'T1',personId},t1=await service.list(id,'native',{history:true,aggregate:true,...o}),live=await service.list(id,'native',{history:true,aggregate:true,liveHistory:true,...o});
  return {t1:{mode:t1.historyMode,asOf:typeof t1.dataAsOf==='string',count:t1.count,rows:t1.rows},live:{mode:'T-1',asOf:true,count:live.count,rows:live.rows}};
 };
 const same=async(name:string,personId:string,o:ListOptions)=>{const r=await pair(personId,o);await observe('native','T-1 equals live: '+name,r.live,r.t1);return r;};
 try{
  await refreshHistoryAggregate('T1');
  for(const groupBy of [undefined,'department,job,status'] as const)for(const fixture of [false,true]){
   for(const state of ['enabled','all','disabled','deleted'] as const)for(const actor of ['M','X'])await same(`${actor} groupBy=${groupBy??'department'} fixture=${fixture} state=${state}`,actor,{groupBy,fixture,state});
   await same(`person-00003 groupBy=${groupBy??'department'} fixture=${fixture}`,'person-00003',{groupBy,fixture});
  }
  // A search narrows units inside cells, so whole-cell sums cannot be used and person aggregates are read.
  for(const search of ['person-0001','person-4','nobody'])for(const actor of ['M','person-00003'])await same(`${actor} partial cells search=${search}`,actor,{groupBy:'department,job,status',search});
  // Authorization and current person state stay live after the refresh, with no new refresh.
  await pool.query("UPDATE report.person_projection SET enabled=false WHERE tenant_id='T1' AND person_id IN ('person-00004','person-00005','person-00006')");
  try{for(const actor of ['M','person-00003'])await same(actor+' after live person disable',actor,{groupBy:'department,job,status'});}
  finally{await pool.query("UPDATE report.person_projection SET enabled=true WHERE tenant_id='T1' AND person_id IN ('person-00004','person-00005','person-00006')");}
  await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='M' AND company_id='B'");
  try{await same('M after live company grant revoke','M',{groupBy:'department,job,status'});}
  finally{await pool.query("INSERT INTO authz.company_grant VALUES('T1','M','B')");}
  const extra=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id='bm-extra'")).rows[0].data;
  await pool.query("UPDATE authz.membership SET data=jsonb_set(data,'{active}','false') WHERE tenant_id='T1' AND id='bm-extra'");
  try{await same('person-00003 after live membership deactivation','person-00003',{groupBy:'department,job,status'});}
  finally{await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='bm-extra'",[extra]);}
  // A fact written after the refresh is T-1 data: absent until the next refresh, then equal to live again.
  const before=await pair('M',{groupBy:'department,job,status'});
  await pool.query("INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,historical_job_id,historical_status,points) VALUES('T1','round2-t1-new','person-00004','A','round2-new-dept','old-job-1','enabled',7)");
  try{
   const pending=await pair('M',{groupBy:'department,job,status'});
   await observe('native','T-1 excludes a fact written after the refresh',before.t1,pending.t1);
   await observe('native','live includes a fact written after the refresh',true,pending.live.rows.some((r:any)=>r.historical_department_id==='round2-new-dept'));
   await refreshHistoryAggregate('T1');
   await same('M after the next refresh includes the new fact','M',{groupBy:'department,job,status'});
  }finally{await pool.query("DELETE FROM report.learning_fact WHERE tenant_id='T1' AND id='round2-t1-new'");await refreshHistoryAggregate('T1');}
 }finally{await cache.close();}
});
test.after(()=>pool.end());
