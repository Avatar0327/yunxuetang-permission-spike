import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: editing content permissions still requires target member company`,async t=>{
 await prepareAdmin();const api=await start(candidate),id='rolecompany-'+randomUUID(),content=policy('course',['knowledge.course.maintain']);
 try{
  await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='M' AND company_id IN('A','B')");
  const source=await api.request('POST','/roles',{id:id+'src',level:2,managementRoleMembershipId:'admin',policies:[policy('role-management',['authz.role.create','authz.role.update','authz.role.recheck']),content],memberPersonIds:['M']});
  const target=await api.request('POST','/roles',{id:id+'target',level:3,managementRoleMembershipId:'admin',policies:[content],memberPersonIds:['X']});
  await observe(candidate,'company fixtures',[200,200],[source.status,target.status]);
  await t.test('recheck cross-company membership is denied',async()=>{
   const r=await api.request('POST','/memberships/'+target.body.membershipIds[0]+'/recheck',{managementRoleMembershipId:source.body.membershipIds[0]},'M');await observe(candidate,'role recheck respects target company',403,r.status);
  });
  await t.test('editing cross-company membership is denied',async()=>{
   const r=await api.request('POST','/roles/'+id+'target',{level:3,managementRoleMembershipId:source.body.membershipIds[0],policies:[content]},'M');await observe(candidate,'role edit respects target company',403,r.status);
  });
 }finally{await api.close();await pool.query("INSERT INTO authz.company_grant VALUES('T1','M','A'),('T1','M','B') ON CONFLICT DO NOTHING");}
});
test.after(async()=>pool.end());
