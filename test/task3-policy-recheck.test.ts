import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: category and custom recheck audit active/suspended from original source`,async()=>{
 await prepareAdmin();const api=await start(candidate),id='policyrecheck-'+randomUUID();
 const original=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id='admin'")).rows[0].data;
 try{
  const grants=[{action:'knowledge.course.browse',subject:{type:'user',id:'L'}}];
  await api.request('POST','/categories',{id,managementRoleMembershipId:'admin',grants});
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'Z','Z',$1,true)",[id]);
  await api.request('POST','/courses/'+id+'/browse-policy',{managementRoleMembershipId:'admin',grants});
  const smaller=structuredClone(original);smaller.policies.find((p:any)=>p.nodeId==='course').delegableActions=[];
  await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[smaller]);
  for(const kind of ['categories','courses']){
   const r=await api.request('POST','/'+kind+'/'+id+'/recheck',{});await observe(candidate,kind+' original-source shrink suspends',{status:200,state:'suspended'},{status:r.status,state:r.body.state});
  }
  await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[original]);
  for(const kind of ['categories','courses']){
   const r=await api.request('POST','/'+kind+'/'+id+'/recheck',{});await observe(candidate,kind+' explicit original-source restore',{status:200,state:'active'},{status:r.status,state:r.body.state});
  }
  const audit=(await pool.query("SELECT kind,state FROM knowledge.policy_audit WHERE tenant_id='T1' AND target_id=$1 ORDER BY id",[id])).rows;
  await observe(candidate,'knowledge policy recheck audit',[{kind:'category',state:'suspended'},{kind:'custom',state:'suspended'},{kind:'category',state:'active'},{kind:'custom',state:'active'}],audit);
 }finally{await api.close();await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[original]);}
});
test.after(async()=>pool.end());
