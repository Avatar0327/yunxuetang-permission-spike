import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, transaction } from '../src/infrastructure/db.js';
import { ReportService } from '../src/report/service.js';
import { Authority } from '../src/authz/revision.js';
import { appendFile } from 'node:fs/promises';
import { SessionCache } from '../src/authz/cache.js';
const identity = { tenantId: 'T1', personId: 'M' };
for (const candidate of ['native', 'casbin'] as const) {
    test(`${candidate}: real SQL source-bound fields/count and company history`, async () => {
        const cache = new SessionCache();
        const authority = new Authority(cache);
        const service = new ReportService(authority);
        try {
            const r = await service.list(identity, candidate, { fixture: true, node: 'department-report' });
            assert.deepEqual(r.rows.map((x: any) => x.person_id), ['A', 'C', 'M']);
            assert.equal(r.count, 3);
            assert.equal(r.rows.find((x: any) => x.person_id === 'A').phone, 'phone-A');
            const broad = await service.list(identity, candidate, { fixture: true });
            assert.deepEqual(broad.rows.map((x: any) => x.person_id), ['A', 'B', 'C', 'D', 'E', 'M', 'N']);
            assert.equal(broad.rows.find((x: any) => x.person_id === 'B').phone, null);
            const customer = await service.list({ tenantId: 'T1', personId: 'X' }, candidate, { fixture: true, history: true });
            assert.deepEqual(customer.rows.map((x: any) => x.id), ['h-X-A']);
            await assert.rejects(service.list({ tenantId: 'T1', personId: 'disabled' }, candidate, {}), { status: 403 });
        }
        finally {
            await cache.close();
        }
    });
}
test('real database seeded scale and tenant FK', async () => {
    const r = await pool.query(`select (select count(*)::int from organization.person where tenant_id='T1') people,(select count(*)::int from organization.person where tenant_id='T2') others,(select count(*)::int from organization.department where tenant_id='T1') departments,(select count(*)::int from report.learning_fact where fixture=false) facts`);
    assert.deepEqual(r.rows[0], { people: 50000, others: 500, departments: 2000, facts: 1000000 });
    await assert.rejects(transaction(async (q) => q.query("insert into organization.person(tenant_id,id,company_id,department_id) values('T2','bad','I','D1')")));
});
for (const candidate of ['native', 'casbin'] as const)
    test(`${candidate}: six scopes, explicit subtree and per-membership override in real SQL`, async () => {
        const cache = new SessionCache(), authority = new Authority(cache), service = new ReportService(authority);
        const original = (await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id='m-dept'")).rows[0].data;
        const cases = [
            ['all', { kind: 'all' }, ['A', 'B', 'C', 'D', 'E', 'M', 'N']],
            ['ownDeptSubtree', { kind: 'ownDeptSubtree' }, ['A', 'C', 'D', 'M']],
            ['ownDept', { kind: 'ownDept' }, ['A', 'C', 'M']],
            ['specified-default', { kind: 'departments', departmentIds: ['D1'] }, ['A', 'C', 'M']],
            ['specified-subtree', { kind: 'departments', departmentIds: ['D1'], includeDescendants: true }, ['A', 'C', 'D', 'M']],
            ['self', { kind: 'self' }, ['M']],
            ['empty-managed', { kind: 'managed' }, []],
            ['managed-D2', { kind: 'managed' }, ['B', 'E', 'N']],
        ] as const;
        try {
            for (const [name, scope, expected] of cases) {
                const m = structuredClone(original);
                m.policies.find((p: any) => p.nodeId === 'department-report').scope = scope;
                if (name === 'managed-D2')
                    m.jurisdiction = { kind: 'departments', departmentIds: ['D2'] };
                await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='m-dept'", [m]);
                const r = await service.list(identity, candidate, { fixture: true, node: 'department-report' });
                const actual = r.rows.map((x: any) => x.id);
                await appendFile('evidence/raw/task2-scope-observations.jsonl', JSON.stringify({ candidate, name, expected, actual, count: r.count, revision: r.evidence.revision, sourceIds: r.evidence.sourceIds, at: new Date().toISOString() }) + '\n');
                assert.deepEqual(actual, expected);
                assert.equal(r.count, expected.length);
            }
            const m = structuredClone(original);
            m.overrides = [{ membershipId: 'm-dept', nodeId: 'personal-learning', scope: { kind: 'self' } }];
            await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='m-dept'", [m]);
            const union = await service.list(identity, candidate, { fixture: true });
            assert.deepEqual(union.rows.map((x: any) => [x.id, x.phone]), [['A', null], ['B', null], ['C', null], ['D', null], ['E', null], ['M', 'phone-M'], ['N', null]]);
        }
        finally {
            await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='m-dept'", [original]);
            await cache.close();
        }
    });
test.after(async () => pool.end());
