import test from 'node:test';
import { pool } from '../src/infrastructure/db.js';
import { Authority } from '../src/authz/revision.js';
import { SessionCache } from '../src/authz/cache.js';
import { ReportService } from '../src/report/service.js';
import { observe,policy } from './task3-helper.js';
// 02 §5: own company remains part of internal company cap without an explicit grant.
for(const candidate of ['native','casbin'] as const)test(`${candidate}: internal own company is implicit, customer companies require grant`,async()=>{
 const id='t3-own-company-'+candidate;
 const m={id,tenantId:'T1',personId:'B',roleId:'role-20',level:3,active:true,provenance:'system_origin',policies:[policy('personal-learning',['report.personal-learning.view'])]};
 await pool.query("DELETE FROM authz.company_grant WHERE tenant_id='T1' AND person_id='B'");
 await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'B','role-20',$2)",[id,m]);
 const cache=new SessionCache(),service=new ReportService(new Authority(cache));
 try{
  const result=await service.list({tenantId:'T1',personId:'B'},candidate,{fixture:true});
  await observe(candidate,'02 own company without extra grant',['A','B','C','D','E','M','N'],result.rows.map(r=>r.id));
  const customer=await service.list({tenantId:'T1',personId:'B'},candidate,{id:'X'}).then(()=>200).catch(e=>e.status);
  await observe(candidate,'02 customer A absent grant',403,customer);
 }finally{await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",[id]);await cache.close();}
});
test.after(async()=>pool.end());
