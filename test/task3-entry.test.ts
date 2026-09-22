import test from 'node:test';
import { pool } from '../src/infrastructure/db.js';
import { prepareAdmin, start, observe, policy } from './task3-helper.js';
for(const candidate of ['native','casbin']) test(`${candidate}: persisted domain create commands`,async()=>{
 await prepareAdmin(); const api=await start(candidate);
 try {
  const role=await api.request('POST','/roles',{id:'t3-entry-'+candidate,level:2,managementRoleMembershipId:'admin',policies:[policy('personal-learning',['report.personal-learning.view'],{kind:'departments',departmentIds:['D1']})],memberPersonIds:['M']});
  const roleStatus=role.status;
  const cat=await api.request('POST','/categories',{id:'t3-entry-'+candidate,managementRoleMembershipId:'admin',grants:[]});
  await observe(candidate,'category persistence',200,cat.status);
  await observe(candidate,'role creation level2',200,roleStatus);
 } finally {await api.close();}
});
test.after(async()=>pool.end());
