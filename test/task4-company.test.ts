import test from 'node:test';
import {createHash} from 'node:crypto';
import {pool} from '../src/infrastructure/db.js';
import {syntheticMissingDepartment} from './task4-helper.js';
import {start,observe,prepareAdmin,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: mixed-company project and explicit grants`,async t=>{
 await prepareAdmin();const api=await start(candidate),id='t4-company-'+candidate;
 try{
  await api.request('POST','/people/X',{departmentId:'wide-1'});await api.request('POST','/people/Y',{departmentId:'wide-2'});
  await pool.query("INSERT INTO training.appointment(tenant_id,id,person_id,project_id) VALUES('T1',$1,'X','P'),('T1',$2,'Y','P'),('T1',$3,'M','P')",[id+'X',id+'Y',id+'M']);
  await pool.query("INSERT INTO authz.session VALUES($1,'T1','person-00001') ON CONFLICT DO NOTHING",[createHash('sha256').update('spike-person-00001').digest('hex')]);
  await t.test('ordinary customer shared course',async()=>{
   await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id,grants) VALUES('T1',$1,'Z',$2)",[id,JSON.stringify([{id:id+'public',action:'knowledge.course.browse',subject:{type:'public',id:'T1'}}])]);
   await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'Z','Z',$1,true)",[id]);
   for(const actor of ['X','Y','person-00001'])await observe(candidate,'shared content remains accessible '+actor,200,(await api.request('GET','/courses/'+id,undefined,actor)).status);
   await observe(candidate,'ordinary customer has no project roster',403,(await api.request('GET','/projects/P/roster',undefined,'person-00001')).status);
   await observe(candidate,'ordinary customer no management shell',{backend:false,nodes:[]},(await api.request('GET','/auth/me',undefined,'person-00001')).body.capabilities);
   await observe(candidate,'cannot grant cross-company range to external',403,(await api.request('POST','/company-grants',{personId:'Y',companyId:'A',active:true,managementRoleMembershipId:'admin'})).status);
  });
  await t.test('search/count company relation',async()=>{const r=await api.request('GET','/projects/P/roster?search=Y',undefined,'X');await observe(candidate,'A manager search does not return A or hidden B',{count:0,rows:[]},{count:r.body.count,rows:r.body.rows});});
  await t.test('personal progress and attachments',async()=>{for(const actor of ['X','Y']){const roster=await api.request('GET','/projects/P/roster',undefined,actor);await observe(candidate,'valid company-qualified appointed roster '+actor,{ids:[actor],count:1},{ids:roster.body.rows?.map((x:any)=>x.person_id),count:roster.body.count});const attachment=await api.request('GET','/projects/P/people/'+actor+'/attachment',undefined,actor);await observe(candidate,'own-company protected attachment '+actor,{status:200,bytes:'attachment-'+actor},{status:attachment.status,bytes:attachment.body.bytes});}const y=await api.request('GET','/projects/P/people/Y/progress',undefined,'Y');await observe(candidate,'B manager own-company progress',{status:200,personId:'Y',progress:75},{status:y.status,personId:y.body.personId,progress:y.body.progress});const a=await api.request('GET','/projects/P/people/X/progress',undefined,'X');await observe(candidate,'A manager own-company progress',{status:200,personId:'X',progress:25},{status:a.status,personId:a.body.personId,progress:a.body.progress});for(const actor of ['X','Y']){const other=actor==='X'?'Y':'X';for(const path of ['progress','attachment'])await observe(candidate,actor+' manager hidden '+path,403,(await api.request('GET',`/projects/P/people/${other}/${path}`,undefined,actor)).status);}});
  await t.test('grant and revoke retain other companies',async()=>{await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='M' AND company_id IN('A','B')");
   const command=(companyId:string,active:boolean)=>api.request('POST','/company-grants',{personId:'M',companyId,active,managementRoleMembershipId:'admin'});
   await observe(candidate,'explicit grant customer A',200,(await command('A',true)).status);await observe(candidate,'explicit grant customer B',200,(await command('B',true)).status);
   await observe(candidate,'internal owns plus explicit A B',['A','X','Y'],(await api.request('GET','/projects/P/roster',undefined,'M')).body.rows?.map((x:any)=>x.person_id));
   await observe(candidate,'revoke A',200,(await command('A',false)).status);await observe(candidate,'next request retains I B only',['A','Y'],(await api.request('GET','/projects/P/roster',undefined,'M')).body.rows?.map((x:any)=>x.person_id));
   await observe(candidate,'whole project cannot hide affected A',403,(await api.request('POST','/projects/P',{title:'forbidden'},'M')).status);
   await command('A',true);await observe(candidate,'all affected companies positive',200,(await api.request('POST','/projects/P',{title:'共享项目 P'},'M')).status);
  });
 }finally{await syntheticMissingDepartment('X');await syntheticMissingDepartment('Y');await api.close();await pool.query("DELETE FROM knowledge.course WHERE tenant_id='T1' AND id=$1",[id]);await pool.query("DELETE FROM knowledge.category WHERE tenant_id='T1' AND id=$1",[id]);await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND id LIKE $1",[id+'%']);await pool.query("INSERT INTO authz.company_grant VALUES('T1','M','A'),('T1','M','B') ON CONFLICT DO NOTHING");}
});
test.after(()=>pool.end());
