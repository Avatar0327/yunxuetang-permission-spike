import { query, transaction, Denied, type Identity } from '../infrastructure/db.js';
import { Authority } from '../authz/revision.js';
import type { CandidateName } from '../authz/bulk-candidate.js';
import { companyCap } from '../authz/scope.js';
export class OrganizationService {
    constructor(public authority: Authority) { }
    async revoke(identity: Identity, candidate: CandidateName, id: string) {
        return transaction(async (db) => {
            const a = await this.authority.plan(identity, candidate, 'administration', 'authz.membership.revoke', db, true);
            const target = (await query(db, 'SELECT p.company_id FROM authz.membership m JOIN organization.person p ON p.tenant_id=m.tenant_id AND p.id=m.person_id WHERE m.tenant_id=$1 AND m.id=$2', [identity.tenantId, id])).rows[0];
            if (!target || !companyCap(a.context).includes(target.company_id))
                throw new Denied();
            await query(db, `UPDATE authz.membership SET data=jsonb_set(data,'{active}','false') WHERE tenant_id=$1 AND id=$2`, [identity.tenantId, id]);
            await query(db, `WITH RECURSIVE dependents AS (SELECT id FROM authz.membership WHERE tenant_id=$1 AND source_id=$2 UNION SELECT m.id FROM authz.membership m JOIN dependents d ON m.source_id=d.id WHERE m.tenant_id=$1) UPDATE authz.membership SET data=jsonb_set(data,'{provenance}','"recheck_required"') WHERE tenant_id=$1 AND id IN(SELECT id FROM dependents)`, [identity.tenantId, id]);
            return { revoked: true, revision: (await this.authority.current(identity, db)).revision };
        });
    }
    async update(identity: Identity, candidate: CandidateName, id: string, body: {
        departmentId?: string;
        managerId?: string;
        enabled?: boolean;
        deleted?: boolean;
        companyId?: string;
    }) {
        return transaction(async (db) => {
            const a = await this.authority.plan(identity, candidate, 'administration', 'organization.person.update', db, true);
            const p = (await query(db, 'SELECT company_id FROM organization.person WHERE tenant_id=$1 AND id=$2', [identity.tenantId, id])).rows[0];
            if (!p || !companyCap(a.context).includes(p.company_id) || (body.companyId && !companyCap(a.context).includes(body.companyId)))
                throw new Denied();
            await query(db, 'UPDATE organization.person SET department_id=coalesce($3,department_id),manager_id=coalesce($4,manager_id),enabled=coalesce($5,enabled),deleted=coalesce($6,deleted),company_id=coalesce($7,company_id) WHERE tenant_id=$1 AND id=$2', [identity.tenantId, id, body.departmentId ?? null, body.managerId ?? null, body.enabled ?? null, body.deleted ?? null, body.companyId ?? null]);
            // Synchronous module projection delivery, same authority transaction. Historical facts remain immutable.
            await query(db, 'UPDATE report.person_projection r SET enabled=p.enabled,deleted=p.deleted,company_id=p.company_id FROM organization.person p WHERE r.tenant_id=p.tenant_id AND r.person_id=p.id AND p.tenant_id=$1 AND p.id=$2', [identity.tenantId, id]);
            await query(db, `UPDATE authz.membership SET data=jsonb_set(data,'{provenance}','"recheck_required"') WHERE tenant_id=$1 AND source_id IS NOT NULL`, [identity.tenantId]);
            return { updated: true };
        });
    }
}
