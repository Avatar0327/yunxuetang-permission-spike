import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: company grant selected-source object cap`,async()=>{
 const api=await start(candidate),id='t4-grant-cap-'+candidate;
 const p=policy('administration',['authz.company.grant']);const m={id,tenantId:'T1',personId:'Z',roleId:'role-6',level:2,active:true,provenance:'active',policies:[p],delegation:{sourceMembershipId:'admin',sourceActorId:'Z',revision:1,caps:[{nodeId:'administration',action:'authz.company.grant',objectIds:['L'],rawFields:[]}]}};
 try{await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data,source_id) VALUES('T1',$1,'Z','role-6',$2,'admin')",[id,m]);
 const r=await api.request('POST','/company-grants',{personId:'M',companyId:'A',active:true,managementRoleMembershipId:id});await observe(candidate,'company mutation cannot borrow admin range beyond selected L cap',403,r.status);
 }finally{await api.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);}
});
test.after(()=>pool.end());
