import type { ReportProjection, PersonFacts } from '../contracts/ports.js';
import { query, requireTransaction, type DB } from '../infrastructure/db.js';
export class ReportProjectionPort implements ReportProjection {
    async person(db: DB, fact: PersonFacts) {
        requireTransaction(db);
        await query(db, 'UPDATE report.person_projection SET enabled=$3,deleted=$4,company_id=$5,department_id=$6,manager_id=$7,job_id=$8,display_name=$9 WHERE tenant_id=$1 AND person_id=$2', [fact.tenantId, fact.id, fact.enabled, fact.deleted, fact.companyId,fact.departmentId??null,fact.managerId??null,fact.jobId??null,fact.displayName??'']);
    }
}

/** Enumeration is limited to delegation/recheck, never the normal ALL list path. */
export async function reportObjects(db: DB, plan: import('../authz/contracts.js').QueryPolicy) {
    const { compile } = await import('../authz/compiler.js');
    const history=plan.nodeId==='history';
    // History grants authorize current people × permitted historical companies, including
    // people who have no facts yet. They never freeze the set of generated fact IDs.
    const c=compile(plan,{id:'id',personId:'person_id',companyId:'company_id',dataCompanyId:'data_company_id',enabled:'enabled',deleted:'deleted'});
    if(history){
        const companies=c.bind(plan.companyIds);
        const relation=`(SELECT p.*,co.data_company_id FROM report.person_projection p CROSS JOIN unnest(${companies}::text[]) co(data_company_id))`;
        return (await query(db,`SELECT r.person_id,r.data_company_id FROM ${relation} r WHERE ${c.where} ORDER BY r.person_id,r.data_company_id`,c.values)).rows.map(r=>JSON.stringify([r.person_id,r.data_company_id]));
    }
    return (await query(db,`SELECT r.id FROM report.person_projection r WHERE ${c.where} ORDER BY r.id`,c.values)).rows.map(r=>r.id as string);
}
