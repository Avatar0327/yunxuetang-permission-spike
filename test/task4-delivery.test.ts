import test from 'node:test';
import {createClient} from 'redis';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,prepareAdmin,policy} from './task3-helper.js';
async function blocked(){for(let i=0;i<100;i++){const r=await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE '%FOR UPDATE OF r%'");if(r.rows[0].n)return;await new Promise(r=>setTimeout(r,20));}throw Error('no revision lock waiter');}
for(const candidate of ['native','casbin'])test(`${candidate}: team lock order, two instances, Redis failure`,async()=>{
 await prepareAdmin();const a=await start(candidate,4311),b=await start(candidate,4312),id='t4-delivery-'+candidate,writer=await pool.connect();const redis=createClient({socket:{host:'127.0.0.1',port:56379}});redis.on('error',()=>{});let pending:Promise<any>|undefined;
 try{
  await pool.query("INSERT INTO training.project(tenant_id,id,created_by,title,team_enabled) VALUES('T1',$1,'Z',$1,true)",[id]);
  const m={id,tenantId:'T1',personId:'M',roleId:'role-7',level:2,active:true,provenance:'system_origin',policies:[policy('team-enrollment',['training.enrollment.add','training.enrollment.remove'])]};await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'M','role-7',$2)",[id,m]);
  await writer.query('BEGIN');await writer.query("SELECT revision FROM authz.revision WHERE tenant_id='T1' FOR UPDATE");
  await writer.query("UPDATE authz.membership SET data=jsonb_set(data,'{active}','false') WHERE tenant_id='T1' AND id=$1",[id]);
  pending=b.request('POST','/projects/'+id+'/enrollments',{operation:'add',personIds:['A','B']},'M');await blocked();await writer.query('COMMIT');
  await observe(candidate,'revoke committed before waiting batch denies',403,(await pending).status);
  await observe(candidate,'waiting denied batch writes zero',0,(await pool.query("SELECT count(*)::int n FROM training.roster WHERE tenant_id='T1' AND project_id=$1",[id])).rows[0].n);
  await pool.query("UPDATE authz.membership SET data=jsonb_set(data,'{active}','true') WHERE tenant_id='T1' AND id=$1",[id]);
  await observe(candidate,'batch saves before later revoke',200,(await a.request('POST','/projects/'+id+'/enrollments',{operation:'add',personIds:['A','B']},'M')).status);
  await a.request('POST','/memberships/'+id+'/revoke',{});
  await observe(candidate,'next new remove sees committed revoke',403,(await b.request('POST','/projects/'+id+'/enrollments',{operation:'remove',personIds:['A','B']},'M')).status);
  await observe(candidate,'committed authorized batch retained',['A','B'],(await pool.query("SELECT person_id FROM training.roster WHERE tenant_id='T1' AND project_id=$1 ORDER BY person_id",[id])).rows.map(r=>r.person_id));
  await a.request('POST','/appointments',{personId:'M',projectId:'P',active:true});
  await b.request('GET','/projects/P/roster',undefined,'M');
  const revoke=await a.request('POST','/company-grants',{personId:'M',companyId:'A',active:false,managementRoleMembershipId:'admin'});
  const after=await b.request('GET','/projects/P/roster',undefined,'M');await observe(candidate,'two instances next request company revoke no pubsub',{ids:['A','Y'],pubsub:false,afterCommit:true},{ids:after.body.rows?.map((x:any)=>x.person_id),pubsub:after.body.meta.pubsub,afterCommit:after.body.meta.requestAt>=revoke.body.meta.responseAt});
  await b.request('GET','/account/own',undefined,'X');await redis.connect();await redis.sendCommand(['CLIENT','PAUSE','650','ALL']);
  const failure=await b.request('GET','/account/own',undefined,'X');await observe(candidate,'warm own-account Redis failure has no balances',{status:503,rows:null},{status:failure.status,rows:failure.body.rows??null});await new Promise(r=>setTimeout(r,700));
  await observe(candidate,'recovered account uses current authority',200,(await b.request('GET','/account/own',undefined,'X')).status);
  await redis.sendCommand(['CLIENT','PAUSE','650','ALL']);const cold=await a.request('GET','/projects/P/people/X/attachment',undefined,'Y');await observe(candidate,'cold attachment Redis failure has no bytes',{status:503,bytes:null},{status:cold.status,bytes:cold.body.bytes??null});await new Promise(r=>setTimeout(r,700));
 }finally{await writer.query('ROLLBACK');if(pending)await pending;writer.release();await redis.close();await b.close();await a.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);await pool.query("DELETE FROM training.roster WHERE tenant_id='T1' AND project_id=$1",[id]);await pool.query("DELETE FROM training.project WHERE tenant_id='T1' AND id=$1",[id]);await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND person_id='M' AND project_id='P'");await pool.query("INSERT INTO authz.company_grant VALUES('T1','M','A') ON CONFLICT DO NOTHING");}
});
test.after(()=>pool.end());
