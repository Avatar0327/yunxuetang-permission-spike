import {ReportService,type ListOptions} from './service.js';
import {ProtectedExports} from '../infrastructure/protected-exports.js';
import {pool,query,type Identity} from '../infrastructure/db.js';
import type {CandidateName} from '../authz/bulk-candidate.js';
export class ExportService extends ProtectedExports {
 constructor(public report:ReportService){super('report',report.authority,async(i,c,o,offset,db)=>{
  const r=await report.list(i,c,{...o,export:true,limit:200,offset},db,true);
  return {rows:r.rows,count:o.aggregate?r.groupCount!:r.count,revision:r.evidence.revision};
 });}
 override create(identity:Identity,candidate:CandidateName,options:ListOptions){const{limit,offset,cold,...filters}=options;return super.create(identity,candidate,filters);}
}
export async function reportExportRequester(tenant:string,id:string){return(await query(pool,'SELECT tenant_id AS "tenantId",person_id AS "personId" FROM report.export_job WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];}
