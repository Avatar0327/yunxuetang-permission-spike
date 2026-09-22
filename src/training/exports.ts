import {TrainingService} from './service.js';
import {ProtectedExports} from '../infrastructure/protected-exports.js';
import {pool,query,Denied} from '../infrastructure/db.js';
import {companyCap} from '../authz/scope.js';
export class ProjectExports extends ProtectedExports {
 constructor(service:TrainingService){super('training',service.authority,async(i,c,o,offset,db)=>{
  if(typeof o?.projectId!=='string'||!o.projectId)throw new Denied();
  const {auth}=await service.projects(i,c,o.projectId,db,'training.project.export',true);
  const args=[i.tenantId,o.projectId,companyCap(auth.context)];
  const relation='training.roster r JOIN training.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id';
  const where='r.tenant_id=$1 AND r.project_id=$2 AND r.company_id=ANY($3::text[]) AND p.enabled AND NOT p.deleted';
  const count=(await query(db,`SELECT count(*)::int n FROM ${relation} WHERE ${where}`,args)).rows[0].n;
  const rows=(await query(db,`SELECT r.person_id,r.company_id,r.snapshot_display_name AS display_name FROM ${relation} WHERE ${where} ORDER BY r.person_id LIMIT 200 OFFSET $4`,[...args,offset])).rows;
  return {rows,count,revision:auth.context.revision};
 });}
}
export async function projectExportRequester(tenant:string,id:string){return(await query(pool,'SELECT tenant_id AS "tenantId",person_id AS "personId" FROM training.export_job WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];}
