import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: node-owned SELF anchors and depth`,async t=>{
 await prepareAdmin();const api=await start(candidate),id='anchor-'+randomUUID();
 const data={id,tenantId:'T1',personId:'M',roleId:'role-20',level:3,active:true,provenance:'system_origin',policies:[policy('course',['knowledge.course.maintain'],{kind:'self'}),policy('project',['training.project.view'],{kind:'self'}),policy('face-to-face',['training.face-to-face.view'],{kind:'self'})]};
 try{
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'M','role-20',$2)",[id,data]);
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id) VALUES('T1',$1,'Z')",[id]);
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$3,'M','Z',$1,false),('T1',$2,$3,'Z','M',$2,false)",[id+'mine',id+'other',id]);
  await pool.query("INSERT INTO training.project(tenant_id,id,created_by,title) VALUES('T1',$1,'M',$1),('T1',$2,'Z',$2)",[id+'mine',id+'other']);
  await pool.query("INSERT INTO training.face_to_face(tenant_id,id,owner_id,created_by) VALUES('T1',$1,'M','Z'),('T1',$2,'Z','M')",[id+'mine',id+'other']);
  await t.test('course uses uploader while draft maintenance stays allowed',async()=>{
   const r=await api.request('GET','/courses?prefix='+id+'&action=knowledge.course.maintain',undefined,'M');await observe(candidate,'SELF course uploader',[id+'mine'],r.body.rows?.map((x:any)=>x.id));
  });
  await t.test('project uses original creator',async()=>{
   const r=await api.request('GET','/projects',undefined,'M');await observe(candidate,'SELF project original creator',[id+'mine'],r.body.rows?.map((x:any)=>x.id).filter((x:string)=>x.startsWith(id)));
  });
  await t.test('face-to-face uses owner not creator',async()=>{
   const r=await api.request('GET','/face-to-face',undefined,'M');await observe(candidate,'SELF face-to-face owner',{status:200,ids:[id+'mine']},{status:r.status,ids:r.body.rows?.map((x:any)=>x.id).filter((x:string)=>x.startsWith(id))});
  });
  await t.test('category depth10 succeeds depth11 denies',async()=>{
   const good=await api.request('POST','/categories',{id:id+'depth10',parentId:'cat-9',managementRoleMembershipId:'admin',grants:[]});await observe(candidate,'AUTH-T09 depth10',200,good.status);
   const bad=await api.request('POST','/categories',{id:id+'depth11',parentId:'cat-10',managementRoleMembershipId:'admin',grants:[]});await observe(candidate,'AUTH-T09 depth11',403,bad.status);
  });
 }finally{await api.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(async()=>pool.end());
