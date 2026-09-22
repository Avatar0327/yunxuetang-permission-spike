import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: department move has explicit action and complete affected cap`,async t=>{
 const api=await start(candidate),id='t4-department-cap-'+candidate;
 const m:any={id,tenantId:'T1',personId:'M',roleId:'role-9',level:2,active:true,provenance:'system_origin',policies:[policy('administration',['organization.person.update'])]};
 const save=()=>pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);
 try{
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'M','role-9',$2)",[id,m]);
  await t.test('person action cannot authorize department',async()=>{await observe(candidate,'person-only move denied',403,(await api.request('POST','/departments/D11/move',{parentId:'D1'},'M')).status);});
  m.policies=[policy('department',['organization.department.move'])];m.delegation={sourceMembershipId:'admin',sourceActorId:'Z',revision:1,caps:[{nodeId:'department',action:'organization.department.move',objectIds:['D1','D11'],rawFields:[]}]};await save();
  await t.test('explicit department action positive',async()=>{await observe(candidate,'department source covers D11 and parent D1',200,(await api.request('POST','/departments/D11/move',{parentId:'D1'},'M')).status);});
  for(const [ids,target,parentId,name] of [[['D11'],'D11','D1','parent outside cap'],[['D1'],'D1',null,'child D11 outside cap'],[['D11'],'D11',null,'root has no parent object']] as const){m.delegation.caps[0].objectIds=ids;await save();await t.test(name,async()=>{await observe(candidate,'department '+name,name==='root has no parent object'?200:403,(await api.request('POST','/departments/'+target+'/move',{parentId},'M')).status);});}
 }finally{await api.close();await pool.query("UPDATE organization.department SET parent_id='D1' WHERE tenant_id='T1' AND id='D11'");await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(()=>pool.end());
