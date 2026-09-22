import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: company/currency wallet and true positive offset`,async t=>{
 const api=await start(candidate);
 try{
  await t.test('own split wallet',async()=>{const r=await api.request('GET','/account/own',undefined,'X');await observe(candidate,'own wallet separates A and B',{status:200,rows:[{company_id:'A',currency:'credit',balance:0,debt:30},{company_id:'B',currency:'credit',balance:20,debt:10},{company_id:'B',currency:'point',balance:8,debt:0}]},{status:r.status,rows:r.body.rows});});
  await t.test('cross-company denied positive same-company works',async()=>{
   const bad=await api.request('POST','/account/offset',{debtId:'debt-X-A',rewardId:'reward-X-B'});await observe(candidate,'B reward cannot offset A debt',403,bad.status);
   await observe(candidate,'same company different currency denied',403,(await api.request('POST','/account/offset',{debtId:'debt-X-B',rewardId:'reward-X-B-point'})).status);
   const good=await api.request('POST','/account/offset',{debtId:'debt-X-B',rewardId:'reward-X-B'});await observe(candidate,'same-company same-currency real offset',{status:200,offset:10},{status:good.status,offset:good.body.offset});
   const r=await api.request('GET','/account/own',undefined,'X');await observe(candidate,'offset persisted separated balances',[{company_id:'A',currency:'credit',balance:0,debt:30},{company_id:'B',currency:'credit',balance:10,debt:0},{company_id:'B',currency:'point',balance:8,debt:0}],r.body.rows);
  });
  await t.test('management source and export stay company-bound',async()=>{
   await observe(candidate,'own wallet cannot unlock cross-company source',403,(await api.request('GET','/account/entries/reward-X-B/source',undefined,'X')).status);
   await observe(candidate,'legitimate own-company source',200,(await api.request('GET','/account/entries/debt-X-A/source',undefined,'X')).status);
   const r=await api.request('GET','/account/export',undefined,'X');await observe(candidate,'account management export only A',{status:200,ids:['debt-X-A']},{status:r.status,ids:r.body.rows?.map((x:any)=>x.id)});
  });
 }finally{await api.close();const exists=(await pool.query("SELECT to_regclass('account.entry') name")).rows[0].name;if(exists)await pool.query("UPDATE account.entry SET remaining=amount WHERE tenant_id='T1'");}
});
test.after(()=>pool.end());
