import { writeFile, mkdir } from 'node:fs/promises';
import { pool, metrics, query } from '../src/infrastructure/db.js';
import { Authority } from '../src/authz/revision.js';
import { SessionCache } from '../src/authz/cache.js';
import { compile } from '../src/authz/compiler.js';
const cache = new SessionCache(), authority = new Authority(cache);
const output = process.env.OUTPUT ?? 'evidence/raw/explain';
await mkdir(output, { recursive: true });
try {
    for (const node of ['personal-learning', 'department-report', 'history']) {
        const auth = await authority.plan({ tenantId: 'T1', personId: 'M' }, 'native', node, node === 'history' ? 'report.history.view' : 'report.personal-learning.view');
        const history = node === 'history';
        const c = compile(auth.plan, { id: 'id', personId: 'person_id', companyId: 'company_id', dataCompanyId: 'data_company_id', enabled: 'enabled', deleted: 'deleted' });
        const sql = history ? `SELECT r.historical_department_id,count(*) FROM report.learning_fact r JOIN report.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id WHERE ${c.where} AND p.enabled=true AND p.deleted=false GROUP BY r.historical_department_id` : `SELECT r.id FROM report.person_projection r WHERE ${c.where} ORDER BY r.id LIMIT 50`;
        const plan = await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql, c.values);
        await writeFile(`${output}/${node}.json`, JSON.stringify({ sql, parameters: c.values, revision: auth.plan.revision, plan: plan.rows }, null, 2));
    }
    console.log('EXPLAIN ANALYZE BUFFERS saved to ' + output);
}
finally {
    await cache.close();
    await pool.end();
}
