import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,prepareAdmin,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: management account cap includes future same-company entries`,async()=>{
 await prepareAdmin();const api=await start(candidate),id='t4-account-cap-'+candidate;
 try{
  const role=await api.request('POST','/roles',{id,level:3,managementRoleMembershipId:'admin',policies:[policy('account',['account.entry.view','account.entry.export'],{kind:'self'})],memberPersonIds:['L']});await observe(candidate,'account role before any L entry',200,role.status);
  await pool.query("INSERT INTO account.source VALUES('T1','I',$1,'source-I'),('T1','A',$1,'source-A')",[id]);
  await pool.query("INSERT INTO account.entry(tenant_id,id,person_id,data_company_id,currency,kind,amount,remaining,source_id) VALUES('T1',$1,'L','I','credit','reward',5,5,$3),('T1',$2,'L','A','credit','reward',6,6,$3)",[id+'-same',id+'-other',id]);
  const r=await api.request('GET','/account/entries',undefined,'L');await observe(candidate,'future same-company account entry only',[id+'-same'],r.body.rows?.map((r:any)=>r.id));
  await observe(candidate,'account export uses stable person company cap',[id+'-same'],(await api.request('GET','/account/export',undefined,'L')).body.rows?.map((r:any)=>r.id));
 }finally{await api.close();await pool.query("DELETE FROM account.entry WHERE tenant_id='T1' AND source_id=$1",[id]);await pool.query("DELETE FROM account.source WHERE tenant_id='T1' AND id=$1",[id]);await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND role_id=$1",[id]);await pool.query("DELETE FROM authz.role WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(()=>pool.end());
