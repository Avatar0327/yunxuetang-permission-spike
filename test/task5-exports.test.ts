import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import {syntheticMissingDepartment} from './task4-helper.js';
import {pool} from '../src/infrastructure/db.js';
import {start,observe} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: protected domain export HTTP contract`,async t=>{
 const api=await start(candidate),captured:any={candidate};
 try{
  await api.request('POST','/people/X',{departmentId:'wide-1'});await api.request('POST','/people/Y',{departmentId:'wide-2'});
  await api.request('POST','/appointments',{personId:'X',projectId:'P',active:true});
  await t.test('project export obeys exact project and company',async()=>{
   const job=await api.request('POST','/projects/P/exports',{},'X');await observe(candidate,'project export create HTTP',200,job.status);
   await observe(candidate,'project export execute HTTP',200,(await api.request('POST','/project-exports/'+job.body.id+'/execute',{},'X')).status);
   const claim=await api.request('GET','/project-exports/'+job.body.id+'/claim',undefined,'X');await observe(candidate,'project export company A only',[{person_id:'X',company_id:'A',display_name:'X'}],claim.body.rows);
   captured.project={claim,storedChunks:(await pool.query("SELECT payload FROM training.export_chunk WHERE tenant_id='T1' AND job_id=$1",[job.body.id])).rows};
   await observe(candidate,'project raw export no other company sentinel',[],JSON.stringify(claim.body).match(/"Y"|attachment-Y|attachment-A/g)??[]);
   await observe(candidate,'project Q export denies exact appointment',403,(await api.request('POST','/projects/Q/exports',{},'X')).status);
  });
  await t.test('account protected export',async()=>{
   const job=await api.request('POST','/account/exports',{},'X');await observe(candidate,'account export create HTTP',200,job.status);
   await observe(candidate,'account export execute HTTP',200,(await api.request('POST','/account/exports/'+job.body.id+'/execute',{},'X')).status);
   const claim=await api.request('GET','/account/exports/'+job.body.id+'/claim',undefined,'X');await observe(candidate,'account export company A only',['debt-X-A'],claim.body.rows?.map((r:any)=>r.id));
   captured.account={claim,storedChunks:(await pool.query("SELECT payload FROM account.export_chunk WHERE tenant_id='T1' AND job_id=$1",[job.body.id])).rows};
   await observe(candidate,'account raw export no B source reward sentinel',[],JSON.stringify(claim.body).match(/source-X-B|reward-X-B|debt-X-B|B-private-source/g)??[]);
  });
  await t.test('legacy account export bounded pages',async()=>{
   try{await pool.query("INSERT INTO account.entry(tenant_id,id,person_id,data_company_id,currency,kind,amount,remaining,source_id) SELECT 'T1','t5-entry-'||lpad(n::text,3,'0'),'X','A','credit','reward',1,1,'source-X-A' FROM generate_series(1,205)n");
    const first=await api.request('GET','/account/export',undefined,'X'),next=await api.request('GET','/account/export?offset=200',undefined,'X');
    captured.accountLegacy={first,next};
    await observe(candidate,'legacy account export cap and stable cursor',{first:200,count:206,nextOffset:200,last:6},{first:first.body.rows?.length,count:first.body.count,nextOffset:first.body.nextOffset,last:next.body.rows?.length});
    await observe(candidate,'legacy account export complete exact ordered IDs',['debt-X-A',...Array.from({length:205},(_,n)=>'t5-entry-'+String(n+1).padStart(3,'0'))],[...first.body.rows,...next.body.rows].map((r:any)=>r.id));
   }finally{await pool.query("DELETE FROM account.entry WHERE tenant_id='T1' AND id LIKE 't5-entry-%'");}
  });
  await t.test('report claim bounded',async()=>{
   const job=await api.request('POST','/exports',{},'M');await observe(candidate,'report export create',200,job.status);
   await api.request('POST','/exports/'+job.body.id+'/execute',{},'M');
   const claim=await api.request('GET','/exports/'+job.body.id+'/claim',undefined,'M');await observe(candidate,'report claim bounded 200 with exact total',{rows:200,count:49998,nextChunk:1},{rows:claim.body.rows?.length,count:claim.body.count,nextChunk:claim.body.nextChunk});
  });
 }finally{captured.logs=api.logs();await writeFile('evidence/raw/task5-domain-export-scans-'+candidate+'.json',JSON.stringify(captured,null,2));await api.close();await syntheticMissingDepartment('X');await syntheticMissingDepartment('Y');await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND person_id='X' AND project_id='P'");}
});
test.after(()=>pool.end());
