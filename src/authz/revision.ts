import { KnowledgeFactsPort,effectiveCategory } from '../knowledge/public.js';
import { companyCap, scopeMatches } from './scope.js';
import { createHash } from 'node:crypto';
import type { Context, Membership, Appointment } from './contracts.js';
import { normalizePolicy, normalizeCatalog, activeMembership, buildQueryPolicy, backendCapabilities } from './policy.js';
import { nodes, appointmentCapabilities } from './registry.js';
import { selectSources, type CandidateName } from './bulk-candidate.js';
import { OrganizationFactsPort } from '../organization/public.js';
import { TrainingFactsPort } from '../training/public.js';
import type { AuthorityPorts } from '../contracts/ports.js';
import { SessionCache } from './cache.js';
import { pool, query, metrics, requireTransaction, Denied, Unavailable, type DB, type Identity } from '../infrastructure/db.js';
interface Snapshot {
    schemaVersion: 1;
    memberships: Membership[];
    appointments: Appointment[];
}
export class Authority {
    constructor(public cache: SessionCache, public ports: AuthorityPorts = { organization: db => new OrganizationFactsPort(db), training: db => new TrainingFactsPort(db), knowledge: db => new KnowledgeFactsPort(db) }) { }
    async sourceMembershipIdentity(tenantId:string,id:string,db:DB):Promise<Identity|undefined>{
        return (await query(db,'SELECT tenant_id AS \"tenantId\",person_id AS \"personId\" FROM authz.membership WHERE tenant_id=$1 AND id=$2',[tenantId,id])).rows[0];
    }
    async roleExists(tenant:string,id:string,db:DB){return (await query(db,'SELECT 1 FROM authz.role WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows.length>0;}
    async memberships(identity: Identity, db: DB): Promise<Membership[]> {
        return (await query(db, `SELECT m.data || CASE WHEN r.policies IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('policies',r.policies,'level',r.level) END AS data FROM authz.membership m JOIN authz.role r ON r.tenant_id=m.tenant_id AND r.id=m.role_id WHERE m.tenant_id=$1 AND m.person_id=$2`, [identity.tenantId, identity.personId])).rows.map(r=>r.data);
    }
    async freezeDerived(tenantId: string, db: DB) {
        requireTransaction(db);
        await query(db, `UPDATE authz.membership SET data=jsonb_set(data,'{provenance}','"recheck_required"') WHERE tenant_id=$1 AND source_id IS NOT NULL`, [tenantId]);
    }
    async revokeMembership(identity: Identity, candidate: CandidateName, id: string, db: DB) {
        const a = await this.plan(identity, candidate, 'administration', 'authz.membership.revoke', db, true);
        const membership = (await query(db, 'SELECT person_id FROM authz.membership WHERE tenant_id=$1 AND id=$2', [identity.tenantId, id])).rows[0];
        const target = membership && await this.ports.organization(db).person({ tenantId: identity.tenantId, personId: membership.person_id });
        if (!target || !companyCap(a.context).includes(target.companyId)) throw new Denied();
        const targetResource = {
            id: target.id,
            personId: target.id,
            tenantId: identity.tenantId,
            type: 'person',
            exists: true,
            enabled: target.enabled,
            deleted: target.deleted,
        };
        if (!a.plan.sources.some(source => scopeMatches(source.resolved, targetResource)))
            throw new Denied();
        await query(db, `UPDATE authz.membership SET data=jsonb_set(data,'{active}','false') WHERE tenant_id=$1 AND id=$2`, [identity.tenantId, id]);
        await query(db, `WITH RECURSIVE dependents AS (SELECT id FROM authz.membership WHERE tenant_id=$1 AND source_id=$2 UNION SELECT m.id FROM authz.membership m JOIN dependents d ON m.source_id=d.id WHERE m.tenant_id=$1) UPDATE authz.membership SET data=jsonb_set(data,'{provenance}','"recheck_required"') WHERE tenant_id=$1 AND id IN(SELECT id FROM dependents)`, [identity.tenantId, id]);
        return { revoked: true, revision: (await this.current(identity, db)).revision };
    }
    async token(token: string): Promise<Identity> { try {
        const r = await query(pool, 'select tenant_id as "tenantId",person_id as "personId" from authz.session where token_hash=$1', [createHash('sha256').update(token).digest('hex')]);
        if (!r.rows[0])
            throw new Denied();
        return r.rows[0];
    }
    catch (e) {
        if (e instanceof Denied)
            throw e;
        throw new Unavailable();
    } }
    async current(identity: Identity, db: DB = pool, lock = false): Promise<Context> {
        try {
            if (lock) {
                requireTransaction(db);
                // A READ COMMITTED statement that waits for this lock can retain
                // old joined facts. Acquire only the revision lock here, then read
                // actor and company facts in the next statement's fresh snapshot.
                await query(db, 'SELECT r.revision FROM authz.revision r WHERE r.tenant_id=$1 FOR UPDATE OF r', [identity.tenantId]);
            }
            const r = (await query(db, `SELECT revision,schema_version,clock_timestamp() AS authority_observed_at,coalesce((SELECT array_agg(company_id ORDER BY company_id) FROM authz.company_grant WHERE tenant_id=$1 AND person_id=$2),'{}') companies FROM authz.revision WHERE tenant_id=$1`, [identity.tenantId, identity.personId])).rows[0];
            const p = await this.ports.organization(db).person(identity);
            if (!p || !p.enabled || p.deleted) throw new Denied();
            if (!r || r.schema_version !== 1) throw new Unavailable();
            // Both facts reads follow the revision-only lock; the revision fence also protects nonlocking reads.
            const after = (await query(db, 'SELECT revision FROM authz.revision WHERE tenant_id=$1', [identity.tenantId])).rows[0];
            if (!after || Number(after.revision) !== Number(r.revision)) throw new Unavailable();
            if(metrics.getStore()){metrics.getStore()!.observedRevision=Number(r.revision);metrics.getStore()!.authorityObservedAt=r.authority_observed_at.toISOString();}
            return { tenantId: p.tenantId, personId: p.id, revision: Number(r.revision), enabled: p.enabled, deleted: p.deleted, authenticated: true, internal: p.internal, companyId: p.companyId, companyIds: r.companies, departmentId: p.departmentId ?? undefined };
        }
        catch (e) {
            if (e instanceof Denied || e instanceof Unavailable)
                throw e;
            throw new Unavailable();
        }
    }
    async load(identity: Identity, db: DB = pool, lock = false, cold = false) {
        const start = performance.now();
        const context = await this.current(identity, db, lock);
        await this.cache.available();
        const key = `snapshot:${context.tenantId}:${context.personId}:${context.revision}`;
        const cached = await this.cache.get(key, cold);
        let snapshot: Snapshot;
        try {
            if (cached.value)
                snapshot = JSON.parse(cached.value);
            else {
                const memberships = await this.memberships(context, db);
                const appointments = await this.ports.training(db).appointments(context);
                snapshot = { schemaVersion: 1, memberships, appointments };
            }
            if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.memberships) || !Array.isArray(snapshot.appointments))
                throw new Unavailable();
            for (const m of snapshot.memberships)
                for (const p of m.policies)
                    if (!nodes.some(n => n.id === p.nodeId && p.actions.every(a => n.actions.includes(a))))
                        throw new Unavailable();
            if ((await this.current(identity, db)).revision !== context.revision)
                throw new Unavailable();
            if (!cached.value)
                await this.cache.set(key, JSON.stringify(snapshot));
            const grants = normalizePolicy({ context, nodes, ...snapshot, appointmentCapabilities });
            return { context, grants, cache: cached.hit, permissionMs: performance.now() - start, capabilities: backendCapabilities(grants, nodes) };
        }
        catch (e) {
            if (e instanceof Denied || e instanceof Unavailable)
                throw e;
            throw new Unavailable();
        }
    }
    async plan(identity: Identity, candidate: CandidateName, nodeId: string, action: string, db: DB = pool, lock = false, cold = false) {
        const start = performance.now();
        const loaded = await this.load(identity, db, lock, cold);
        if (!nodes.some(n => n.id === nodeId && n.actions.includes(action)))
            throw new Denied();
        let allGrants=loaded.grants;
        if(nodeId==='course'){
            const facts=await (this.ports.knowledge?.(db)??new KnowledgeFactsPort(db)).catalogs(identity);
            const memberships=await this.memberships(identity,db);
            const subjectResolvers={classroom_member:(s:import('./contracts.js').Subject)=>facts.classroomIds.includes(s.id),role:(s:import('./contracts.js').Subject)=>memberships.some(m=>m.roleId===s.id&&activeMembership(m,loaded.context))};
            const catalogGrants=facts.courses.flatMap(course=>{
                const catalog=effectiveCategory(facts.categories,course.category_id);
                // Forced ancestry always wins over stale custom policy saved before the lock.
                const customBrowse=catalog.lockedBy?undefined:course.custom_browse??undefined;
                return normalizeCatalog({context:loaded.context,nodes,nodeId:'course',courseId:course.id,catalog:{...catalog,tenantId:identity.tenantId,grants:catalog.grants.map(g=>({...g,id:course.id+':'+g.id}))},customBrowse:customBrowse?.map(g=>({...g,id:course.id+':custom:'+g.id})),customCaps:course.custom_source_id?(course.custom_snapshot?.caps??[]):undefined,subjectResolvers});
            });
            allGrants=[...allGrants,...catalogGrants];
        }
        const grants = await selectSources(candidate, loaded.context, allGrants, nodeId, action);
        if (!grants.length)
            throw new Denied();
        const plan = await buildQueryPolicy({ context: loaded.context, nodes, grants, nodeId, action, organization: this.ports.organization(db) });
        if ((await this.current(identity, db)).revision !== plan.revision)
            throw new Unavailable();
        return { ...loaded, plan, permissionMs: performance.now() - start };
    }
}
