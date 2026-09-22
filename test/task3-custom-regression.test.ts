import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,courseActions } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: saved custom browse stays active and other actions survive`,async()=>{
 await prepareAdmin();const api=await start(candidate),id='custom-'+randomUUID();
 try{
  const grants=courseActions.map(action=>({id:randomUUID(),action,subject:{type:'user',id:'L'}}));
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id,grants) VALUES('T1',$1,'Z',$2)",[id,JSON.stringify(grants)]);
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'Z','M',$1,true)",[id]);
  const r=await api.request('POST','/courses/'+id+'/browse-policy',{managementRoleMembershipId:'admin',grants:[{action:courseActions[0],subject:{type:'user',id:'X'}}]});await observe(candidate,'custom accepted',200,r.status);
  const x=await api.request('GET','/courses/'+id,undefined,'X');await observe(candidate,'AUTH-T09 new custom subject works',200,x.status);
  const l=await api.request('GET','/courses/'+id,undefined,'L');await observe(candidate,'AUTH-T09 old browse replaced',403,l.status);
  for(const action of courseActions.slice(1)){const retained=await api.request('GET','/courses/'+id+'?action='+action,undefined,'L');await observe(candidate,'AUTH-T09 custom retains '+action,200,retained.status);}
 }finally{await api.close();}
});
test.after(async()=>pool.end());
