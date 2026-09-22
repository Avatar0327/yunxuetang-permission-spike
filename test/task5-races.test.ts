import test from 'node:test';
import {appendFile} from 'node:fs/promises';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,prepareAdmin,policy} from './task3-helper.js';
async function waiter(){for(let n=0;n<150;n++){if((await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE '%FOR UPDATE OF r%'")).rows[0].n>0)return;await new Promise(r=>setTimeout(r,20));}throw Error('missing actual revision lock waiter');}
for(const candidate of ['native','casbin'])test(`${candidate}: ordered batch delegation and protected download race`,async()=>{
 await prepareAdmin();const a=await start(candidate,4311),b=await start(candidate,4312),writer=await pool.connect(),id='t5-race-'+candidate;let pending:Promise<any>|undefined;
 const original=(await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id='admin'")).rows[0].data;
 try{
  await writer.query('BEGIN');await writer.query("SELECT revision FROM authz.revision WHERE tenant_id='T1' FOR UPDATE");await writer.query("UPDATE authz.membership SET data=jsonb_set(data,'{active}','false') WHERE tenant_id='T1' AND id='admin'");
  pending=b.request('POST','/roles',{id,level:3,managementRoleMembershipId:'admin',memberPersonIds:['A','B'],policies:[policy('personal-learning',['report.personal-learning.view'],{kind:'self'})]});await waiter();await writer.query('COMMIT');const batch=await pending;
  await observe(candidate,'ordered batch delegation revoke wins and zero write',{status:403,roles:0,members:0},{status:batch.status,roles:(await pool.query("SELECT count(*)::int n FROM authz.role WHERE tenant_id='T1' AND id=$1",[id])).rows[0].n,members:(await pool.query("SELECT count(*)::int n FROM authz.membership WHERE tenant_id='T1' AND role_id=$1",[id])).rows[0].n});
  await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[original]);
  const control=await a.request('POST','/roles',{id,level:3,managementRoleMembershipId:'admin',memberPersonIds:['A','B'],policies:[policy('personal-learning',['report.personal-learning.view'],{kind:'self'})]});await observe(candidate,'batch delegation before later revoke commits both members',{status:200,members:2},{status:control.status,members:control.body.membershipIds?.length});
  const job=await a.request('POST','/exports',{fixture:true},'M');await a.request('POST','/exports/'+job.body.id+'/execute',{},'M');
  await writer.query('BEGIN');await writer.query("SELECT revision FROM authz.revision WHERE tenant_id='T1' FOR UPDATE");await writer.query("UPDATE authz.membership SET data=jsonb_set(data,'{active}','false') WHERE tenant_id='T1' AND id='m-broad'");
  pending=b.request('GET','/exports/'+job.body.id+'/claim',undefined,'M');await waiter();await writer.query('COMMIT');const commit=(await pool.query("SELECT revision::text,xmin::text,pg_xact_commit_timestamp(xmin) committed_at FROM authz.revision WHERE tenant_id='T1'")).rows[0],claim=await pending;
  await appendFile('evidence/raw/task5-race-timeline.jsonl',JSON.stringify({candidate,name:'waiting protected chunk claim',commit,claim})+'\n');
  await observe(candidate,'download chunk waits behind revoke and denies',{status:403,rows:null,observedRevision:Number(commit.revision)},{status:claim.status,rows:claim.body.rows??null,observedRevision:claim.body.meta.observedRevision});
  await observe(candidate,'old job ticket cannot bypass new request',403,(await b.request('GET','/exports/'+job.body.id+'/claim?chunk=0',undefined,'M')).status);
 }finally{await writer.query('ROLLBACK');if(pending)await pending;writer.release();await b.close();await a.close();await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='admin'",[original]);await pool.query("UPDATE authz.membership SET data=jsonb_set(data,'{active}','true') WHERE tenant_id='T1' AND id='m-broad'");await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND role_id=$1",[id]);await pool.query("DELETE FROM authz.role WHERE tenant_id='T1' AND id=$1",[id]);}
});test.after(()=>pool.end());
