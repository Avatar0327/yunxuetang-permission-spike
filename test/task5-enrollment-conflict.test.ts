import test from 'node:test';
import {createHash} from 'node:crypto';
import {pool,transaction} from '../src/infrastructure/db.js';
import {TrainingProjectionPort} from '../src/training/public.js';
import {ReportProjectionPort} from '../src/report/public.js';
import {OrganizationFactsPort} from '../src/organization/public.js';
import {start,observe} from './task3-helper.js';

const oldRows=[
 {person_id:'A',company_id:'I',snapshot_display_name:'A',progress:50,attachment:'attachment-A'},
 {person_id:'X',company_id:'A',snapshot_display_name:'X',progress:25,attachment:'attachment-X'},
 {person_id:'Y',company_id:'B',snapshot_display_name:'Y',progress:75,attachment:'attachment-Y'},
];
const roster=async()=>(await pool.query("SELECT person_id,company_id,snapshot_display_name,progress,attachment FROM training.roster WHERE tenant_id='T1' AND project_id='P' ORDER BY person_id")).rows;
const stamp=async()=>(await pool.query("SELECT revision,version FROM authz.revision JOIN training.export_epoch USING(tenant_id) WHERE tenant_id='T1'")).rows[0];
async function rename(id:string,name:string){
 await transaction(async db=>{
  await db.query("SELECT revision FROM authz.revision WHERE tenant_id='T1' FOR UPDATE");
  await db.query("UPDATE organization.person SET display_name=$2 WHERE tenant_id='T1' AND id=$1",[id,name]);
  const fact=await new OrganizationFactsPort(db).person({tenantId:'T1',personId:id});
  await new TrainingProjectionPort().person(db,fact!);await new ReportProjectionPort().person(db,fact!);
 });
}
for(const candidate of ['native','casbin'])test(`${candidate}: old-company enrollment conflicts deny without partial enrollment`,async t=>{
 const api=await start(candidate),token=createHash('sha256').update('spike-person-00001').digest('hex');
 try{
  for(const [id,department] of [['X','wide-1'],['Y','wide-2']] as const)
   await observe(candidate,'R1 prepare lawful department '+id,200,(await api.request('POST','/people/'+id,{departmentId:department})).status);
  await pool.query("INSERT INTO organization.person(tenant_id,id,company_id,department_id,internal,display_name) VALUES('T1','W','B','wide-2',false,'W')");
  await pool.query("INSERT INTO training.person_projection SELECT tenant_id,id,id,company_id,enabled,deleted,department_id,manager_id,display_name FROM organization.person WHERE tenant_id='T1' AND id='W'");
  await pool.query('INSERT INTO authz.session VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[token,'T1','person-00001']);
  for(const actor of ['Y','M','person-00001'])await observe(candidate,'R1 legitimate project appointment '+actor,200,(await api.request('POST','/appointments',{personId:actor,projectId:'P',active:true})).status);
  await observe(candidate,'R1 transfer current X A to B',200,(await api.request('POST','/people/X',{companyId:'B',departmentId:'wide-2'})).status);
  await rename('X','new-B-X');
  await observe(candidate,'R1 immutable original enrollment before attempted add',oldRows,await roster());
  for(const [label,personIds] of [['single',['X']],['mixed',['W','X','Y']]] as const){
   await t.test(label+' conflict rejects entire batch',async()=>{
    const before=await stamp();const response=await api.request('POST','/projects/P/enrollments',{operation:'add',personIds},'Y');
    const {meta,...body}=response.body;
    await observe(candidate,'R1 '+label+' safe denial and unchanged complete roster/revision/epoch',
     {status:403,body:{message:'你暂时不能查看或操作这项内容，请联系管理员确认权限'},rows:oldRows,unchangedStamp:true},
     {status:response.status,body,rows:await roster(),unchangedStamp:JSON.stringify(before)===JSON.stringify(await stamp())});
   });
  }
  await t.test('A B and internal protected reads retain enrollment boundaries after rejection',async()=>{
   for(const [actor,rows] of [
    ['person-00001',[{person_id:'X',company_id:'A',display_name:'X'}]],
    ['Y',[{person_id:'Y',company_id:'B',display_name:'Y'}]],
    ['M',oldRows.map(r=>({person_id:r.person_id,company_id:r.company_id,display_name:r.snapshot_display_name}))],
   ] as const){
    const response=await api.request('GET','/projects/P/roster',undefined,actor);
    await observe(candidate,'R1 exact roster/count '+actor,{status:200,rows,count:rows.length},{status:response.status,rows:response.body.rows,count:response.body.count});
    const search=await api.request('GET','/projects/P/roster?search=new-B-X',undefined,actor);
    await observe(candidate,'R1 current B name absent from enrollment search '+actor,{status:200,rows:[],count:0},{status:search.status,rows:search.body.rows,count:search.body.count});
    for(const kind of ['progress','attachment']){
     const r=await api.request('GET','/projects/P/people/X/'+kind,undefined,actor);const {meta,...body}=r.body;
     const expected=actor==='Y'?{status:403,body:{message:'你暂时不能查看或操作这项内容，请联系管理员确认权限'}}:{status:200,body:kind==='progress'?{personId:'X',progress:25}:{personId:'X',bytes:'attachment-X'}};
     await observe(candidate,'R1 old A '+kind+' boundary '+actor,expected,{status:r.status,body});
    }
    const job=await api.request('POST','/projects/P/exports',{},actor);
    await observe(candidate,'R1 export create '+actor,200,job.status);
    await observe(candidate,'R1 export execute '+actor,200,(await api.request('POST','/project-exports/'+job.body.id+'/execute',{},actor)).status);
    const claim=await api.request('GET','/project-exports/'+job.body.id+'/claim',undefined,actor);
    await observe(candidate,'R1 exact export snapshot '+actor,{status:200,rows,count:rows.length},{status:claim.status,rows:claim.body.rows,count:claim.body.count});
   }
  });
  await t.test('same-company existing enrollment remains idempotent alongside fresh enrollment',async()=>{
   for(let attempt=0;attempt<2;attempt++){
    const response=await api.request('POST','/projects/P/enrollments',{operation:'add',personIds:['Y','W']},'Y');const {meta,...body}=response.body;
    await observe(candidate,'R1 same-company add response '+attempt,{status:200,body:{changed:true,count:2}},{status:response.status,body});
    await observe(candidate,'R1 same-company add preserves existing snapshots/progress '+attempt,
     [oldRows[0],{person_id:'W',company_id:'B',snapshot_display_name:'W',progress:0,attachment:'synthetic-person-attachment'},oldRows[1],oldRows[2]],await roster());
   }
  });
 }finally{
  await api.request('POST','/people/X',{companyId:'A',departmentId:'wide-1'});await rename('X','X');await api.close();
  await pool.query("DELETE FROM training.roster WHERE tenant_id='T1' AND project_id='P' AND person_id='W'");
  await pool.query("DELETE FROM training.person_projection WHERE tenant_id='T1' AND id='W'");
  await pool.query("DELETE FROM organization.person WHERE tenant_id='T1' AND id='W'");
  await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND project_id='P' AND person_id IN('Y','M','person-00001')");
  await pool.query("DELETE FROM authz.session WHERE token_hash=$1",[token]);
  await transaction(async db=>{for(const id of ['X','Y']){await db.query("UPDATE organization.person SET department_id=null WHERE tenant_id='T1' AND id=$1",[id]);const fact=await new OrganizationFactsPort(db).person({tenantId:'T1',personId:id});await new TrainingProjectionPort().person(db,fact!);await new ReportProjectionPort().person(db,fact!);}});
 }
});
test.after(()=>pool.end());
