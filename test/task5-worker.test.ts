import test from 'node:test';
import {pool,Denied} from '../src/infrastructure/db.js';
import {start,observe} from './task3-helper.js';
import {SessionCache} from '../src/authz/cache.js';
import {Authority} from '../src/authz/revision.js';
import {ReportService} from '../src/report/service.js';
import {ExportService} from '../src/report/exports.js';
import {ProjectExports} from '../src/training/exports.js';
import {TrainingService} from '../src/training/service.js';
import {AccountExports} from '../src/account/exports.js';
import {AccountService} from '../src/account/service.js';
for(const candidate of ['native','casbin'] as const)test(`${candidate}: limited worker, ownership, chunks and source epoch`,async t=>{
 const a=await start(candidate,4311),b=await start(candidate,4312),cache=new SessionCache(),authority=new Authority(cache);
 try{
  await t.test('worker scope and requester-bound execution',async()=>{
   const job=await a.request('POST','/exports',{fixture:true},'M'),id=job.body.id;
   for(const path of ['/report','/projects/P','/account/entries','/exports/'+id+'/claim'])await observe(candidate,'worker credential cannot ordinary read '+path,403,(await b.request('GET',path,undefined,'worker-report')).status);
   await observe(candidate,'worker cannot create arbitrary requester',403,(await b.request('POST','/exports',{personId:'Z'},'worker-report')).status);
   await observe(candidate,'worker cannot replace persisted options',403,(await b.request('POST','/worker/report/exports/'+id+'/execute',{personId:'Z'},'worker-report')).status);
   await observe(candidate,'worker token wrong domain',403,(await b.request('POST','/worker/account/exports/'+id+'/execute',{},'worker-report')).status);
   await observe(candidate,'worker nonexistent job',403,(await b.request('POST','/worker/report/exports/missing/execute',{},'worker-report')).status);
   await observe(candidate,'limited worker actual HTTP executes bound job',{status:200,state:'ready',count:7},await b.request('POST','/worker/report/exports/'+id+'/execute',{},'worker-report').then(r=>({status:r.status,state:r.body.state,count:r.body.count})));
   const output=await a.request('GET','/exports/'+id+'/claim',undefined,'M');await observe(candidate,'requester alone claims original exact set',['A','B','C','D','E','M','N'],output.body.rows?.map((r:any)=>r.id));
   await observe(candidate,'other user cannot claim',403,(await a.request('GET','/exports/'+id+'/claim',undefined,'Z')).status);
   await observe(candidate,'invalid chunk cannot claim',403,(await a.request('GET','/exports/'+id+'/claim?chunk=999',undefined,'M')).status);
   await observe(candidate,'negative chunk cannot claim',403,(await a.request('GET','/exports/'+id+'/claim?chunk=-1',undefined,'M')).status);
  });
  await t.test('partial job hidden and source mutation invalidates complete result',async()=>{
   const job=await a.request('POST','/exports',{},'M'),id=job.body.id;
   const first=await b.request('POST','/worker/report/exports/'+id+'/execute',{},'worker-report');await observe(candidate,'worker one bounded chunk',{status:200,state:'running',count:49998},{status:first.status,state:first.body.state,count:first.body.count});
   await observe(candidate,'partial job never claimable',403,(await a.request('GET','/exports/'+id+'/claim',undefined,'M')).status);
   await observe(candidate,'stored chunk bounded',200,(await pool.query("SELECT jsonb_array_length(payload) n FROM report.export_chunk WHERE tenant_id='T1' AND job_id=$1",[id])).rows[0].n);
   await pool.query("UPDATE report.person_projection SET phone='changed-phone-B' WHERE tenant_id='T1' AND id='B'");
   await observe(candidate,'source mutation invalidates worker next chunk',403,(await b.request('POST','/worker/report/exports/'+id+'/execute',{},'worker-report')).status);
   await observe(candidate,'source mutation does not reveal partial chunk',403,(await a.request('GET','/exports/'+id+'/claim',undefined,'M')).status);
  });
  await t.test('direct domain calls still authorize',async()=>{
   const actor={tenantId:'T1',personId:'L'};
   for(const [name,service,options] of [['report',new ExportService(new ReportService(authority)),{}],['training',new ProjectExports(new TrainingService(authority)),{projectId:'P'}],['account',new AccountExports(new AccountService(authority)),{}]] as const){let denied=false;try{await service.create(actor,candidate,options as any);}catch(e){denied=e instanceof Denied;}await observe(candidate,'Guard bypass direct '+name+' denied',true,denied);}
  });
 }finally{await pool.query("UPDATE report.person_projection SET phone='phone-B' WHERE tenant_id='T1' AND id='B'");await cache.close();await b.close();await a.close();}
});test.after(()=>pool.end());
