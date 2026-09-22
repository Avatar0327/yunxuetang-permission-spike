import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: direct-team enrollment paths`,async()=>{
 const api=await start(candidate),id='t4-team-'+candidate;
 try{
  await pool.query("INSERT INTO training.project(tenant_id,id,created_by,title,team_enabled) VALUES('T1',$1,'Z',$1,true)",[id]);
  const m={id,tenantId:'T1',personId:'M',roleId:'role-5',level:2,active:true,provenance:'system_origin',policies:[policy('team-enrollment',['training.enrollment.add','training.enrollment.remove'])]};
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'M','role-5',$2)",[id,m]);
  const r=await api.request('POST','/projects/'+id+'/enrollments',{operation:'add',personIds:['A','B']},'M');await observe(candidate,'team includes direct A and cross-department B',200,r.status);
  await observe(candidate,'team persisted literal A B',['A','B'],(await pool.query("SELECT person_id FROM training.roster WHERE tenant_id='T1' AND project_id=$1 ORDER BY person_id",[id])).rows.map(r=>r.person_id));
  for(const target of ['C','D','E','missing','other-1','disabled','deleted']){const r=await api.request('POST','/projects/'+id+'/enrollments',{operation:'add',personIds:[target]},'M');await observe(candidate,'team denies '+target,403,r.status);}
  await api.request('POST','/people/B',{managerId:null});await observe(candidate,'cleared manager removes direct-team authority',403,(await api.request('POST','/projects/'+id+'/enrollments',{operation:'remove',personIds:['A','B']},'M')).status);await api.request('POST','/people/B',{managerId:'M'});
  await api.request('POST','/people/B',{enabled:false});await observe(candidate,'disabled target removes team authority',403,(await api.request('POST','/projects/'+id+'/enrollments',{operation:'remove',personIds:['A','B']},'M')).status);await api.request('POST','/people/B',{enabled:true});
  await api.request('POST','/people/X',{managerId:'M'});await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='M' AND company_id='A'");await observe(candidate,'direct subordinate still intersected with company cap',403,(await api.request('POST','/projects/'+id+'/enrollments',{operation:'add',personIds:['X']},'M')).status);await pool.query("INSERT INTO authz.company_grant VALUES('T1','M','A')");await api.request('POST','/people/X',{managerId:null});
  const bad=await api.request('POST','/projects/'+id+'/enrollments',{operation:'remove',personIds:['A','C']},'M');await observe(candidate,'team mixed batch all-or-nothing',403,bad.status);
  await observe(candidate,'batch retained A B',['A','B'],(await pool.query("SELECT person_id FROM training.roster WHERE tenant_id='T1' AND project_id=$1 ORDER BY person_id",[id])).rows.map(r=>r.person_id));
  await api.request('POST','/projects/'+id,{teamEnabled:false});
  await observe(candidate,'switch off denies team',403,(await api.request('POST','/projects/'+id+'/enrollments',{operation:'remove',personIds:['A']},'M')).status);
  await api.request('POST','/appointments',{personId:'M',projectId:id,active:true});
  await observe(candidate,'appointment remains independent from switch',200,(await api.request('POST','/projects/'+id+'/enrollments',{operation:'add',personIds:['C']},'M')).status);
  await api.request('POST','/appointments',{personId:'M',projectId:id,active:false});await api.request('POST','/projects/'+id,{teamEnabled:true});
  await observe(candidate,'team removal A B',200,(await api.request('POST','/projects/'+id+'/enrollments',{operation:'remove',personIds:['A','B']},'M')).status);
 }finally{await api.request('POST','/people/B',{managerId:'M',enabled:true});await api.request('POST','/people/X',{managerId:null});await api.close();await pool.query("INSERT INTO authz.company_grant VALUES('T1','M','A') ON CONFLICT DO NOTHING");await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);await pool.query("DELETE FROM training.roster WHERE tenant_id='T1' AND project_id=$1",[id]);await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND project_id=$1",[id]);await pool.query("DELETE FROM training.project WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(()=>pool.end());
