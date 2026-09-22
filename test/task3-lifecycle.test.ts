import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: role fanout, explicit recheck and populated move`,async t=>{
 await prepareAdmin(); const api=await start(candidate),prefix='life-'+randomUUID();
 const p=policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D1']});
 const roleBody={id:prefix,level:3,managementRoleMembershipId:'admin',policies:[p],memberPersonIds:['M','L']};
 try{
  const created=await api.request('POST','/roles',roleBody);await observe(candidate,'lifecycle create',200,created.status);
  const [m,l]=created.body.membershipIds;
  await pool.query("UPDATE authz.membership SET data=jsonb_set(data,'{overrides}',$2) WHERE tenant_id='T1' AND id=$1",[m,JSON.stringify([{membershipId:m,nodeId:'department-report',scope:null}])]);
  await t.test('role edit propagates every member and preserves local override',async()=>{
   const edited=await api.request('POST','/roles/'+prefix,{...roleBody,policies:[policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D2']})]});
   await observe(candidate,'AUTH-T24 role edit API',200,edited.status);
   const rows=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND role_id=$1 ORDER BY person_id",[prefix])).rows;
   await observe(candidate,'AUTH-T24 canonical role fanout',['D2','D2'],rows.map(r=>r.data.policies[0].scope.departmentIds[0]));
   await observe(candidate,'AUTH-T24 local empty override retained',null,rows[1].data.overrides[0].scope);
  });
  await t.test('freeze requires explicit current-source recheck',async()=>{
   await pool.query("UPDATE organization.person SET manager_id=manager_id WHERE tenant_id='T1' AND id='A'");
   const state=(await pool.query("SELECT data->>'provenance' state FROM authz.membership WHERE tenant_id='T1' AND id=$1",[l])).rows[0].state;
   await observe(candidate,'AUTH-T20 frozen after org update','recheck_required',state);
   const checked=await api.request('POST','/memberships/'+l+'/recheck',{managementRoleMembershipId:'admin'});
   await observe(candidate,'AUTH-T20 explicit safe recheck',{status:200,state:'active'},{status:checked.status,state:checked.body.state});
  });
  await t.test('populated move succeeds within depth and freezes before response',async()=>{
   const moved=await api.request('POST','/departments/D1/move',{parentId:'D2'});
   await observe(candidate,'AUTH-T20 populated subtree moves',200,moved.status);
   const r=await pool.query("SELECT data->>'provenance' state FROM authz.membership WHERE tenant_id='T1' AND id=$1",[l]);
   await observe(candidate,'AUTH-T20 populated move freeze','recheck_required',r.rows[0].state);
   await api.request('POST','/departments/D1/move',{parentId:null});
  });
 }finally{await api.close();await pool.query("UPDATE organization.department SET parent_id=null WHERE tenant_id='T1' AND id='D1'");}
});
test.after(async()=>pool.end());
