import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {syntheticMissingDepartment} from './task4-helper.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: one membership has simultaneous independent node scopes`,async()=>{
 const a=await start(candidate,4311),b=await start(candidate,4312),id='t5-one-role-'+candidate;
 try{
  await a.request('POST','/people/L',{departmentId:'D1'});
  const m={id,tenantId:'T1',personId:'L',roleId:'role-10',level:2,active:true,provenance:'system_origin',policies:[policy('personal-learning',['report.personal-learning.view'],{kind:'all'}),policy('department-report',['report.personal-learning.view'],{kind:'ownDept'})]};
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'L','role-10',$2)",[id,m]);
  for(const [instance,api] of [['A',a],['B',b]] as const){
   const all=await api.request('GET','/report?fixture=true',undefined,'L'),dept=await api.request('GET','/report?fixture=true&node=department-report',undefined,'L'),allB=await api.request('GET','/report?id=B',undefined,'L'),deptB=await api.request('GET','/report?node=department-report&id=B',undefined,'L');
   await observe(candidate,'T01 one membership simultaneous two-node literal lists counts and same B direct ID '+instance,{all:{status:200,ids:['A','B','C','D','E','M','N'],count:7,sources:['role:'+id+':personal-learning:report.personal-learning.view']},dept:{status:200,ids:['A','C','M'],count:3,sources:['role:'+id+':department-report:report.personal-learning.view']},sameB:{allStatus:200,allIds:['B'],deptStatus:403,deptRows:null}},{all:{status:all.status,ids:all.body.rows?.map((r:any)=>r.id),count:all.body.count,sources:all.body.evidence?.sourceIds},dept:{status:dept.status,ids:dept.body.rows?.map((r:any)=>r.id),count:dept.body.count,sources:dept.body.evidence?.sourceIds},sameB:{allStatus:allB.status,allIds:allB.body.rows?.map((r:any)=>r.id),deptStatus:deptB.status,deptRows:deptB.body.rows??null}});
  }
 }finally{await b.close();await a.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);await syntheticMissingDepartment('L');}
});test.after(()=>pool.end());
