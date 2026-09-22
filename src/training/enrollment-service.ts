import {query,transaction,Denied,type Identity} from '../infrastructure/db.js';
import {Authority} from '../authz/revision.js';
import {compile} from '../authz/compiler.js';
import {companyCap} from '../authz/scope.js';
import type {CandidateName} from '../authz/bulk-candidate.js';
import {TrainingService} from './service.js';
/** Atomic enrollment command. Project and direct-team are independent grant paths. */
export class EnrollmentService {
 constructor(private authority:Authority,private training:TrainingService){}
 async change(identity:Identity,candidate:CandidateName,projectId:string,body:{operation:'add'|'remove';personIds:string[]}){
  if(!['add','remove'].includes(body.operation)||!Array.isArray(body.personIds)||body.personIds.length<1||body.personIds.length>200||body.personIds.some(id=>typeof id!=='string'||!id)||new Set(body.personIds).size!==body.personIds.length)throw new Denied();
  return transaction(async db=>{
   const context=await this.authority.current(identity,db,true);
   const project=(await query(db,'SELECT id,team_enabled FROM training.project WHERE tenant_id=$1 AND id=$2 AND enabled AND NOT deleted',[identity.tenantId,projectId])).rows[0];
   if(!project)throw new Denied();
   const action='training.enrollment.'+body.operation;
   let projectSource=false;
   try{await this.training.projects(identity,candidate,projectId,db,action);projectSource=true;}catch(e){if(!(e instanceof Denied))throw e;}
   const ids=[...body.personIds].sort();let allowed:string[];
   if(projectSource){
    allowed=(await query(db,'SELECT id FROM training.person_projection WHERE tenant_id=$1 AND id=ANY($2::text[]) AND company_id=ANY($3::text[]) AND enabled AND NOT deleted ORDER BY id',[identity.tenantId,ids,companyCap(context)])).rows.map(r=>r.id);
   }else{
    if(!project.team_enabled)throw new Denied();
    const {plan}=await this.authority.plan(identity,candidate,'team-enrollment',action,db);
    const c=compile(plan,{id:'id',personId:'person_id',companyId:'company_id',enabled:'enabled',deleted:'deleted'});
    allowed=(await query(db,`SELECT r.id FROM training.person_projection r WHERE ${c.where} AND r.id=ANY(${c.bind(ids)}::text[]) ORDER BY r.id`,c.values)).rows.map(r=>r.id);
   }
   if(JSON.stringify(allowed)!==JSON.stringify(ids))throw new Denied();
   if(body.operation==='remove'){
    const rows=(await query(db,'SELECT person_id FROM training.roster WHERE tenant_id=$1 AND project_id=$2 AND person_id=ANY($3::text[]) AND company_id=ANY($4::text[]) ORDER BY person_id FOR UPDATE',[identity.tenantId,projectId,ids,companyCap(context)])).rows;
    if(JSON.stringify(rows.map(r=>r.person_id))!==JSON.stringify(ids))throw new Denied();
    await query(db,'DELETE FROM training.roster WHERE tenant_id=$1 AND project_id=$2 AND person_id=ANY($3::text[])',[identity.tenantId,projectId,ids]);
   }else{
    // The authority lock serializes enrollment/person commands. Reject the whole
    // batch before inserting: an old-company fact cannot satisfy a current add.
    const conflicts=await query(db,'SELECT r.person_id FROM training.roster r JOIN training.person_projection p ON p.tenant_id=r.tenant_id AND p.id=r.person_id WHERE r.tenant_id=$1 AND r.project_id=$2 AND r.person_id=ANY($3::text[]) AND r.company_id IS DISTINCT FROM p.company_id FOR UPDATE OF r',[identity.tenantId,projectId,ids]);
    if(conflicts.rows.length)throw new Denied();
    // Same-company duplicate enrollment remains an idempotent no-op.
    await query(db,'INSERT INTO training.roster(tenant_id,project_id,person_id,company_id) SELECT tenant_id,$2,id,company_id FROM training.person_projection WHERE tenant_id=$1 AND id=ANY($3::text[]) ORDER BY id ON CONFLICT DO NOTHING',[identity.tenantId,projectId,ids]);
   }
   return {changed:true,count:ids.length};
  });
 }
}
