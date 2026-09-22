import { createHash } from 'node:crypto';
import type { Context, Membership, Appointment } from './contracts.js';
import { normalizePolicy, buildQueryPolicy, backendCapabilities } from './policy.js';
import { nodes, appointmentCapabilities } from './registry.js';
import { selectSources, type CandidateName } from './bulk-candidate.js';
import { OrganizationPort } from '../organization/public.js';
import { SessionCache } from './cache.js';
import { pool, query, Denied, Unavailable, type DB, type Identity } from '../infrastructure/db.js';
interface Snapshot {
    schemaVersion: 1;
    memberships: Membership[];
    appointments: Appointment[];
}
export class Authority {
    constructor(public cache: SessionCache) { }
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
            const r = await query(db, `select r.revision,r.schema_version,p.*,coalesce((select array_agg(company_id order by company_id) from authz.company_grant g where g.tenant_id=p.tenant_id and g.person_id=p.id),'{}') companies from authz.revision r join organization.person p on p.tenant_id=r.tenant_id where r.tenant_id=$1 and p.id=$2 ${lock ? 'FOR UPDATE OF r' : ''}`, [identity.tenantId, identity.personId]);
            const p = r.rows[0];
            if (!p || !p.enabled || p.deleted)
                throw new Denied();
            if (p.schema_version !== 1)
                throw new Unavailable();
            return { tenantId: p.tenant_id, personId: p.id, revision: Number(p.revision), enabled: p.enabled, deleted: p.deleted, authenticated: true, internal: p.internal, companyId: p.company_id, companyIds: p.companies, departmentId: p.department_id ?? undefined };
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
                const m = await query(db, 'select data from authz.membership where tenant_id=$1 and person_id=$2', [context.tenantId, context.personId]);
                const a = await query(db, 'select id,tenant_id as "tenantId",person_id as "personId",project_id as "projectId",active from training.appointment where tenant_id=$1 and person_id=$2', [context.tenantId, context.personId]);
                snapshot = { schemaVersion: 1, memberships: m.rows.map(r => r.data), appointments: a.rows };
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
        const grants = await selectSources(candidate, loaded.context, loaded.grants, nodeId, action);
        if (!grants.length)
            throw new Denied();
        const plan = await buildQueryPolicy({ context: loaded.context, nodes, grants, nodeId, action, organization: new OrganizationPort(db) });
        if ((await this.current(identity, db)).revision !== plan.revision)
            throw new Unavailable();
        return { ...loaded, plan, permissionMs: performance.now() - start };
    }
}
