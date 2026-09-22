import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: empty and unsupported scopes and same-name tenant boundary`,async()=>{
 const api=await start(candidate),id='t4-empty-'+candidate;
 try{
  const m:any={id,tenantId:'T1',personId:'X',roleId:'role-10',level:3,active:true,provenance:'system_origin',policies:[]};
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'X','role-10',$2)",[id,m]);
  for(const [name,scope] of [['missing-department',{kind:'ownDept'}],['missing-subtree',{kind:'ownDeptSubtree'}],['empty-departments',{kind:'departments',departmentIds:[]}],['unknown-department',{kind:'departments',departmentIds:['unknown']}],['missing-jurisdiction',{kind:'managed'}]] as const){m.policies=[policy('personal-learning',['report.personal-learning.view'],scope)];await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);const r=await api.request('GET','/report',undefined,'X');await observe(candidate,'empty scope '+name,{status:200,count:0,rows:[]},{status:r.status,count:r.body.count,rows:r.body.rows});}
  m.policies=[policy('course',['knowledge.course.maintain'],{kind:'ownDept'})];await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);await observe(candidate,'unregistered course department scope fails closed',403,(await api.request('GET','/courses?action=knowledge.course.maintain',undefined,'X')).status);
  const same=await api.request('GET','/report?search=person-00001',undefined,'M');await observe(candidate,'same-name other tenant absent from list/count',{ids:['person-00001'],count:1},{ids:same.body.rows?.map((r:any)=>r.id),count:same.body.count});
  for(const field of ['phone','email','id_card'])await observe(candidate,'nonmatching source field never borrowed '+field,null,same.body.rows?.[0][field]);
 }finally{await api.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(()=>pool.end());
