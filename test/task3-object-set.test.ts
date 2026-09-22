import test from 'node:test';
import { pool } from '../src/infrastructure/db.js';
import { Authority } from '../src/authz/revision.js';
import { ObjectResolver } from '../src/authz/objects.js';
import { SessionCache } from '../src/authz/cache.js';
import { makeScope } from '../src/authz/scope.js';
import { nodes } from '../src/authz/registry.js';
import { observe } from './task3-helper.js';
test('delegation object set excludes facts whose current person is disabled',async()=>{
 const cache=new SessionCache(),authority=new Authority(cache);
 try{
  await pool.query("UPDATE organization.person SET enabled=false WHERE tenant_id='T1' AND id='X'");
  await pool.query("UPDATE report.person_projection SET enabled=false WHERE tenant_id='T1' AND person_id='X'");
  const context=await authority.current({tenantId:'T1',personId:'Z'}),spec=makeScope(context,nodes.find(n=>n.id==='history')!,'report.history.view',{kind:'all'})!;
  spec.objectIds=['h-X-A','h-X-B'];
  const actual=await new ObjectResolver(authority,pool).resolve(spec);
  await observe('shared-resolver','exact current-state business objects',[],actual.objectIds);
 }finally{await pool.query("UPDATE organization.person SET enabled=true WHERE tenant_id='T1' AND id='X'");await pool.query("UPDATE report.person_projection SET enabled=true WHERE tenant_id='T1' AND person_id='X'");await cache.close();}
});
test('virtual capability object resolution honors an empty saved cap',async()=>{
 const cache=new SessionCache(),authority=new Authority(cache);try{
  const context=await authority.current({tenantId:'T1',personId:'Z'}),spec=makeScope(context,nodes.find(n=>n.id==='role-management')!,'authz.role.create',{kind:'all'})!;
  spec.objectIds=[];const actual=await new ObjectResolver(authority,pool).resolve(spec);
  await observe('shared-resolver','empty virtual cap stays empty',[],actual.objectIds);
 }finally{await cache.close();}
});
test.after(async()=>pool.end());
