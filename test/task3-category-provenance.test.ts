import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,courseActions } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: category source cap snapshot and freeze`,async()=>{
 await prepareAdmin();const api=await start(candidate),id='catprov-'+randomUUID();
 try{
  const result=await api.request('POST','/categories',{id,managementRoleMembershipId:'admin',grants:[{action:courseActions[0],subject:{type:'public',id:'T1'}}]});await observe(candidate,'category provenance create',200,result.status);
  const raw=(await pool.query("SELECT to_jsonb(c) data FROM knowledge.category c WHERE tenant_id='T1' AND id=$1",[id])).rows[0].data;
  await observe(candidate,'category stores source cap version',{source:'admin',hasRevision:true,hasObjectSet:true},{source:raw.authority_snapshot?.sourceMembershipId,hasRevision:Number.isSafeInteger(raw.authority_snapshot?.revision),hasObjectSet:Array.isArray(raw.authority_snapshot?.caps?.[0]?.objectIds)});
  await pool.query("UPDATE authz.membership SET data=data WHERE tenant_id='T1' AND id='admin'");
  const state=(await pool.query("SELECT provenance FROM knowledge.category WHERE tenant_id='T1' AND id=$1",[id])).rows[0].provenance;
  await observe(candidate,'category source change freezes atomically','recheck_required',state);
 }finally{await api.close();}
});
test.after(async()=>pool.end());
