import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: person command applies same-action selected object caps`,async t=>{
 const api=await start(candidate),id='t4-person-cap-'+candidate;
 const m={id,tenantId:'T1',personId:'M',roleId:'role-8',level:2,active:true,provenance:'active',policies:[policy('administration',['organization.person.update'])],delegation:{sourceMembershipId:'admin',sourceActorId:'Z',revision:1,caps:[{nodeId:'administration',action:'organization.person.update',objectIds:['B'],rawFields:[]}]}};
 try{
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data,source_id) VALUES('T1',$1,'M','role-8',$2,'admin')",[id,m]);
  await t.test('range negative',async()=>{await observe(candidate,'person command cannot borrow broad report role for C',403,(await api.request('POST','/people/C',{enabled:true},'M')).status);});
  await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1",[id,m]);
  await t.test('range positive',async()=>{await observe(candidate,'person command permits same-source capped B',200,(await api.request('POST','/people/B',{enabled:true},'M')).status);});
 }finally{await api.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(()=>pool.end());
