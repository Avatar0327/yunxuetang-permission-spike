import {instrumentMethods, spanSync} from '../infrastructure/telemetry.js';
import { pool, query, Denied, type DB, type Identity } from '../infrastructure/db.js';
import { Authority } from '../authz/revision.js';
import { compile, compileHistoryPersonCompany } from '../authz/compiler.js';
import type { CandidateName } from '../authz/bulk-candidate.js';
export interface ListOptions {
    fixture?: boolean;
    history?: boolean;
    node?: string;
    limit?: number;
    offset?: number;
    search?: string;
    id?: string;
    state?: 'enabled' | 'disabled' | 'deleted' | 'all';
    cold?: boolean;
    aggregate?: boolean;
    groupBy?: 'department,job,status';
    export?: boolean;
}
export class ReportService {
    constructor(public authority: Authority) { }
    async list(identity: Identity, candidate: CandidateName, o: ListOptions = {}, db: DB = pool, lock = false) {
        const history = o.history === true;
        const node = history ? 'history' : o.node ?? 'personal-learning';
        const action = history ? `report.history.${o.export ? 'export' : 'view'}` : `report.personal-learning.${o.export ? 'export' : 'view'}`;
        const auth = await this.authority.plan(identity, candidate, node, action, db, lock, o.cold);
        const compileStart = performance.now();
        const {c, personCompany} = spanSync('report.compile', () => {
            const mapping = { id: 'id', personId: 'person_id', companyId: 'company_id', dataCompanyId: 'data_company_id', enabled: 'enabled', deleted: 'deleted' };
            const optimized = candidate === 'native' && history && o.aggregate ? compileHistoryPersonCompany(auth.plan, mapping) : undefined;
            return {c: optimized ?? compile(auth.plan, mapping), personCompany: optimized !== undefined};
        });
        const state = o.state ?? 'enabled';
        const currentState = state === 'all' ? '' : state === 'deleted' ? 'p.deleted=true' : `p.deleted=false AND p.enabled=${state === 'enabled' ? 'true' : 'false'}`;
        let prefix = '';
        let relation = history ? 'report.learning_fact r JOIN report.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id' : 'report.person_projection r';
        const terms = [c.where];
        if (personCompany) {
            const tenant = c.bind(auth.plan.tenantId), companies = c.bind(auth.plan.companyIds);
            // DISTINCT company candidates and UNIQUE(tenant_id,person_id) in the
            // projection guarantee one allowed pair even with overlapping sources.
            // data_company_id deliberately comes from candidates, never current company.
            prefix = `WITH history_people AS MATERIALIZED (
                SELECT r.tenant_id,r.person_id,r.data_company_id FROM (
                    SELECT p.tenant_id,p.person_id,dc.data_company_id,true AS enabled,false AS deleted
                    FROM report.person_projection p
                    CROSS JOIN (SELECT DISTINCT unnest(${companies}::text[]) AS data_company_id) dc
                    WHERE p.tenant_id=${tenant}${currentState ? ` AND ${currentState}` : ''}
                ) r WHERE ${c.where}
            ) `;
            relation = 'report.learning_fact r JOIN history_people h ON h.tenant_id=r.tenant_id AND h.person_id=r.person_id AND h.data_company_id=r.data_company_id';
            terms[0] = `r.tenant_id=${tenant} AND r.enabled=true AND r.deleted=false`;
        }
        if (o.fixture)
            terms.push(`r.fixture=true`);
        if (o.id)
            terms.push(`r.id=${c.bind(o.id)}`);
        if (o.search)
            terms.push(`r.person_id ILIKE ${c.bind('%' + o.search + '%')}`);
        if (history && !personCompany && currentState)
            terms.push(currentState);
        const where = terms.join(' AND ');
        if (o.aggregate) {
            const permissionMs = auth.permissionMs + performance.now() - compileStart;
            const start = performance.now();
            const grouping=o.groupBy==='department,job,status'?'r.historical_department_id,r.historical_job_id,r.historical_status':'r.historical_department_id';
            const groupSQL=`SELECT ${grouping},count(*)::int count,sum(r.points)::bigint points FROM ${relation} WHERE ${where} GROUP BY ${grouping}`;
            const totals=o.export?(await query(db,`${prefix}SELECT count(*)::int groups,sum(count)::int facts FROM (${groupSQL}) grouped`,c.values)).rows[0]:undefined;
            const paging=o.export?` LIMIT 200 OFFSET ${c.bind(Math.max(0,o.offset??0))}`:'';
            const r=await query(db,`${prefix}${groupSQL} ORDER BY ${grouping}${paging}`,c.values);
            return { rows: r.rows, groupCount:totals?.groups, count: totals?.facts??r.rows.reduce((n, x) => n + x.count, 0), evidence: { candidate, revision: auth.plan.revision, sourceIds: auth.plan.sources.map(s => s.sourceId), permissionMs, dataMs: performance.now() - start, cache: auth.cache } };
        }
        const countValues = [...c.values];
        const fields = history ? 'r.data_company_id,r.historical_department_id,r.historical_job_id,r.historical_status,r.points' : [c.field('phone'), c.field('email'), c.field('id_card')].join(',');
        const sourceIds = c.sourceIds();
        const limit = Math.max(1, Math.min(200, o.limit ?? 50));
        const args = [...c.values, limit, Math.max(0, o.offset ?? 0)];
        const permissionMs = auth.permissionMs + performance.now() - compileStart;
        const start = performance.now();
        const count = (await query(db, `SELECT count(*)::int count FROM ${relation} WHERE ${where}`, countValues)).rows[0].count;
        const rows = (await query(db, `SELECT r.id,r.person_id,${fields},${sourceIds} FROM ${relation} WHERE ${where} ORDER BY r.id LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
        if (o.id && !rows.length)
            throw new Denied();
        return { rows, count, evidence: { candidate, revision: auth.plan.revision, sourceIds: auth.plan.sources.map(s => s.sourceId), permissionMs, dataMs: performance.now() - start, cache: auth.cache } };
    }
}

instrumentMethods(ReportService.prototype, ['list'], 'report');
