import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool,transaction } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: AUTH-T07/T20/T24 selected-source matrix`,async t=>{
 await prepareAdmin();const api=await start(candidate),prefix='delegate-'+randomUUID();
 const management=policy('role-management',['authz.role.create','authz.role.update','authz.role.recheck']);
 const narrow=policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D1']});
 try{
  const src=await api.request('POST','/roles',{id:prefix+'src',level:2,managementRoleMembershipId:'admin',policies:[management,narrow],memberPersonIds:['M']});await observe(candidate,'matrix source create',200,src.status);const sourceId=src.body.membershipIds[0];
  // Independent B is deliberately broader; A must never borrow its actions/objects/fields.
  await pool.query("INSERT INTO authz.role(tenant_id,id) VALUES('T1',$1)",[prefix+'B']);
  const other={id:prefix+'B',tenantId:'T1',personId:'M',roleId:prefix+'B',level:1,active:true,provenance:'system_origin',policies:[policy('department-report',['report.personal-learning.view','report.personal-learning.update'],{kind:'all'},['phone'])]};
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'M',$1,$2)",[prefix+'B',other]);
  const command=(policies:any[]= [narrow],level=3)=>({id:prefix+randomUUID(),level,managementRoleMembershipId:sourceId,policies,memberPersonIds:['L']});
  for(const [name,body,want] of [
   ['AUTH-T07-01 level1',command([narrow],1),403],['AUTH-T07 create level2 allowed',command([narrow],2),200],['AUTH-T07 create level3 allowed',command(),200],
   ['AUTH-T07-05 node ceiling',command([policy('history',['report.history.view'])]),403],
   ['AUTH-T07-05 action ceiling',command([policy('department-report',['report.personal-learning.update'],{kind:'departments',departmentIds:['D1']})]),403],
   ['AUTH-T07-06 literal D2 outside D1',command([policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D2']})]),403],
   ['AUTH-T07-07 cannot borrow B phone',command([policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D1']},['phone'])]),403],
  ] as const)await t.test(name,async()=>{const r=await api.request('POST','/roles',body,'M');await observe(candidate,name,want,r.status);});
  for(const [name,id,level] of [['AUTH-T07-02 level1 ordinary edit','role-4',1],['AUTH-T07-03 samelevel',prefix+'src',2],['AUTH-T07-04 higher', 'role-4',1]] as const)await t.test(name,async()=>{
   const r=await api.request('POST','/roles/'+id,{...command(),level},'M');await observe(candidate,name,403,r.status);
  });
  await t.test('AUTH-T07-08 explicit delegability',async()=>{
   const no=await api.request('POST','/roles',{id:prefix+'nondelegable',level:2,managementRoleMembershipId:'admin',policies:[management,{...narrow,delegableActions:[]}],memberPersonIds:['M']});
   const r=await api.request('POST','/roles',{...command(),managementRoleMembershipId:no.body.membershipIds[0]},'M');await observe(candidate,'AUTH-T07-08 owned but nondelegable',403,r.status);
  });
  await t.test('level3 create still permits level2 but level3 cannot edit equal or higher',async()=>{
   const src3=await api.request('POST','/roles',{id:prefix+'src3',level:3,managementRoleMembershipId:'admin',policies:[management,narrow],memberPersonIds:['M']});
   const selected=src3.body.membershipIds[0];
   const create2=await api.request('POST','/roles',{...command([narrow],2),managementRoleMembershipId:selected},'M');await observe(candidate,'AUTH-T07 level3 can create level2',200,create2.status);
   const same=await api.request('POST','/roles/'+prefix+'src3',{...command(),managementRoleMembershipId:selected},'M');await observe(candidate,'AUTH-T07-03 level3 samelevel edit',403,same.status);
   const higher=await api.request('POST','/roles/'+prefix+'src',{...command([narrow],2),managementRoleMembershipId:selected},'M');await observe(candidate,'AUTH-T07-04 level3 higher edit',403,higher.status);
   const unsupported=await api.request('POST','/roles',{...command([policy('course',['knowledge.course.maintain'],{kind:'ownDept'})]),managementRoleMembershipId:'admin'});await observe(candidate,'unsupported course department scope rejects save',403,unsupported.status);
   const appointment=await api.request('POST','/roles',{...command(),managementRoleMembershipId:'L-Q'},'L');await observe(candidate,'AUTH-T24 appointment never serves selected membership',403,appointment.status);
  });
  await t.test('source shrink suspends and restore requires explicit audit recheck',async()=>{
   const child=await api.request('POST','/roles',command(),'M');await observe(candidate,'derived create before shrink',200,child.status);const childId=child.body.membershipIds[0];
   const edited=await api.request('POST','/roles/'+prefix+'src',{level:2,managementRoleMembershipId:'admin',policies:[management,policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D2']})]});await observe(candidate,'AUTH-T20 source shrink edit',200,edited.status);
   const check=await api.request('POST','/memberships/'+childId+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'AUTH-T20 exceeds source suspended',{status:200,state:'suspended'},{status:check.status,state:check.body.state});
   await api.request('POST','/roles/'+prefix+'src',{level:2,managementRoleMembershipId:'admin',policies:[management,narrow]});
   const restored=await api.request('POST','/memberships/'+childId+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'AUTH-T20 restored explicit active','active',restored.body.state);
   const audit=(await pool.query("SELECT details->>'state' state FROM authz.audit WHERE tenant_id='T1' AND event='delegation.recheck' AND details->>'id'=$1 ORDER BY id",[childId])).rows;
   await observe(candidate,'AUTH-T20 audit states',['suspended','active'],audit.map(r=>r.state));
   const cycle=await transaction(async db=>{await db.query("UPDATE authz.membership SET source_id=$2 WHERE tenant_id='T1' AND id=$1",[sourceId,childId]);return 'accepted';}).catch(()=> 'rejected');await observe(candidate,'AUTH-T20 graph cycle rejected','rejected',cycle);
   await pool.query("UPDATE authz.membership SET data=jsonb_set(data,'{overrides}',$2) WHERE tenant_id='T1' AND id=$1",[sourceId,JSON.stringify([{membershipId:sourceId,nodeId:'department-report',scope:null}])]);
   await api.request('POST','/memberships/'+sourceId+'/revoke',{});
   const newSource=await api.request('POST','/roles/'+prefix+'src/members',{personId:'M',managementRoleMembershipId:'admin'});await observe(candidate,'AUTH-T24 recreated source',200,newSource.status);
   const fresh=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id=$1",[newSource.body.id])).rows[0].data;
   await observe(candidate,'AUTH-T24 fresh membership has new ID and no old override',{newId:true,overrides:null},{newId:fresh.id!==sourceId,overrides:fresh.overrides??null});
   const old=await api.request('POST','/memberships/'+childId+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'AUTH-T24 old dependency never revives','suspended',old.body.state);
  });
 }finally{await api.close();}
});
test.after(async()=>pool.end());
