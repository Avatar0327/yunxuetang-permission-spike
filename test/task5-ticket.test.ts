import test from 'node:test';
import {createHmac} from 'node:crypto';
import {pool} from '../src/infrastructure/db.js';
import {start,observe} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: signed segment ticket never replaces current authority`,async()=>{
 const a=await start(candidate,4311),b=await start(candidate,4312);
 try{
  await a.request('POST','/appointments',{personId:'L',projectId:'P',active:true});
  const issued=await a.request('GET','/projects/P/media/7/ticket',undefined,'L');await observe(candidate,'signed media ticket create real HTTP',200,issued.status);
  const ticket=encodeURIComponent(issued.body.ticket);
  await observe(candidate,'signed media exact segment before revoke',200,(await b.request('GET','/projects/P/media/7?ticket='+ticket,undefined,'L')).status);
  for(const [path,actor] of [['/projects/P/media/8?ticket='+ticket,'L'],['/projects/Q/media/7?ticket='+ticket,'L'],['/projects/P/media/7?ticket='+ticket,'Z'],['/projects/P/media/7?ticket=altered.'+ticket,'L']])await observe(candidate,'signed media wrong binding denies '+actor+' '+path!.split('?')[0],403,(await b.request('GET',path!,undefined,actor)).status);
  for(const change of [{expires:0},{tenantId:'T2'}]){const payload={...JSON.parse(Buffer.from(issued.body.ticket.split('.')[0],'base64url').toString()),...change},body=Buffer.from(JSON.stringify(payload)).toString('base64url'),signed=body+'.'+createHmac('sha256',process.env.MEDIA_TICKET_SECRET??'isolated-synthetic-permission-spike-media-key-v1').update(body).digest('base64url');await observe(candidate,'valid signature with expired or wrong-tenant binding denies '+JSON.stringify(change),403,(await b.request('GET','/projects/P/media/7?ticket='+encodeURIComponent(signed),undefined,'L')).status);}
  await a.request('POST','/appointments',{personId:'L',projectId:'P',active:false});
  const after=await b.request('GET','/projects/P/media/7?ticket='+ticket,undefined,'L');await observe(candidate,'old signed ticket after revoke next request no bytes',{status:403,fragment:null},{status:after.status,fragment:after.body.fragment??null});
 }finally{await b.close();await a.close();await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND id='L-P'");}
});test.after(()=>pool.end());
