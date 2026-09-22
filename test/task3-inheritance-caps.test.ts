import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {pool} from '../src/infrastructure/db.js';
import {prepareAdmin,start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: N1 inherited policy cannot expand its original saved cap`,async()=>{
 await prepareAdmin();const api=await start(candidate),prefix='inherit-cap-'+randomUUID(),parent=prefix+'P',child=prefix+'C',source=prefix+'source';
 const data={id:source,tenantId:'T1',personId:'M',roleId:source,level:2,active:true,provenance:'system_origin',policies:[policy('course',['knowledge.course.browse'],{kind:'self'})]};
 try{
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id) VALUES('T1',$1,'M'),('T1',$2,'M')",[parent,child]);
  await pool.query("UPDATE knowledge.category SET parent_id=$2 WHERE tenant_id='T1' AND id=$1",[child,parent]);
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'M','M',$1,true),('T1',$2,$2,'Z','Z',$2,true)",[parent,child]);
  await pool.query("INSERT INTO authz.role(tenant_id,id) VALUES('T1',$1)",[source]);
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'M',$1,$2)",[source,data]);
  const saved=await api.request('POST','/categories/'+parent,{managementRoleMembershipId:source,grants:[{action:'knowledge.course.browse',subject:{type:'user',id:'L'}}]},'M');
  await observe(candidate,'N1 narrow parent save',200,saved.status);
  const original=(await pool.query("SELECT authority_snapshot FROM knowledge.category WHERE tenant_id='T1' AND id=$1",[parent])).rows[0].authority_snapshot;
  await observe(candidate,'N1 saved parent cap excludes other uploader',[parent],original.caps[0].objectIds);
  const baseline=await api.request('GET','/courses/'+parent,undefined,'L');await observe(candidate,'N1 original parent course browsable',200,baseline.status);
  const rollback=await api.request('POST','/categories/import',{updates:[{id:child,managementRoleMembershipId:source,inheritParent:true,grants:[]},{id:parent,managementRoleMembershipId:source,grants:[{action:'invalid',subject:{type:'user',id:'L'}}]}]},'M');
  await observe(candidate,'N1 failed import rejects whole transaction',403,rollback.status);
  const afterRollback=(await pool.query("SELECT id,inherit_parent,provenance FROM knowledge.category WHERE tenant_id='T1' AND id=ANY($1::text[]) ORDER BY id",[[parent,child]])).rows;
  await observe(candidate,'N1 failed import rolls back inheritance and ancestor freeze',[{id:child,inherit_parent:false,provenance:'system_origin'},{id:parent,inherit_parent:false,provenance:'active'}],afterRollback);
  const switched=await api.request('POST','/categories/'+child,{managementRoleMembershipId:source,inheritParent:true,grants:[]},'M');await observe(candidate,'N1 child inherit mutation',200,switched.status);
  // Crucially no second parent save/recheck occurs before this request.
  const denied=await api.request('GET','/courses/'+child,undefined,'L');await observe(candidate,'N1 immediate inherited other-uploader course denied',403,denied.status);
  const frozen=(await pool.query("SELECT provenance,authority_snapshot FROM knowledge.category WHERE tenant_id='T1' AND id=$1",[parent])).rows[0];
  await observe(candidate,'N1 ancestor atomically frozen with unchanged cap',{state:'recheck_required',ids:[parent]},{state:frozen.provenance,ids:frozen.authority_snapshot.caps[0].objectIds});
  // Simulate an already-active persisted row to independently verify the second defense.
  await pool.query("UPDATE knowledge.category SET provenance='active' WHERE tenant_id='T1' AND id=$1",[parent]);
  const capDenied=await api.request('GET','/courses/'+child,undefined,'L');await observe(candidate,'N1 active ancestor still intersects inherited saved cap',403,capDenied.status);
  const capAllowed=await api.request('GET','/courses/'+parent,undefined,'L');await observe(candidate,'N1 active ancestor saved cap retains original course',200,capAllowed.status);
  const narrow=await api.request('POST','/categories/'+parent+'/recheck',{});await observe(candidate,'N1 original SELF source cannot recheck expanded ancestor',{status:200,state:'suspended'},{status:narrow.status,state:narrow.body.state});
  data.policies=[policy('course',['knowledge.course.browse'])];await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[source,data]);
  const restored=await api.request('POST','/categories/'+parent+'/recheck',{});await observe(candidate,'N1 original source broadened then explicit recheck active',{status:200,state:'active'},{status:restored.status,state:restored.body.state});
  const allowed=await api.request('GET','/courses/'+child,undefined,'L');await observe(candidate,'N1 child allowed only after original source explicit recheck',200,allowed.status);
 }finally{await api.close();}
});
for(const candidate of ['native','casbin'])test(`${candidate}: N1 persisted category and custom caps are enforced by action`,async()=>{
 await prepareAdmin();const api=await start(candidate),id='runtime-cap-'+randomUUID();
 const grant=(action:string,person='L')=>({action,subject:{type:'user',id:person}});
 try{
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id) VALUES('T1',$1,'Z')",[id]);
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'Z','Z',$1,true)",[id]);
  const saved=await api.request('POST','/categories/'+id,{managementRoleMembershipId:'admin',grants:[grant('knowledge.course.browse'),grant('knowledge.course.maintain')]});await observe(candidate,'N1 runtime category save',200,saved.status);
  const snapshot=(await pool.query("SELECT authority_snapshot FROM knowledge.category WHERE tenant_id='T1' AND id=$1",[id])).rows[0].authority_snapshot;
  for(const action of ['browse','maintain']){const r=await api.request('GET','/courses/'+id+'?action=knowledge.course.'+action,undefined,'L');await observe(candidate,'N1 runtime valid category '+action,200,r.status);}
  // Keep provenance active: this isolates saved-cap enforcement from the freeze mechanism.
  const browseOnly={...snapshot,caps:snapshot.caps.filter((c:any)=>c.action==='knowledge.course.browse')};
  await pool.query("UPDATE knowledge.category SET authority_snapshot=$2 WHERE tenant_id='T1' AND id=$1",[id,browseOnly]);
  for(const [action,want] of [['browse',200],['maintain',403]] as const){const r=await api.request('GET','/courses/'+id+'?action=knowledge.course.'+action,undefined,'L');await observe(candidate,'N1 runtime cap action isolation '+action,want,r.status);}
  await pool.query("UPDATE knowledge.category SET authority_snapshot=null WHERE tenant_id='T1' AND id=$1",[id]);
  const missing=await api.request('GET','/courses/'+id,undefined,'L');await observe(candidate,'N1 source-bound missing category snapshot denies',403,missing.status);
  await pool.query("UPDATE knowledge.category SET authority_snapshot=$2 WHERE tenant_id='T1' AND id=$1",[id,snapshot]);
  const custom=await api.request('POST','/courses/'+id+'/browse-policy',{managementRoleMembershipId:'admin',grants:[grant('knowledge.course.browse','X')]});await observe(candidate,'N1 runtime custom save',200,custom.status);
  const customSnapshot=(await pool.query("SELECT custom_snapshot FROM knowledge.course WHERE tenant_id='T1' AND id=$1",[id])).rows[0].custom_snapshot;
  await pool.query("UPDATE knowledge.course SET custom_snapshot=$2 WHERE tenant_id='T1' AND id=$1",[id,{...customSnapshot,caps:[{nodeId:'course',action:'knowledge.course.browse',objectIds:['unrelated-course'],rawFields:[]}]}]);
  const wrong=await api.request('GET','/courses/'+id,undefined,'X');await observe(candidate,'N1 runtime custom cap excludes wrong course ID',403,wrong.status);
  const fallback=await api.request('GET','/courses/'+id,undefined,'L');await observe(candidate,'N1 failed custom cap does not restore replaced category browse',403,fallback.status);
  const maintain=await api.request('GET','/courses/'+id+'?action=knowledge.course.maintain',undefined,'L');await observe(candidate,'N1 custom cap preserves independent category maintenance',200,maintain.status);
  await pool.query("UPDATE knowledge.course SET custom_snapshot=$2 WHERE tenant_id='T1' AND id=$1",[id,customSnapshot]);
  const restored=await api.request('GET','/courses/'+id,undefined,'X');await observe(candidate,'N1 valid custom saved cap permits its course',200,restored.status);
 }finally{await api.close();}
});
for(const candidate of ['native','casbin'])test(`${candidate}: N1 removing forced ownership freezes reappearing category and custom sources`,async()=>{
 await prepareAdmin();const api=await start(candidate),parent='force-cap-'+randomUUID(),child=parent+'child';
 const grants=[{action:'knowledge.course.maintain',subject:{type:'user',id:'L'}}];
 try{
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id) VALUES('T1',$1,'Z'),('T1',$2,'Z')",[parent,child]);
  await pool.query("UPDATE knowledge.category SET parent_id=$2 WHERE tenant_id='T1' AND id=$1",[child,parent]);
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'Z','Z',$1,true)",[child]);
  const local=await api.request('POST','/categories/'+child,{managementRoleMembershipId:'admin',grants});await observe(candidate,'N1 force fixture local policy save',200,local.status);
  const custom=await api.request('POST','/courses/'+child+'/browse-policy',{managementRoleMembershipId:'admin',grants:[{action:'knowledge.course.browse',subject:{type:'user',id:'X'}}]});await observe(candidate,'N1 force fixture custom save',200,custom.status);
  for(const forceChildren of [true,false]){const r=await api.request('POST','/categories/'+parent,{managementRoleMembershipId:'admin',grants:[],forceChildren});await observe(candidate,'N1 force switch '+forceChildren,200,r.status);}
  const states=(await pool.query("SELECT c.provenance,r.custom_provenance FROM knowledge.category c JOIN knowledge.course r ON r.tenant_id=c.tenant_id AND r.category_id=c.id WHERE c.tenant_id='T1' AND c.id=$1",[child])).rows[0];
  await observe(candidate,'N1 force release atomically freezes restored owners',{provenance:'recheck_required',custom_provenance:'recheck_required'},states);
  for(const [actor,action] of [['L','maintain'],['X','browse']] as const){const r=await api.request('GET','/courses/'+child+'?action=knowledge.course.'+action,undefined,actor);await observe(candidate,'N1 force release awaits explicit recheck '+action,403,r.status);}
  for(const kind of ['categories','courses']){const r=await api.request('POST','/'+kind+'/'+child+'/recheck',{});await observe(candidate,'N1 force release original-source recheck '+kind,{status:200,state:'active'},{status:r.status,state:r.body.state});}
  for(const [actor,action] of [['L','maintain'],['X','browse']] as const){const r=await api.request('GET','/courses/'+child+'?action=knowledge.course.'+action,undefined,actor);await observe(candidate,'N1 force release explicitly restored '+action,200,r.status);}
 }finally{await api.close();}
});
test.after(async()=>pool.end());
