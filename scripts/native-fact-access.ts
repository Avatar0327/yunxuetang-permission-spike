import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pool, type DB } from '../src/infrastructure/db.js';
import { Authority } from '../src/authz/revision.js';
import { SessionCache } from '../src/authz/cache.js';
import { ReportService } from '../src/report/service.js';
import { scenarioTruth, digest } from './benchmark-truth.js';

export interface PlanNode {
    'Node Type': string;
    'Relation Name'?: string;
    'Index Name'?: string;
    'Heap Fetches'?: number;
    'Actual Rows'?: number;
    'Actual Loops'?: number;
    Plans?: PlanNode[];
    [key: string]: unknown;
}
export function planNodes(node: PlanNode): PlanNode[] {
    return [node, ...(node.Plans ?? []).flatMap(planNodes)];
}

/** Read-only diagnosis of unchanged Native endpoint SQL; no planner flags or maintenance. */
export async function captureNativeFactAccess() {
    const cache = new SessionCache(), service = new ReportService(new Authority(cache));
    const truth = scenarioTruth();
    const environment = (await pool.query(`SELECT version(), current_setting('statement_timeout') AS statement_timeout,
        current_setting('max_parallel_workers_per_gather') AS max_parallel_workers_per_gather`)).rows[0];
    const visibility = (await pool.query(`SELECT c.relname,c.reltuples,c.relpages,c.relallvisible,
        s.last_analyze,s.last_autoanalyze,s.last_vacuum,s.last_autovacuum
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
        WHERE n.nspname='report' AND c.relname IN ('learning_fact','person_projection')`)).rows;
    const indexes = (await pool.query(`SELECT indexname,indexdef,pg_relation_size(('report.'||quote_ident(indexname))::regclass)::text AS bytes
        FROM pg_indexes WHERE schemaname='report' AND tablename='learning_fact' ORDER BY indexname`)).rows;
    const scenarios = [];
    try {
        for (const [name, definition] of Object.entries(truth.scenarios)) {
            const queries: { sql: string; parameters: unknown[]; plan: PlanNode; executionMs: number; planningMs: number; roundtripMs: number }[] = [];
            const db = { query: async (sql: string, parameters: unknown[] = []) => {
                if (/^(?:WITH history_people AS MATERIALIZED|SELECT (?:r\.id|r\.historical_department_id|count\(\*\)::int count FROM report\.))/.test(sql)) {
                    const start = performance.now();
                    const explained = await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql, parameters);
                    const result = explained.rows[0]['QUERY PLAN'][0];
                    queries.push({ sql, parameters: structuredClone(parameters), plan: result.Plan,
                        executionMs: result['Execution Time'], planningMs: result['Planning Time'], roundtripMs: performance.now() - start });
                }
                return pool.query(sql, parameters);
            } } as DB;
            const result = await service.list({ tenantId: 'T1', personId: definition.actor }, 'native', {
                limit: 50, history: definition.history, aggregate: definition.history, liveHistory: definition.history,
                groupBy: definition.history ? 'department,job,status' : undefined
            }, db);
            scenarios.push({ name, endpoint: definition.path, revision: result.evidence.revision, queries,
                actual: { count: result.count, rows: result.rows },
                expected: { count: definition.expectedCount, rows: definition.expectedRows },
                resultDigest: digest({ count: result.count, rows: result.rows }), expectedDigest: definition.resultDigest });
        }
        return { capturedAt: new Date().toISOString(), candidate: 'native', maintenance: 'none; read-only capture', environment, visibility, indexes, scenarios };
    } finally {
        await cache.close();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const output = process.env.OUTPUT ?? `evidence/raw/native-candidate1/capture-${Date.now()}`;
        await mkdir(output, { recursive: true });
        const evidence = await captureNativeFactAccess();
        await writeFile(`${output}/fact-access.json`, JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ output, scenarios: evidence.scenarios.map(s => ({ name: s.name, truth: s.resultDigest === s.expectedDigest,
            queries: s.queries.map(q => ({ executionMs: q.executionMs, factAccess: planNodes(q.plan).filter(n => n['Relation Name'] === 'learning_fact') })) })) }));
    } finally {
        await pool.end();
    }
}
