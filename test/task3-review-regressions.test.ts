import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
const management=policy('role-management',['authz.role.create','authz.role.update','authz.role.recheck']);
async function membership(id:string,personId:string,policies:any[]){
 await pool.query("INSERT INTO authz.role(tenant_id,id) VALUES('T1',$1)",[id]);
 const data={id,tenantId:'T1',personId,roleId:id,level:2,active:true,provenance:'system_origin',policies};
 await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,$2,$1,$3)",[id,personId,data]);return id;
}
async function course(id:string,uploader:string,accessible=true){
 await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id) VALUES('T1',$1,$2)",[id,uploader]);
 await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published,accessible) VALUES('T1',$1,$1,$2,'Z',$1,true,$3)",[id,uploader,accessible]);
}
for(const candidate of ['native','casbin'])test(`${candidate}: Task3 review regressions`,async t=>{
 await prepareAdmin();const api=await start(candidate);const id='review-'+randomUUID();
 try{
  await t.test('R1 original source company revoke stays suspended under broad rechecker',async()=>{
   await course(id+'company','M');const p=policy('course',['knowledge.course.maintain']);
   const source=await membership(id+'company-source','M',[management,p]);
   const issued=await api.request('POST','/roles',{id:id+'company-role',level:3,managementRoleMembershipId:source,policies:[p],memberPersonIds:['X']},'M');await observe(candidate,'R1 initial customer assignment',200,issued.status);const child=issued.body.membershipIds[0];
   try{
    await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='M' AND company_id='A'");
    await observe(candidate,'R1 original source remains active','system_origin',(await pool.query("SELECT data->>'provenance' state FROM authz.membership WHERE tenant_id='T1' AND id=$1",[source])).rows[0].state);
    const check=await api.request('POST','/memberships/'+child+'/recheck',{managementRoleMembershipId:'admin'});
    await observe(candidate,'R1 revoke A then Z recheck suspended',{status:200,state:'suspended'},{status:check.status,state:check.body.state});
   }finally{await pool.query("INSERT INTO authz.company_grant VALUES('T1','M','A') ON CONFLICT DO NOTHING");}
   const restored=await api.request('POST','/memberships/'+child+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'R1 restored source company recheck active',{status:200,state:'active'},{status:restored.status,state:restored.body.state});
  });
  await t.test('R2 recipient D2 relative scope uses recipient for create/edit/add/recheck',async()=>{
   const p=policy('department-report',['report.personal-learning.view'],{kind:'ownDept'});
   const source=await membership(id+'relative-source','M',[management,policy('department-report',['report.personal-learning.view'],{kind:'departments',departmentIds:['D2']})]);
   const body={id:id+'relative-role',level:3,managementRoleMembershipId:source,policies:[p],memberPersonIds:['B']};
   const created=await api.request('POST','/roles',body,'M');await observe(candidate,'R2 D1 grantor D2 cap to D2 ownDept create',200,created.status);const child=created.body.membershipIds[0];
   const cap=async(id:string)=>(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id])).rows[0].data.delegation.caps[0].objectIds;
   await observe(candidate,'R2 literal recipient objects',['B','E','N'],await cap(child));
   const edit=await api.request('POST','/roles/'+body.id,body,'M');await observe(candidate,'R2 relative edit',200,edit.status);
   const add=await api.request('POST','/roles/'+body.id+'/members',{personId:'E',managementRoleMembershipId:source},'M');await observe(candidate,'R2 relative add member',200,add.status);await observe(candidate,'R2 second recipient cap',['B','E','N'],await cap(add.body.id));
   await pool.query("UPDATE organization.person SET manager_id=manager_id WHERE tenant_id='T1' AND id='B'");
   const check=await api.request('POST','/memberships/'+child+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'R2 relative recheck',{status:200,state:'active',cap:['B','E','N']},{status:check.status,state:check.body.state,cap:await cap(child)});
   for(const [name,grant] of [['field',policy('department-report',['report.personal-learning.view'],{kind:'ownDept'},['phone'])],['action',policy('department-report',['report.personal-learning.update'],{kind:'ownDept'})]] as const){
    const denied=await api.request('POST','/roles',{...body,id:id+'empty-'+name,policies:[grant],memberPersonIds:['L']},'M');await observe(candidate,'R2 empty recipient preserves '+name+' ceiling',403,denied.status);
   }
   const nondelegable=await membership(id+'empty-source','M',[management,policy('department-report',['report.personal-learning.view'],{kind:'all'},[],[])]);
   const no=await api.request('POST','/roles',{...body,id:id+'empty-delegability',managementRoleMembershipId:nondelegable,memberPersonIds:['L']},'M');await observe(candidate,'R2 empty recipient preserves delegability',403,no.status);
  });
  await t.test('R3 custom browse compares one selected own course, not unrelated courses',async()=>{
   await course(id+'own','M');await course(id+'other','Z');
   const selected=await membership(id+'self-source','M',[policy('course',['knowledge.course.maintain','knowledge.course.browse'],{kind:'self'})]);
   await membership(id+'broad-maintain','M',[policy('course',['knowledge.course.maintain'],{kind:'all'},[],[])]);
   const body={managementRoleMembershipId:selected,grants:[{action:'knowledge.course.browse',subject:{type:'user',id:'L'}}]};
   const saved=await api.request('POST','/courses/'+id+'own/browse-policy',body,'M');await observe(candidate,'R3 selected SELF custom own course',200,saved.status);
   const snapshot=(await pool.query("SELECT custom_snapshot FROM knowledge.course WHERE tenant_id='T1' AND id=$1",[id+'own'])).rows[0].custom_snapshot;
   await observe(candidate,'R3 saved affected course cap',[id+'own'],snapshot.caps[0].objectIds);
   const granted=await api.request('GET','/courses/'+id+'own',undefined,'L');await observe(candidate,'R3 custom subject can browse own course',200,granted.status);
   const other=await api.request('POST','/courses/'+id+'other/browse-policy',body,'M');await observe(candidate,'R3 cannot borrow maintain role to grant other uploader',403,other.status);
   const check=await api.request('POST','/courses/'+id+'own/recheck',{});await observe(candidate,'R3 custom recheck retains target-only set',{status:200,state:'active'},{status:check.status,state:check.body.state});
  });
  await t.test('R3 category ceiling follows affected inherited and forced course sets',async()=>{
   const root=id+'category';await course(root,'M');await course(root+'child','M');await course(root+'other','Z');
   await pool.query("UPDATE knowledge.category SET parent_id=$2,inherit_parent=true WHERE tenant_id='T1' AND id=$1",[root+'child',root]);
   const selected=await membership(root+'source','M',[policy('course',['knowledge.course.browse'],{kind:'self'})]);
   const body={managementRoleMembershipId:selected,grants:[{action:'knowledge.course.browse',subject:{type:'user',id:'L'}}]};
   const save=await api.request('POST','/categories/'+root,body,'M');await observe(candidate,'R3 SELF category includes inherited own courses only',200,save.status);
   const caps=async()=>(await pool.query("SELECT authority_snapshot FROM knowledge.category WHERE tenant_id='T1' AND id=$1",[root])).rows[0].authority_snapshot.caps[0].objectIds;
   await observe(candidate,'R3 category persisted affected set',[root,root+'child'],await caps());
   const check=await api.request('POST','/categories/'+root+'/recheck',{});await observe(candidate,'R3 category recheck affected set',{status:200,state:'active'},{status:check.status,state:check.body.state});
   await pool.query("UPDATE knowledge.category SET parent_id=$2 WHERE tenant_id='T1' AND id=$1",[root+'other',root]);
   const forced=await api.request('POST','/categories/'+root,{...body,forceChildren:true},'M');await observe(candidate,'R3 forced descendant outside selected SELF denied',403,forced.status);
   await pool.query("UPDATE knowledge.category SET inherit_parent=true WHERE tenant_id='T1' AND id=$1",[root+'other']);
   const inherited=await api.request('POST','/categories/'+root,body,'M');await observe(candidate,'R3 inherited descendant outside selected SELF denied',403,inherited.status);
  });
  await t.test('R4 inaccessible course is maintainable by source and recipient but not browsable/downloadable',async()=>{
   await course(id+'inaccessible','M',false);const p=policy('course',['knowledge.course.maintain','knowledge.course.browse','knowledge.course.download']);
   const selected=await membership(id+'access-source','M',[management,p]);
   const sourceRead=await api.request('GET','/courses/'+id+'inaccessible?action=knowledge.course.maintain',undefined,'M');await observe(candidate,'R4 source maintains inaccessible',200,sourceRead.status);
   const created=await api.request('POST','/roles',{id:id+'access-role',level:3,managementRoleMembershipId:selected,policies:[p],memberPersonIds:['L']},'M');await observe(candidate,'R4 inaccessible delegation create',200,created.status);const child=created.body.membershipIds[0];
   const targetRead=await api.request('GET','/courses/'+id+'inaccessible?action=knowledge.course.maintain',undefined,'L');await observe(candidate,'R4 recipient maintains inaccessible',200,targetRead.status);
   const check=await api.request('POST','/memberships/'+child+'/recheck',{managementRoleMembershipId:'admin'});await observe(candidate,'R4 maintenance survives valid recheck','active',check.body.state);
   for(const actor of ['M','L'])for(const suffix of ['', '/download']){const denied=await api.request('GET','/courses/'+id+'inaccessible'+suffix,undefined,actor);await observe(candidate,'R4 inaccessible '+actor+' '+(suffix?'download':'browse')+' denied',403,denied.status);}
   const restored=await api.request('POST','/courses/'+id+'inaccessible',{accessible:true},'L');await observe(candidate,'R4 recipient can restore accessible state',200,restored.status);
  });
 }finally{await api.close();}
});
test.after(async()=>pool.end());
