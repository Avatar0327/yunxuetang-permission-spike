import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: complete appointment HTTP transitions and lawful independent role`,async()=>{
 const a=await start(candidate,4311),b=await start(candidate,4312),role='t5-nav-'+candidate;
 try{
  await pool.query("INSERT INTO authz.company_grant VALUES('T1','L','A'),('T1','L','B') ON CONFLICT DO NOTHING");
  await observe(candidate,'T06 initial learner no backend',{backend:false,nodes:[]},(await b.request('GET','/auth/me',undefined,'L')).body.capabilities);
  await a.request('POST','/appointments',{personId:'L',projectId:'P',active:true});
  await observe(candidate,'T06 P appointment training whitelist',{backend:true,nodes:['project']},(await b.request('GET','/auth/me',undefined,'L')).body.capabilities);
  const list=await b.request('GET','/projects',undefined,'L');await observe(candidate,'T06 P list count',{ids:['P'],count:1},{ids:list.body.rows?.map((r:any)=>r.id),count:list.body.count});
  await observe(candidate,'T06 P detail positive',200,(await b.request('GET','/projects/P',undefined,'L')).status);
  await observe(candidate,'T06 P save with full affected-company cap',200,(await b.request('POST','/projects/P',{title:'共享项目 P'},'L')).status);
  await observe(candidate,'T06 other module negative',403,(await b.request('GET','/report',undefined,'L')).status);
  await observe(candidate,'T06 Q detail negative',403,(await b.request('GET','/projects/Q',undefined,'L')).status);
  const job=await a.request('POST','/projects/P/exports',{},'L');await b.request('POST','/project-exports/'+job.body.id+'/execute',{},'L');await observe(candidate,'T06 P export positive',['A','X','Y'],(await b.request('GET','/project-exports/'+job.body.id+'/claim',undefined,'L')).body.rows?.map((r:any)=>r.person_id));
  await a.request('POST','/appointments',{personId:'L',projectId:'Q',active:true});await a.request('POST','/appointments',{personId:'L',projectId:'P',active:false});
  const retained=await b.request('GET','/projects',undefined,'L');await observe(candidate,'T06 revoke P preserves Q',['Q'],retained.body.rows?.map((r:any)=>r.id));
  await observe(candidate,'T06 revoked P next direct request',403,(await b.request('GET','/projects/P',undefined,'L')).status);
  await a.request('POST','/appointments',{personId:'L',projectId:'Q',active:false});await observe(candidate,'T06 last revoke closes backend',{backend:false,nodes:[]},(await b.request('GET','/auth/me',undefined,'L')).body.capabilities);
  const m={id:role,tenantId:'T1',personId:'L',roleId:'role-9',level:3,active:true,provenance:'system_origin',policies:[policy('personal-learning',['report.personal-learning.view'],{kind:'self'})]};await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'L','role-9',$2)",[role,m]);
  await a.request('POST','/appointments',{personId:'L',projectId:'P',active:true});await a.request('POST','/appointments',{personId:'L',projectId:'P',active:false});
  await observe(candidate,'T06 lawful independent role navigation retained',{backend:true,nodes:['personal-learning']},(await b.request('GET','/auth/me',undefined,'L')).body.capabilities);
  await observe(candidate,'T06 lawful independent role data retained',['L'],(await b.request('GET','/report',undefined,'L')).body.rows?.map((r:any)=>r.id));
  for(const [id,creator] of [[role+'-own','L'],[role+'-other','Z']])await pool.query("INSERT INTO training.project(tenant_id,id,created_by,title) VALUES('T1',$1,$2,$1)",[id,creator]);
  for(const [suffix,action,scope] of [['-view','training.project.view',{kind:'all'}],['-edit','training.project.update',{kind:'self'}]] as const){const member={...m,id:role+suffix,policies:[policy('project',[action],scope)]};await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'L','role-9',$2)",[member.id,member]);}
  for(const id of [role+'-own',role+'-other'])await observe(candidate,'T03 same-node broad view '+id,200,(await b.request('GET','/projects/'+id,undefined,'L')).status);
  await observe(candidate,'T03 same-node SELF edit positive',200,(await b.request('POST','/projects/'+role+'-own',{title:'allowed self edit'},'L')).status);
  await observe(candidate,'T03 same-node cannot borrow broad view to edit other',403,(await b.request('POST','/projects/'+role+'-other',{title:'must remain unchanged'},'L')).status);
  await observe(candidate,'T03 denied other edit wrote nothing',role+'-other',(await pool.query("SELECT title FROM training.project WHERE tenant_id='T1' AND id=$1",[role+'-other'])).rows[0].title);
 }finally{await b.close();await a.close();await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND person_id='L'");await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[])",[[role,role+'-view',role+'-edit']]);await pool.query("DELETE FROM training.project WHERE tenant_id='T1' AND id=ANY($1::text[])",[[role+'-own',role+'-other']]);await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='L' AND company_id IN('A','B')");}
});test.after(()=>pool.end());
