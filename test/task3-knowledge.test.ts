import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,courseActions } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: knowledge four actions and locked commands`,async t=>{
 await prepareAdmin();const api=await start(candidate),prefix='know-'+randomUUID();
 const grant=(action:string,type='user',id='L')=>({id:randomUUID(),action,subject:{type,id}});
 try{
  for(const [suffix,grants] of [['browse',[grant(courseActions[0]!)]],['maintain',[grant(courseActions[1]!)]],['distribute',[grant(courseActions[2]!)]],['download',[grant(courseActions[3]!)]],['public',[grant(courseActions[0]!,'public','T1')]],['classroom',[grant(courseActions[0]!,'classroom_member','class-1')]]] as const){
   await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id,grants) VALUES('T1',$1,'Z',$2)",[prefix+suffix,JSON.stringify(grants)]);
   await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'Z','M',$1,true)",[prefix+suffix]);
  }
  await pool.query("INSERT INTO knowledge.classroom_member VALUES('T1','class-1','L') ON CONFLICT DO NOTHING");
  for(const [action,suffix] of courseActions.map((a,i)=>[a,['browse','maintain','distribute','download'][i]!] as const))await t.test('independent '+action,async()=>{
   const r=await api.request('GET','/courses?prefix='+prefix+'&action='+action,undefined,'L');
   const expected=action.endsWith('browse')?[prefix+'browse',prefix+'classroom',prefix+'public'].sort():[prefix+suffix];
   await observe(candidate,'AUTH-T08 '+action,{status:200,ids:expected,count:expected.length},{status:r.status,ids:r.body.rows?.map((x:any)=>x.id),count:r.body.count});
  });
  await t.test('protected download requires only independent capability and current accessibility',async()=>{
   const yes=await api.request('GET','/courses/'+prefix+'download/download',undefined,'L');
   await observe(candidate,'AUTH-T08 protected bytes',{status:200,bytes:'synthetic-course-bytes',hasStorage:false},{status:yes.status,bytes:yes.body.bytes,hasStorage:JSON.stringify(yes.body).includes('storage')||JSON.stringify(yes.body).includes('https://')});
   const no=await api.request('GET','/courses/'+prefix+'browse/download',undefined,'L');await observe(candidate,'AUTH-T08 browse never downloads',403,no.status);
   await pool.query("UPDATE knowledge.course SET published=false WHERE tenant_id='T1' AND id=$1",[prefix+'download']);
   const draft=await api.request('GET','/courses/'+prefix+'download/download',undefined,'L');await observe(candidate,'AUTH-T08 current unpublish denies',403,draft.status);
  });
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id,force_children,grants) VALUES('T1',$1,'Z',true,$2),('T1',$3,'Z',false,'[]')",[prefix+'root',JSON.stringify([grant(courseActions[0]!,'public','T1')]),prefix+'locked']);
  await pool.query("UPDATE knowledge.category SET parent_id=$2 WHERE tenant_id='T1' AND id=$1",[prefix+'locked',prefix+'root']);
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$2,'Z','M',$1,true)",[prefix+'lockedCourse',prefix+'locked']);
  for(const mode of ['direct','import','custom'])await t.test('creator cannot bypass lock via '+mode,async()=>{
   const change={id:prefix+'locked',managementRoleMembershipId:'admin',grants:[grant(courseActions[0]!)]};
   const path=mode==='direct'?'/categories/'+change.id:mode==='import'?'/categories/import':'/courses/'+prefix+'lockedCourse/browse-policy';
   const r=await api.request('POST',path,mode==='import'?{updates:[change]}:change);
   await observe(candidate,'AUTH-T09 locked '+mode,403,r.status);
  });
  await t.test('custom replaces browse alone and parent append preserves existing grants',async()=>{
   const custom=await api.request('POST','/courses/'+prefix+'public/browse-policy',{managementRoleMembershipId:'admin',grants:[grant(courseActions[0]!)]});await observe(candidate,'AUTH-T09 custom save',200,custom.status);
   const x=await api.request('GET','/courses/'+prefix+'public',undefined,'X');await observe(candidate,'AUTH-T09 custom removed former public browse',403,x.status);
   const preview=await api.request('POST','/categories/'+prefix+'browse/append-preview',{managementRoleMembershipId:'admin',grants:[grant(courseActions[3]!)]});await observe(candidate,'AUTH-T09 append preview',200,preview.status);
   const append=await api.request('POST','/categories/'+prefix+'browse/append',{managementRoleMembershipId:'admin',revision:preview.body.revision,grants:preview.body.additions});await observe(candidate,'AUTH-T09 append command',200,append.status);
   const stored=(await pool.query("SELECT grants FROM knowledge.category WHERE tenant_id='T1' AND id=$1",[prefix+'browse'])).rows[0].grants;
   await observe(candidate,'AUTH-T09 parent retains original allow',[courseActions[0],courseActions[3]],stored.map((g:any)=>g.action).sort());
  });
 }finally{await api.close();}
});
test.after(async()=>pool.end());
