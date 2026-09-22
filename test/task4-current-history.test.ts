import test from 'node:test';
import {pool,transaction} from '../src/infrastructure/db.js';
import {syntheticMissingDepartment} from './task4-helper.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: current person state and immutable snapshots`,async()=>{
 const api=await start(candidate),id='t4-state-'+candidate;
 const before=(await pool.query("SELECT department_id,manager_id,job_id,enabled,deleted FROM organization.person WHERE tenant_id='T1' AND id='B'")).rows[0];
 try{
  await pool.query("INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,historical_job_id,historical_status,fixture,points) VALUES('T1',$1,'B','I','old-B-dept','old-B-job','enabled',true,9)",[id]);
  const get=async(state='enabled')=>api.request('GET',`/report?history=true&id=${id}&state=${state}`,undefined,'M');
  const snapshot={data_company_id:'I',historical_department_id:'old-B-dept',historical_job_id:'old-B-job',historical_status:'enabled'};
  const fact=async()=>{const r=(await get('all')).body.rows?.[0];return r&&Object.fromEntries(Object.keys(snapshot).map(k=>[k,r[k]]));};
  for(const [body,enabledStatus,disabledStatus,deletedStatus] of [[{enabled:false},403,200,403],[{enabled:true,deleted:true},403,403,200],[{enabled:true,deleted:false},200,403,403]] as const){
   await observe(candidate,'current mutation '+JSON.stringify(body),200,(await api.request('POST','/people/B',body)).status);
   await observe(candidate,'current state selects historical row '+JSON.stringify(body),[enabledStatus,disabledStatus,deletedStatus],[(await get()).status,(await get('disabled')).status,(await get('deleted')).status]);
   await observe(candidate,'history snapshots unchanged '+JSON.stringify(body),snapshot,await fact());
  }
  await observe(candidate,'clear current manager and change job',200,(await api.request('POST','/people/B',{managerId:null,jobId:'current-new-job'})).status);
  await syntheticMissingDepartment('B');
  await observe(candidate,'all current projections delivered atomically',{department_id:null,manager_id:null,job_id:'current-new-job'},(await pool.query("SELECT department_id,manager_id,job_id FROM report.person_projection WHERE tenant_id='T1' AND person_id='B'")).rows[0]);
  await observe(candidate,'move and clear never rewrite historical fields',snapshot,await fact());
  let immutable=false;try{await transaction(db=>db.query("UPDATE report.learning_fact SET historical_job_id='tamper' WHERE tenant_id='T1' AND id=$1",[id]));}catch{immutable=true;}await observe(candidate,'physical snapshot immutable',true,immutable);
  await observe(candidate,'transfer explicit both-company company/dept',200,(await api.request('POST','/people/X',{companyId:'B',departmentId:'wide-2'})).status);
  await observe(candidate,'new company SELF cannot read old company history',['h-X-B'],(await api.request('GET','/report?history=true&fixture=true',undefined,'X')).body.rows?.map((x:any)=>x.id));
  await observe(candidate,'transfer history data company retained',['A','B'],(await pool.query("SELECT data_company_id FROM report.learning_fact WHERE tenant_id='T1' AND id IN('h-X-A','h-X-B') ORDER BY id")).rows.map(r=>r.data_company_id));
  for(const [target,body] of [['B',{departmentId:'wide-1'}],['B',{managerId:'B'}],['B',{managerId:'other-1'}]] as const)await observe(candidate,'invalid relationship '+JSON.stringify(body),403,(await api.request('POST','/people/'+target,body)).status);
  // Raw list/detail and errors must preserve the matching source's field capability.
  await api.request('POST','/people/B',{departmentId:'D2',managerId:'M'});
  for(const target of ['A','B']){const r=await api.request('GET','/report?id='+target,undefined,'M');await observe(candidate,'same-row raw fields '+target,target==='A'?['phone-A','email-A','card-A']:[null,null,null],[r.body.rows?.[0].phone,r.body.rows?.[0].email,r.body.rows?.[0].id_card]);}
  const errors=[];for(const target of ['B','unknown','other-1']){const r=await api.request('GET','/report?node=department-report&id='+target,undefined,'M');errors.push({status:r.status,message:r.body.message,rows:r.body.rows??null});await observe(candidate,'safe raw error '+target,false,JSON.stringify(r.body).includes('phone-')||JSON.stringify(r.body).includes('card-')||JSON.stringify(r.body).includes('email-'));}
  await observe(candidate,'denial random and foreign indistinguishable',[errors[0],errors[0],errors[0]],errors);
 }finally{
  await api.request('POST','/people/B',{departmentId:before.department_id,managerId:before.manager_id,jobId:before.job_id,enabled:before.enabled,deleted:before.deleted});await api.request('POST','/people/X',{companyId:'A',departmentId:'wide-1'});await syntheticMissingDepartment('X');await api.close();await pool.query("DELETE FROM report.learning_fact WHERE tenant_id='T1' AND id=$1",[id]);
 }
});
test.after(()=>pool.end());
