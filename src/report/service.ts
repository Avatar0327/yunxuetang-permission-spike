import {instrumentMethods, spanSync} from '../infrastructure/telemetry.js';
import { pool, analyticsPool, pinned, query, Denied, Unavailable, type DB, type Identity } from '../infrastructure/db.js';
import { Authority } from '../authz/revision.js';
import { compile, compileHistoryPersonCompany, compileHistoryUnits } from '../authz/compiler.js';
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
export interface ListResult {
    rows: any[];
    count: number;
    groupCount?: number;
    historyMode?: 'T-1' | 'live';
    dataAsOf?: string;
    evidence: { candidate: CandidateName; revision: number; sourceIds: string[]; permissionMs: number; dataMs: number; cache: string };
}
export class ReportService {
    constructor(public authority: Authority) { }
    async list(identity: Identity, candidate: CandidateName, o: ListOptions = {}, db: DB = pool, lock = false): Promise<ListResult> {
        const history = o.history === true;
        const node = history ? 'history' : o.node ?? 'personal-learning';
        const action = history ? `report.history.${o.export ? 'export' : 'view'}` : `report.personal-learning.${o.export ? 'export' : 'view'}`;
        const auth = await this.authority.plan(identity, candidate, node, action, db, lock, o.cold);
        // Round 2 isolation: analytical data reads use their own pool unless the caller pinned a client or transaction.
        const dataDb: DB = db === pool ? analyticsPool : db;
        if (candidate === 'native' && history && o.aggregate && !o.export && !o.id) {
            const t1 = await this.historyT1(auth, o, dataDb);
            if (t1) return t1;
        }
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
            const {totals,r}=await pinned(dataDb,async dataDb=>{
                const totals=o.export?(await query(dataDb,`${prefix}SELECT count(*)::int groups,sum(count)::int facts FROM (${groupSQL}) grouped`,c.values)).rows[0]:undefined;
                const paging=o.export?` LIMIT 200 OFFSET ${c.bind(Math.max(0,o.offset??0))}`:'';
                return {totals,r:await query(dataDb,`${prefix}${groupSQL} ORDER BY ${grouping}${paging}`,c.values)};
            });
            return { rows: r.rows, groupCount:totals?.groups, count: totals?.facts??r.rows.reduce((n, x) => n + x.count, 0), ...(history && !o.export ? { historyMode: 'live' as const } : {}), evidence: { candidate, revision: auth.plan.revision, sourceIds: auth.plan.sources.map(s => s.sourceId), permissionMs, dataMs: performance.now() - start, cache: auth.cache } };
        }
        const countValues = [...c.values];
        const fields = history ? 'r.data_company_id,r.historical_department_id,r.historical_job_id,r.historical_status,r.points' : [c.field('phone'), c.field('email'), c.field('id_card')].join(',');
        const sourceIds = c.sourceIds();
        const limit = Math.max(1, Math.min(200, o.limit ?? 50));
        const args = [...c.values, limit, Math.max(0, o.offset ?? 0)];
        const permissionMs = auth.permissionMs + performance.now() - compileStart;
        const start = performance.now();
        const {count, rows} = await pinned(dataDb, async dataDb => ({
            count: (await query(dataDb, `SELECT count(*)::int count FROM ${relation} WHERE ${where}`, countValues)).rows[0].count,
            rows: (await query(dataDb, `SELECT r.id,r.person_id,${fields},${sourceIds} FROM ${relation} WHERE ${where} ORDER BY r.id LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows
        }));
        if (o.id && !rows.length)
            throw new Denied();
        return { rows, count, evidence: { candidate, revision: auth.plan.revision, sourceIds: auth.plan.sources.map(s => s.sourceId), permissionMs, dataMs: performance.now() - start, cache: auth.cache } };
    }
    /**
     * Round 2 T-1 historical aggregate (DIFF-05). Facts come from the current refresh batch;
     * the authorized (person, data company) units are evaluated live with the unchanged
     * compiled policy, current person state and filters, exactly as the person/company
     * relation path does. Returns undefined when a source depends on fact-level fields,
     * in which case the caller keeps the live per-fact path.
     */
    private async historyT1(auth: Awaited<ReturnType<Authority['plan']>>, o: ListOptions, db: DB): Promise<ListResult | undefined> {
        const compileStart = performance.now();
        const c = spanSync('report.compile', () => compileHistoryUnits(auth.plan, { id: 'id', personId: 'person_id', companyId: 'company_id', dataCompanyId: 'data_company_id', enabled: 'enabled', deleted: 'deleted' }));
        if (!c) return undefined;
        const state = o.state ?? 'enabled';
        const currentState = state === 'all' ? '' : state === 'deleted' ? 'p.deleted=true' : `p.deleted=false AND p.enabled=${state === 'enabled' ? 'true' : 'false'}`;
        const tenant = c.bind(auth.plan.tenantId);
        const unitTerms = [c.where];
        if (o.search) unitTerms.push(`r.person_id ILIKE ${c.bind('%' + o.search + '%')}`);
        const fixture = o.fixture ? ' AND u.fixture=true' : '';
        const grouping = o.groupBy === 'department,job,status' ? 'r.historical_department_id,r.historical_job_id,r.historical_status' : 'r.historical_department_id';
        const columns = 'a.historical_department_id,a.historical_job_id,a.historical_status,a.count,a.points';
        const permissionMs = auth.permissionMs + performance.now() - compileStart;
        const start = performance.now();
        // The unchanged compiled policy is evaluated on one synthetic row per stored unit
        // (person, data company) joined to the live current-person projection. This is the
        // same predicate input as the person/company relation path, restricted to units that
        // have facts in the batch. Cells are used only when every one of their units is authorized.
        const sql = `WITH b AS (
                SELECT c.batch_id,h.as_of FROM report.history_agg_current c JOIN report.history_agg_batch h ON h.tenant_id=c.tenant_id AND h.batch_id=c.batch_id WHERE c.tenant_id=${tenant}
            ), u AS MATERIALIZED (
                SELECT r.person_id,r.data_company_id,r.fixture,r.cell FROM (
                    SELECT u.tenant_id,u.person_id,u.data_company_id,u.fixture,u.cell,true AS enabled,false AS deleted
                    FROM report.history_agg_unit u JOIN report.person_projection p ON p.tenant_id=u.tenant_id AND p.person_id=u.person_id
                    WHERE u.tenant_id=${tenant} AND u.batch_id=(SELECT batch_id FROM b)${fixture}${currentState ? ` AND ${currentState}` : ''}
                ) r WHERE ${unitTerms.join(' AND ')}
            ), c0 AS (
                SELECT u.data_company_id,u.fixture,count(*)=min(s.units) AS full FROM u
                JOIN report.history_agg_size s ON s.tenant_id=${tenant} AND s.batch_id=(SELECT batch_id FROM b) AND s.level=0 AND s.cell='*' AND s.data_company_id=u.data_company_id AND s.fixture=u.fixture
                GROUP BY u.data_company_id,u.fixture
            ), c1 AS (
                SELECT u.cell,u.data_company_id,u.fixture,count(*)=min(s.units) AS full FROM u
                JOIN c0 ON c0.data_company_id=u.data_company_id AND c0.fixture=u.fixture AND NOT c0.full
                JOIN report.history_agg_size s ON s.tenant_id=${tenant} AND s.batch_id=(SELECT batch_id FROM b) AND s.level=1 AND s.cell=u.cell AND s.data_company_id=u.data_company_id AND s.fixture=u.fixture
                GROUP BY u.cell,u.data_company_id,u.fixture
            ), parts AS (
                SELECT ${columns} FROM c0
                JOIN report.history_agg_cell a ON a.tenant_id=${tenant} AND a.batch_id=(SELECT batch_id FROM b) AND a.level=0 AND a.cell='*' AND a.data_company_id=c0.data_company_id AND a.fixture=c0.fixture
                WHERE c0.full
                UNION ALL
                SELECT ${columns} FROM c1
                JOIN report.history_agg_cell a ON a.tenant_id=${tenant} AND a.batch_id=(SELECT batch_id FROM b) AND a.level=1 AND a.cell=c1.cell AND a.data_company_id=c1.data_company_id AND a.fixture=c1.fixture
                WHERE c1.full
                UNION ALL
                SELECT ${columns} FROM u
                JOIN c1 ON c1.cell=u.cell AND c1.data_company_id=u.data_company_id AND c1.fixture=u.fixture AND NOT c1.full
                JOIN report.history_agg_person a ON a.tenant_id=${tenant} AND a.batch_id=(SELECT batch_id FROM b) AND a.person_id=u.person_id AND a.data_company_id=u.data_company_id AND a.fixture=u.fixture
            )
            SELECT ${grouping},sum(r.count)::int count,sum(r.points)::bigint points,(SELECT as_of FROM b) AS t1_as_of
            FROM parts r GROUP BY ${grouping} ORDER BY ${grouping}`;
        const result = await query(db, sql, c.values);
        let asOf: Date | undefined = result.rows[0]?.t1_as_of;
        if (!result.rows.length)
            asOf = (await query(db, 'SELECT h.as_of FROM report.history_agg_current c JOIN report.history_agg_batch h ON h.tenant_id=c.tenant_id AND h.batch_id=c.batch_id WHERE c.tenant_id=$1', [auth.plan.tenantId])).rows[0]?.as_of;
        // No refreshed batch means no T-1 data to serve; fail closed rather than mislabel live data.
        if (!asOf) throw new Unavailable();
        const rows = result.rows.map(({ t1_as_of, ...row }) => row);
        return { rows, groupCount: undefined, count: rows.reduce((n, x) => n + x.count, 0), historyMode: 'T-1' as const, dataAsOf: asOf.toISOString(),
            evidence: { candidate: 'native', revision: auth.plan.revision, sourceIds: auth.plan.sources.map(s => s.sourceId), permissionMs, dataMs: performance.now() - start, cache: auth.cache } };
    }
}

instrumentMethods(ReportService.prototype, ['list'], 'report');
