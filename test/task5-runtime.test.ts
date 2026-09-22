import test from 'node:test';
import {writeFile} from 'node:fs/promises';
import {createClient} from 'redis';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: six-scope HTTP algebra, source fields and raw leak scans`,async()=>{
 const a=await start(candidate,4311),b=await start(candidate,4312),id='t5-scope-'+candidate,redis=createClient({socket:{host:'127.0.0.1',port:56379}});redis.on('error',()=>{});
 try{
  await a.request('POST','/people/L',{departmentId:'D1'});
  const m:any={id,tenantId:'T1',personId:'L',roleId:'role-8',level:2,active:true,provenance:'system_origin',policies:[policy('personal-learning',['report.personal-learning.view','report.personal-learning.export'],{kind:'all'},['phone'])],jurisdiction:{kind:'departments',departmentIds:['D2']}};
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'L','role-8',$2)",[id,m]);
  const cases:[string,any,string[]][]=[['all',{kind:'all'},['A','B','C','D','E','M','N']],['ownDept',{kind:'ownDept'},['A','C','M']],['ownDeptSubtree',{kind:'ownDeptSubtree'},['A','C','D','M']],['departments',{kind:'departments',departmentIds:['D2']},['B','E','N']],['managed',{kind:'managed'},['B','E','N']],['self',{kind:'self'},[]],['specified subtree',{kind:'departments',departmentIds:['D1'],includeDescendants:true},['A','C','D','M']],['specified no subtree',{kind:'departments',departmentIds:['D1']},['A','C','M']],['empty departments',{kind:'departments',departmentIds:[]},[]]];
  for(const [name,scope,ids] of cases){m.policies[0].scope=scope;await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);for(const api of [a,b]){const r=await api.request('GET','/report?fixture=true',undefined,'L');await observe(candidate,'HTTP six scope '+name,{status:200,ids,count:ids.length},{status:r.status,ids:r.body.rows?.map((x:any)=>x.id),count:r.body.count});}}
  m.policies[0].scope={kind:'self'};await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);const self=await b.request('GET','/report?id=L',undefined,'L');await observe(candidate,'HTTP SELF real own object',['L'],self.body.rows?.map((r:any)=>r.id));
  m.policies[0].scope={kind:'all'};m.overrides=[{membershipId:id,nodeId:'personal-learning',scope:{kind:'ownDept'}}];await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);
  const second={...m,id:id+'-second',overrides:[],policies:[policy('personal-learning',['report.personal-learning.view'],{kind:'all'})]};await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'L','role-8',$2)",[second.id,second]);
  const union=await b.request('GET','/report?fixture=true',undefined,'L');await observe(candidate,'HTTP role-local override does not narrow second-role union',[['A','phone-A'],['B',null],['C','phone-C'],['D',null],['E',null],['M','phone-M'],['N',null]],union.body.rows?.map((r:any)=>[r.id,r.phone]));
  const job=await a.request('POST','/exports',{fixture:true},'L');await b.request('POST','/exports/'+job.body.id+'/execute',{},'L');const claim=await b.request('GET','/exports/'+job.body.id+'/claim',undefined,'L');await observe(candidate,'HTTP same-action export cannot borrow view-all',['A','C','M'],claim.body.rows?.map((r:any)=>r.id));
  m.overrides[0].scope=null;await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);
  const empty=await b.request('GET','/report?fixture=true',undefined,'L');await observe(candidate,'T04 empty override removes only source fields',[['A',null],['B',null],['C',null],['D',null],['E',null],['M',null],['N',null]],empty.body.rows?.map((r:any)=>[r.id,r.phone]));
  await observe(candidate,'T04 empty override denies only export source',403,(await a.request('POST','/exports',{fixture:true},'L')).status);
  delete m.overrides;await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);
  const restored=await b.request('GET','/report?fixture=true',undefined,'L');await observe(candidate,'T04 deleted override restores role inheritance',['phone-A','phone-B','phone-C','phone-D','phone-E','phone-M','phone-N'],restored.body.rows?.map((r:any)=>r.phone));
  m.overrides=[{membershipId:id,nodeId:'personal-learning',scope:{kind:'ownDept'}}];await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);
  await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[second.id]);
  const shrunk=await b.request('GET','/report?fixture=true&limit=1&offset=1',undefined,'L');await observe(candidate,'HTTP shrink before pagination count',{ids:['C'],count:3},{ids:shrunk.body.rows?.map((r:any)=>r.id),count:shrunk.body.count});
  const exportJob=await a.request('POST','/exports',{fixture:true},'M');await b.request('POST','/exports/'+exportJob.body.id+'/execute',{},'M');
  const surfaces:any={list:(await b.request('GET','/report?fixture=true',undefined,'M')).body,detail:(await b.request('GET','/report?id=B',undefined,'M')).body,search:(await b.request('GET','/report?node=department-report&search=B',undefined,'M')).body,denial:(await b.request('GET','/report?node=department-report&id=B',undefined,'M')).body,export:(await b.request('GET','/exports/'+exportJob.body.id+'/claim',undefined,'M')).body,storedChunks:(await pool.query("SELECT payload FROM report.export_chunk WHERE tenant_id='T1' AND job_id=$1",[exportJob.body.id])).rows};
  for(const [name,value] of Object.entries(surfaces))await observe(candidate,'raw field sentinel scan '+name,[],JSON.stringify(value).match(/(?:phone|email|card)-(?:B|D|E|N)(?![a-zA-Z])/g)??[]);
  await redis.connect();const cacheRows=[];for await(const keys of redis.scanIterator({MATCH:'snapshot:*',COUNT:100}))for(const key of keys)cacheRows.push({key,value:await redis.get(key)});
  await observe(candidate,'raw Redis snapshot sentinel scan',[],JSON.stringify(cacheRows).match(/(?:phone|email|card)-[A-Za-z0-9]/g)??[]);
  const logs={a:a.logs(),b:b.logs()};await observe(candidate,'raw application stdout stderr scan',[],JSON.stringify(logs).match(/(?:phone|email|card)-[A-Za-z0-9]/g)??[]);
  await writeFile('evidence/raw/task5-scans-'+candidate+'.json',JSON.stringify({candidate,at:new Date().toISOString(),surfaces,cacheRows,logs},null,2));
 }finally{if(redis.isOpen)redis.destroy();await b.close();await a.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id IN($1,$2)",[id,id+'-second']);await pool.query("UPDATE organization.person SET department_id=null WHERE tenant_id='T1' AND id='L'");}
});test.after(()=>pool.end());
