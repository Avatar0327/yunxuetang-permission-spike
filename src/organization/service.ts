import { query, transaction, Denied, type Identity } from '../infrastructure/db.js';
import { Authority } from '../authz/revision.js';
import type { CandidateName } from '../authz/bulk-candidate.js';
import { ReportProjectionPort } from '../report/public.js';
import type { ReportProjection } from '../contracts/ports.js';
import { companyCap } from '../authz/scope.js';
export class OrganizationService {
    constructor(public authority: Authority, private projection: ReportProjection = new ReportProjectionPort()) { }
    async revoke(identity: Identity, candidate: CandidateName, id: string) {
        return transaction(db => this.authority.revokeMembership(identity, candidate, id, db));
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
            const fact = await this.authority.ports.organization(db).person({ tenantId: identity.tenantId, personId: id });
            if (!fact) throw new Denied();
            await this.projection.person(db, fact);
            await this.authority.freezeDerived(identity.tenantId, db);
            return { updated: true };
        });
    }
    async moveDepartment(identity:Identity,candidate:CandidateName,id:string,parentId:string|null){return transaction(async db=>{
        await this.authority.plan(identity,candidate,'administration','organization.person.update',db,true);
        if(parentId!==null&&typeof parentId!=='string')throw new Denied();
        const r=await query(db,'UPDATE organization.department SET parent_id=$3 WHERE tenant_id=$1 AND id=$2 RETURNING id',[identity.tenantId,id,parentId]);
        if(!r.rows.length)throw new Denied();
        await this.authority.freezeDerived(identity.tenantId,db);return {id,parentId};
    });}

}
