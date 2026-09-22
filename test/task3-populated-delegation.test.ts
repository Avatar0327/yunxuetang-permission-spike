import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: populated department migration never expands saved delegation implicitly`,async()=>{
 await prepareAdmin();const api=await start(candidate),id='populated-'+randomUUID();
 const before=(await pool.query("SELECT id,department_id FROM organization.person WHERE tenant_id='T1' AND id IN('A','B')")).rows;
 try{
  await pool.query("INSERT INTO organization.department VALUES('T1',$1,null),('T1',$2,null)",[id+'cap',id+'incoming']);
  await pool.query("UPDATE organization.person SET department_id=CASE WHEN id='A' THEN $1 ELSE $2 END WHERE tenant_id='T1' AND id IN('A','B')",[id+'cap',id+'incoming']);
  const scope={kind:'departments',departmentIds:[id+'cap'],includeDescendants:true},p=policy('department-report',['report.personal-learning.view'],scope);
  const source=await api.request('POST','/roles',{id:id+'source',level:2,managementRoleMembershipId:'admin',policies:[policy('role-management',['authz.role.create','authz.role.update','authz.role.recheck']),p],memberPersonIds:['M']});await observe(candidate,'populated source creation',200,source.status);
  const sourceId=source.body.membershipIds[0],child=await api.request('POST','/roles',{id:id+'child',level:3,managementRoleMembershipId:sourceId,policies:[p],memberPersonIds:['L']},'M');await observe(candidate,'populated derived creation',200,child.status);const childId=child.body.membershipIds[0];
  const cap=async()=> (await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id=$1",[childId])).rows[0].data;
  await observe(candidate,'AUTH-T20-01 initial literal cap',['A'],(await cap()).delegation.caps[0].objectIds);
  const moved=await api.request('POST','/departments/'+id+'incoming/move',{parentId:id+'cap'});await observe(candidate,'AUTH-T20-01 populated B branch move',200,moved.status);
  await observe(candidate,'AUTH-T20-01 no unchecked expansion',{state:'recheck_required',cap:['A']},{state:(await cap()).provenance,cap:(await cap()).delegation.caps[0].objectIds});
  const premature=await api.request('POST','/memberships/'+childId+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'AUTH-T20-01 frozen parent cannot regrant','suspended',premature.body.state);
  await api.request('POST','/memberships/'+sourceId+'/recheck',{managementRoleMembershipId:'admin'});
  const explicit=await api.request('POST','/memberships/'+childId+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'AUTH-T20-01 explicit parent and child recheck',{state:'active',cap:['A','B']},{state:explicit.body.state,cap:(await cap()).delegation.caps[0].objectIds});
 }finally{await api.close();for(const row of before)await pool.query("UPDATE organization.person SET department_id=$2 WHERE tenant_id='T1' AND id=$1",[row.id,row.department_id]);}
});
test.after(async()=>pool.end());
