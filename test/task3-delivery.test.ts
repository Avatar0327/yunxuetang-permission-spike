import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin,start,observe,policy } from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: two instances protect each download and Redis timeout closes`,async()=>{
 await prepareAdmin();const a=await start(candidate,4311),b=await start(candidate,4312),id='delivery-'+randomUUID();
 const redis=createClient({socket:{host:'127.0.0.1',port:56379}});redis.on('error',()=>{});
 try{
  await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id) VALUES('T1',$1,'Z')",[id]);
  await pool.query("INSERT INTO knowledge.course(tenant_id,id,category_id,uploader_id,created_by,title,published) VALUES('T1',$1,$1,'Z','Z',$1,true)",[id]);
  const role=await a.request('POST','/roles',{id,level:3,managementRoleMembershipId:'admin',policies:[policy('course',['knowledge.course.download'])],memberPersonIds:['L']});await observe(candidate,'delivery role create',200,role.status);
  const warm=await b.request('GET','/courses/'+id+'/download',undefined,'L');await observe(candidate,'B warmed protected bytes',{status:200,bytes:'synthetic-course-bytes'},{status:warm.status,bytes:warm.body.bytes});
  await redis.connect();await redis.sendCommand(['CLIENT','PAUSE','650','ALL']);
  const fault=await b.request('GET','/courses/'+id+'/download',undefined,'L');await observe(candidate,'download Redis timeout fails closed',{status:503,bytes:null},{status:fault.status,bytes:fault.body.bytes??null});
  await new Promise(r=>setTimeout(r,750));
  const recovered=await b.request('GET','/courses/'+id+'/download',undefined,'L');await observe(candidate,'download after Redis recovery',200,recovered.status);
  const revoke=await a.request('POST','/memberships/'+role.body.membershipIds[0]+'/revoke',{});await observe(candidate,'A revoke committed',200,revoke.status);
  const next=await b.request('GET','/courses/'+id+'/download',undefined,'L');await observe(candidate,'B next new download denies old L1/L2',{status:403,bytes:null,pubsub:false,afterCommit:true},{status:next.status,bytes:next.body.bytes??null,pubsub:next.body.meta.pubsub,afterCommit:next.body.meta.requestAt>=revoke.body.meta.responseAt});
 }finally{await redis.close();await b.close();await a.close();}
});
test.after(async()=>pool.end());
