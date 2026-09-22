import test from 'node:test';
import {createHash} from 'node:crypto';
import {pool,transaction} from '../src/infrastructure/db.js';
import {ReportProjectionPort} from '../src/report/public.js';
import {TrainingProjectionPort} from '../src/training/public.js';
import {OrganizationFactsPort} from '../src/organization/public.js';
import {start,observe,policy} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: enrollment snapshot after person transfer`,async()=>{
 const api=await start(candidate);
 try{
  for(const [actor,department] of [['X','wide-1'],['Y','wide-2']] as const)await api.request('POST','/people/'+actor,{departmentId:department});
  await pool.query('INSERT INTO authz.session VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[createHash('sha256').update('spike-person-00001').digest('hex'),'T1','person-00001']);
  for(const actor of ['X','Y','M','person-00001'])await api.request('POST','/appointments',{personId:actor,projectId:'P',active:true});
  await api.request('POST','/people/X',{companyId:'B',departmentId:'wide-2'});
  await transaction(async db=>{await db.query("UPDATE organization.person SET display_name='new-B-X' WHERE tenant_id='T1' AND id='X'");const fact=await new OrganizationFactsPort(db).person({tenantId:'T1',personId:'X'});await new TrainingProjectionPort().person(db,fact!);await new ReportProjectionPort().person(db,fact!);});
  const customerA=await api.request('GET','/projects/P/roster',undefined,'person-00001');await observe(candidate,'valid customer A sees only old A enrollment snapshot',[{person_id:'X',company_id:'A',display_name:'X'}],customerA.body.rows);
  const currentMembership={id:'t5-current-'+candidate,tenantId:'T1',personId:'X',roleId:'role-11',level:3,active:true,provenance:'system_origin',policies:[policy('personal-learning',['report.personal-learning.view'],{kind:'self'})]};
  await observe(candidate,'current person node absent before independent role',403,(await api.request('GET','/report?id=X',undefined,'X')).status);
  await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,'X','role-11',$2)",[currentMembership.id,currentMembership]);
  await observe(candidate,'current B person requires independent current-person authorization',['X'],(await api.request('GET','/report?id=X',undefined,'X')).body.rows?.map((r:any)=>r.id));
  await observe(candidate,'current person projection changed while enrollment snapshot stayed A',{company_id:'B',display_name:'new-B-X'},(await pool.query("SELECT company_id,display_name FROM report.person_projection WHERE tenant_id='T1' AND id='X'")).rows[0]);
  const r=await api.request('GET','/projects/P/roster',undefined,'M');await observe(candidate,'old enrollment keeps captured name',{person_id:'X',company_id:'A',display_name:'X'},r.body.rows.find((x:any)=>x.person_id==='X'));
  const search=await api.request('GET','/projects/P/roster?search=new-B-X',undefined,'M');await observe(candidate,'enrollment search cannot reveal transferred current name',[],search.body.rows);
  const b=await api.request('GET','/projects/P/roster',undefined,'Y');await observe(candidate,'new company cannot acquire old enrollment',['Y'],b.body.rows?.map((x:any)=>x.person_id));
  for(const kind of ['progress','attachment'])await observe(candidate,'new company old '+kind+' denies',403,(await api.request('GET','/projects/P/people/X/'+kind,undefined,'Y')).status);
  const job=await api.request('POST','/projects/P/exports',{},'M');await api.request('POST','/project-exports/'+job.body.id+'/execute',{},'M');const claim=await api.request('GET','/project-exports/'+job.body.id+'/claim',undefined,'M');await observe(candidate,'export captured enrollment name','X',claim.body.rows?.find((x:any)=>x.person_id==='X')?.display_name);
 }finally{await api.close();await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1",['t5-current-'+candidate]);await transaction(async db=>{await db.query("UPDATE organization.person SET company_id='A',department_id=null,display_name='X' WHERE tenant_id='T1' AND id='X'");const fact=await new OrganizationFactsPort(db).person({tenantId:'T1',personId:'X'});await new TrainingProjectionPort().person(db,fact!);await new ReportProjectionPort().person(db,fact!);});await pool.query("UPDATE organization.person SET department_id=null WHERE tenant_id='T1' AND id='Y'");await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND person_id IN('X','Y','M','person-00001')");}
});test.after(()=>pool.end());
