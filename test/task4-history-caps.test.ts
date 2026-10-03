import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {refreshHistoryAggregate} from '../src/report/history-aggregate.js';
import {start,observe,prepareAdmin,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: history cap covers future facts of authorized people`,async()=>{
 await prepareAdmin();const api=await start(candidate),id='t4-history-'+candidate;
 const adminBefore=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id='admin'")).rows[0].data;
 try{
  const role=await api.request('POST','/roles',{id,level:3,managementRoleMembershipId:'admin',policies:[policy('history',['report.history.view','report.history.export'],{kind:'self'})],memberPersonIds:['L']});await observe(candidate,'history role for person without facts',200,role.status);
  await pool.query("INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,fixture) VALUES('T1',$1,'L','I','new-history',true),('T1',$2,'L','A','forbidden-history',true)",[id+'-same',id+'-other']);
  const r=await api.request('GET','/report?history=true&fixture=true',undefined,'L');await observe(candidate,'new same-company fact appears, other company denied',[id+'-same'],r.body.rows?.map((x:any)=>x.id));
  const membershipId=role.body.membershipIds[0];const saved=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id=$1",[membershipId])).rows[0].data;
  await observe(candidate,'history cap dimension and literal no-fact person/company',{dimension:'person-company-v1',ids:['["L","I"]']},{dimension:saved.delegation.caps[0].dimension,ids:saved.delegation.caps[0].objectIds});
  await observe(candidate,'history new fact detail',200,(await api.request('GET','/report?history=true&id='+id+'-same',undefined,'L')).status);
  // Round 2 (DIFF-05): the Native aggregate is T-1. A fact inserted today is absent until the next refresh,
  // after which the unchanged person/company cap must cover it exactly as before.
  if(candidate==='native'){const before=(await api.request('GET','/history?fixture=true',undefined,'L')).body;await observe(candidate,'T-1 history aggregate excludes new fact before refresh',{rows:[],historyMode:'T-1',dataAsOf:true},{rows:before.rows,historyMode:before.historyMode,dataAsOf:typeof before.dataAsOf==='string'});}
  await refreshHistoryAggregate('T1');
  await observe(candidate,'history aggregate new fact',[{historical_department_id:'new-history',count:1,points:'1'}],(await api.request('GET','/history?fixture=true',undefined,'L')).body.rows);
  const job=await api.request('POST','/exports',{history:true,fixture:true},'L');await api.request('POST','/exports/'+job.body.id+'/execute',{},'L');
  await observe(candidate,'history export shares person/company cap',[id+'-same'],(await api.request('GET','/exports/'+job.body.id+'/claim',undefined,'L')).body.rows?.map((r:any)=>r.id));
  await pool.query("DELETE FROM report.export_job WHERE tenant_id='T1' AND id=$1",[job.body.id]);
  for(const dimension of [undefined,'unknown-dimension']){const corrupt=structuredClone(saved);for(const cap of corrupt.delegation.caps){cap.dimension=dimension;cap.objectIds=[id+'-same'];}await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[membershipId,corrupt]);await observe(candidate,'legacy or unknown fact-id cap fails closed '+String(dimension),403,(await api.request('GET','/report?history=true&fixture=true',undefined,'L')).status);}
  await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[membershipId,saved]);
  await api.request('POST','/people/L',{enabled:false});await observe(candidate,'disabled history actor denied',403,(await api.request('GET','/report?history=true&fixture=true',undefined,'L')).status);
  await api.request('POST','/people/L',{enabled:true});await observe(candidate,'restoration retains source-change freeze',403,(await api.request('GET','/report?history=true&fixture=true',undefined,'L')).status);
  await observe(candidate,'explicit recheck after restore','active',(await api.request('POST','/memberships/'+membershipId+'/recheck',{managementRoleMembershipId:'admin'})).body.state);
  const narrowed=structuredClone(adminBefore);narrowed.policies=narrowed.policies.filter((p:any)=>p.nodeId!=='history');await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[narrowed]);
  await observe(candidate,'original-source history revoke freezes derived',403,(await api.request('GET','/report?history=true&fixture=true',undefined,'L')).status);
  await observe(candidate,'original-source missing history remains suspended','suspended',(await api.request('POST','/memberships/'+membershipId+'/recheck',{managementRoleMembershipId:'admin'})).body.state);
  await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[adminBefore]);await observe(candidate,'restored source explicit recheck active','active',(await api.request('POST','/memberships/'+membershipId+'/recheck',{managementRoleMembershipId:'admin'})).body.state);

 }finally{await api.request('POST','/people/L',{enabled:true});await api.close();await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[adminBefore]);await pool.query("DELETE FROM report.learning_fact WHERE tenant_id='T1' AND id LIKE $1",[id+'%']);await refreshHistoryAggregate('T1');await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND role_id=$1",[id]);await pool.query("DELETE FROM authz.role WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(()=>pool.end());
