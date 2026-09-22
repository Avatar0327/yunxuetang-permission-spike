import test from 'node:test';
import {pool,transaction} from '../src/infrastructure/db.js';
import {syntheticMissingDepartment} from './task4-helper.js';
import {start,observe} from './task3-helper.js';
const obs=(c:string,n:string,e:unknown,a:unknown)=>observe(c,'Task4 '+n,e,a);
for(const candidate of ['native','casbin']) test(`${candidate}: Task4 organization contract`,async t=>{
 const api=await start(candidate);
 try{
  await t.test('physical company-qualified department',async()=>{const r=await pool.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='organization' AND table_name='department' AND column_name='company_id' AND is_nullable='NO'");await obs(candidate,'department company required',1,r.rows[0].n);});
  await t.test('physical hierarchy and scale',async()=>{
   for(const [name,sql] of [
    ['null company',"INSERT INTO organization.department VALUES('T1','bad-null',null,null)"],
    ['cross-company parent',"INSERT INTO organization.department VALUES('T1','bad-cross','D1','A')"],
    ['invalid parent',"INSERT INTO organization.department VALUES('T1','bad-parent','absent','I')"],
    ['depth 21',"INSERT INTO organization.department VALUES('T1','bad-depth','chain-20','I')"],
    ['cycle',"UPDATE organization.department SET parent_id='chain-20' WHERE tenant_id='T1' AND id='chain-1'"]
   ]){let rejected=false;try{await transaction(async db=>{await db.query(sql!);throw Error('allowed rollback');});}catch(e){rejected=['23502','23503','P0001'].includes((e as any).code);}await obs(candidate,name!,true,rejected);}
   const counts=(await pool.query(`SELECT (SELECT count(*)::int FROM organization.person WHERE tenant_id='T1') people,(SELECT count(*)::int FROM organization.person WHERE tenant_id='T2') others,(SELECT count(*)::int FROM organization.department WHERE tenant_id='T1') departments,(SELECT count(*)::int FROM report.learning_fact WHERE NOT fixture) facts,(SELECT count(*)::int FROM organization.person p JOIN organization.department d ON d.tenant_id=p.tenant_id AND d.id=p.department_id WHERE p.company_id<>d.company_id) invalid`)).rows[0];
   await obs(candidate,'exact valid scale',{people:50000,others:500,departments:2000,facts:1000000,invalid:0},counts);
   await obs(candidate,'company department distribution',[{company_id:'A',n:659},{company_id:'B',n:659},{company_id:'I',n:682}],(await pool.query("SELECT company_id,count(*)::int n FROM organization.department WHERE tenant_id='T1' GROUP BY company_id ORDER BY company_id")).rows);
   await obs(candidate,'same-name tenant interference 500',500,(await pool.query("SELECT count(*)::int n FROM organization.person a JOIN organization.person b ON a.display_name=b.display_name WHERE a.tenant_id='T1' AND b.tenant_id='T2'")).rows[0].n);
   await obs(candidate,'cross-company department command',403,(await api.request('POST','/departments/D2/move',{parentId:'wide-1'})).status);
  });
  await t.test('nullable manager and abnormal department fixture',async()=>{try{
   const r=await api.request('POST','/people/B',{managerId:null});await obs(candidate,'normal command clears nullable manager',200,r.status);
   await obs(candidate,'normal command rejects null department',403,(await api.request('POST','/people/B',{departmentId:null})).status);
   await syntheticMissingDepartment('B');const p=(await pool.query("SELECT department_id,manager_id FROM organization.person WHERE tenant_id='T1' AND id='B'")).rows[0];await obs(candidate,'synthetic abnormal missing department',{department_id:null,manager_id:null},p);
  }finally{await api.request('POST','/people/B',{departmentId:'D2',managerId:'M'});}});
  await t.test('cross-company person department rejected',async()=>{let rejected=false;try{await transaction(async db=>{await db.query("UPDATE organization.person SET company_id='A' WHERE tenant_id='T1' AND id='B'");throw new Error('rollback allowed');});}catch(e){rejected=(e as any).code==='23503';}await obs(candidate,'cross-company person rejected',true,rejected);});
 }finally{await api.close();}
});
test.after(()=>pool.end());
