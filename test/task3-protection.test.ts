import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
for(const candidate of ['native','casbin']) test(`${candidate}: live domain security boundaries`,async t=>{
 await prepareAdmin();const api=await start(candidate),prefix='t3-'+randomUUID();
 try {
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id,force_children) VALUES('T1',$1,'Z',true)",[prefix+'root']);
  await t.test('forced ancestor denies newly supplied child grants',async()=>{
   const r=await api.request('POST','/categories',{id:prefix+'child',parentId:prefix+'root',managementRoleMembershipId:'admin',grants:[{action:'knowledge.course.browse',subject:{type:'public',id:'T1'}}]});
   await observe(candidate,'AUTH-T09 forced child write',403,r.status);
  });
  await t.test('category grants require selected source delegability',async()=>{
   const r=await api.request('POST','/categories',{id:prefix+'bad-source',managementRoleMembershipId:'m-broad',grants:[{action:'knowledge.course.browse',subject:{type:'public',id:'T1'}}]});
   await observe(candidate,'AUTH-T09 category cannot borrow admin',403,r.status);
  });
  await pool.query("INSERT INTO authz.role(tenant_id,id) VALUES('T1',$1)",[prefix+'source-role']);
  const source={id:prefix+'source',tenantId:'T1',personId:'M',roleId:prefix+'source-role',level:2,active:true,provenance:'system_origin',policies:[policy('role-management',['authz.role.create','authz.role.update','authz.role.recheck']),policy('department-report',['report.personal-learning.view'],{kind:'ownDept'})]};
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'M',$2,$3)",[source.id,source.roleId,source]);
  await t.test('recipient own department cannot expand source actual objects',async()=>{
   const r=await api.request('POST','/roles',{id:prefix+'expansion',level:3,managementRoleMembershipId:source.id,policies:[policy('department-report',['report.personal-learning.view'],{kind:'ownDept'})],memberPersonIds:['B']},'M');
   await observe(candidate,'AUTH-T07 recipient D2 exceeds source D1',403,r.status);
  });
  await t.test('source shrink atomically freezes derived membership',async()=>{
   const r=await api.request('POST','/roles',{id:prefix+'derived',level:3,managementRoleMembershipId:source.id,policies:[policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D1']})],memberPersonIds:['L']},'M');
   await observe(candidate,'AUTH-T20 create within literal D1 cap',200,r.status);
   source.policies[1]!.scope={kind:'departments',departmentIds:['D2']};
   await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[source.id,source]);
   const data=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id=$1",[r.body.membershipIds[0]])).rows[0].data;
   await observe(candidate,'AUTH-T20 freeze committed with source shrink','recheck_required',data.provenance);
  });
 }finally{await api.close();await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='B'");}
});
test.after(async()=>pool.end());
