import type { ReportProjection, PersonFacts } from '../contracts/ports.js';
import { query, requireTransaction, type DB } from '../infrastructure/db.js';
export class ReportProjectionPort implements ReportProjection {
    async person(db: DB, fact: PersonFacts) {
        requireTransaction(db);
        await query(db, 'UPDATE report.person_projection SET enabled=$3,deleted=$4,company_id=$5 WHERE tenant_id=$1 AND person_id=$2', [fact.tenantId, fact.id, fact.enabled, fact.deleted, fact.companyId]);
    }
}

/** Enumeration is limited to delegation/recheck, never the normal ALL list path. */
export async function reportObjects(db: DB, plan: import('../authz/contracts.js').QueryPolicy) {
    const { compile } = await import('../authz/compiler.js');
    const history=plan.nodeId==='history';
    const c=compile(plan,{id:'id',personId:'person_id',companyId:'company_id',dataCompanyId:'data_company_id',enabled:history?'current_enabled':'enabled',deleted:history?'current_deleted':'deleted'});
    const relation=history?'(SELECT f.*,p.enabled AS current_enabled,p.deleted AS current_deleted FROM report.learning_fact f JOIN report.person_projection p ON p.tenant_id=f.tenant_id AND p.person_id=f.person_id)':'report.person_projection';
    return (await query(db,`SELECT r.id FROM ${relation} r WHERE ${c.where} ORDER BY r.id`,c.values)).rows.map(r=>r.id as string);
}
