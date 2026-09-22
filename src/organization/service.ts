import { query, transaction, Denied, type Identity } from '../infrastructure/db.js';
import { Authority } from '../authz/revision.js';
import {compile} from '../authz/compiler.js';
import type { CandidateName } from '../authz/bulk-candidate.js';
import { AccountProjectionPort } from '../account/public.js';
import { TrainingProjectionPort } from '../training/public.js';
import { ReportProjectionPort } from '../report/public.js';
import type { ReportProjection } from '../contracts/ports.js';
import { companyCap,scopeMatches } from '../authz/scope.js';
export class OrganizationService {
    constructor(public authority: Authority, private projection: ReportProjection = new ReportProjectionPort(), private trainingProjection: ReportProjection = new TrainingProjectionPort(),private accountProjection: ReportProjection = new AccountProjectionPort()) { }
    async revoke(identity: Identity, candidate: CandidateName, id: string) {
        return transaction(db => this.authority.revokeMembership(identity, candidate, id, db));
    }

    async update(identity: Identity, candidate: CandidateName, id: string, body: {
        departmentId?: string | null;
        managerId?: string | null;
        jobId?: string | null;
        enabled?: boolean;
        deleted?: boolean;
        companyId?: string;
    }) {
        return transaction(async (db) => {
            const a = await this.authority.plan(identity, candidate, 'administration', 'organization.person.update', db, true);
            const p = (await query(db, 'SELECT company_id,department_id FROM organization.person WHERE tenant_id=$1 AND id=$2', [identity.tenantId, id])).rows[0];
            if (!p || !companyCap(a.context).includes(p.company_id) || (body.companyId && !companyCap(a.context).includes(body.companyId)))
                throw new Denied();
            if(!a.plan.sources.some(source=>scopeMatches(source.resolved,{id,personId:id,tenantId:identity.tenantId,type:'person',exists:true,enabled:true,deleted:false})))throw new Denied();
            // Null primary departments exist only in explicitly corrupted synthetic fixtures.
            if(body.departmentId===null)throw new Denied();
            for(const key of ['departmentId','managerId','jobId'] as const) if(body[key]!==undefined && body[key]!==null && (typeof body[key]!=='string'||!body[key])) throw new Denied();
            for(const key of ['enabled','deleted'] as const) if(body[key]!==undefined && typeof body[key]!=='boolean') throw new Denied();
            if(body.companyId!==undefined && (typeof body.companyId!=='string'||!body.companyId))throw new Denied();
            const company=body.companyId??p.company_id,department=body.departmentId===undefined?p.department_id:body.departmentId;
            if(department && !(await query(db,'SELECT 1 FROM organization.department WHERE tenant_id=$1 AND id=$2 AND company_id=$3',[identity.tenantId,department,company])).rows.length)throw new Denied();
            if(body.managerId===id)throw new Denied();
            await query(db, 'UPDATE organization.person SET department_id=CASE WHEN $8 THEN $3 ELSE department_id END,manager_id=CASE WHEN $9 THEN $4 ELSE manager_id END,enabled=coalesce($5,enabled),deleted=coalesce($6,deleted),company_id=$7,internal=($7=\'I\'),job_id=CASE WHEN $10 THEN $11 ELSE job_id END WHERE tenant_id=$1 AND id=$2', [identity.tenantId, id, body.departmentId ?? null, body.managerId ?? null, body.enabled ?? null, body.deleted ?? null, company,body.departmentId!==undefined,body.managerId!==undefined,body.jobId!==undefined,body.jobId??null]);
            // Synchronous module projection delivery, same authority transaction. Historical facts remain immutable.
            const fact = await this.authority.ports.organization(db).person({ tenantId: identity.tenantId, personId: id });
            if (!fact) throw new Denied();
            await this.projection.person(db, fact);
            await this.trainingProjection.person(db,fact);
            await this.accountProjection.person(db,fact);
            await this.authority.freezeDerived(identity.tenantId, db);
            return { updated: true };
        });
    }
    async moveDepartment(identity:Identity,candidate:CandidateName,id:string,parentId:string|null){return transaction(async db=>{
        const auth=await this.authority.plan(identity,candidate,'department','organization.department.move',db,true);
        if(parentId!==null && (typeof parentId!=='string'||!parentId))throw new Denied();
        const affected=(await query(db,`WITH RECURSIVE subtree AS (
            SELECT id,company_id FROM organization.department WHERE tenant_id=$1 AND id=$2
            UNION ALL SELECT d.id,d.company_id FROM organization.department d JOIN subtree s ON d.parent_id=s.id WHERE d.tenant_id=$1
        ) SELECT id,company_id FROM subtree ORDER BY id`,[identity.tenantId,id])).rows;
        if(!affected.length)throw new Denied();
        if(parentId!==null){const parent=(await query(db,'SELECT id,company_id FROM organization.department WHERE tenant_id=$1 AND id=$2',[identity.tenantId,parentId])).rows[0];if(!parent||parent.company_id!==affected[0].company_id)throw new Denied();affected.push(parent);}
        const ids=[...new Set(affected.map(r=>r.id))].sort();
        const c=compile(auth.plan,{id:'id',companyId:'company_id',enabled:'enabled',deleted:'deleted'});
        const allowed=(await query(db,`SELECT r.id FROM (SELECT d.*,true enabled,false deleted FROM organization.department d) r WHERE ${c.where} AND r.id=ANY(${c.bind(ids)}::text[]) ORDER BY r.id`,c.values)).rows.map(r=>r.id);
        if(JSON.stringify(allowed)!==JSON.stringify(ids))throw new Denied();
        await query(db,'UPDATE organization.department SET parent_id=$3 WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,parentId]);
        await this.authority.freezeDerived(identity.tenantId,db);return {id,parentId};
    });}
}
