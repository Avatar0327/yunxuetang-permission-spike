import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { pool, transaction, Denied, Unavailable } from '../src/infrastructure/db.js';
import { Authority } from '../src/authz/revision.js';
import { SessionCache } from '../src/authz/cache.js';
import { ReportService } from '../src/report/service.js';
import { ExportService } from '../src/report/exports.js';
async function record(name: string, expected: unknown, actual: unknown, candidate: string) { await appendFile('evidence/raw/task2-fix1-observations.jsonl', JSON.stringify({ name, candidate, expected, actual, at: new Date().toISOString() }) + '\n'); }
async function blocked() { for (let i = 0; i < 100; i++) {
    const r = await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE '%FOR UPDATE OF r%'");
    if (r.rows[0].n)
        return;
    await new Promise(r => setTimeout(r, 20));
} throw Error('no actual revision lock waiter'); }
for (const candidate of ['native', 'casbin'] as const) {
    for (const scenario of ['department', 'company', 'disabled', 'deleted'] as const)
        for (const entry of (['department', 'company'].includes(scenario) ? ['context', 'report'] : ['context']))
            test(`${candidate}: waiting ${entry} reads committed ${scenario} facts`, async () => {
                const cache = new SessionCache(), authority = new Authority(cache), report = new ReportService(authority), writer = await pool.connect();
                const actor = scenario === 'company' ? 'X' : 'M', identity = { tenantId: 'T1', personId: actor };
                const original = (await pool.query("SELECT department_id,company_id,enabled,deleted FROM organization.person WHERE tenant_id='T1' AND id=$1", [actor])).rows[0];
                let pending: Promise<any> | undefined;
                try {
                    await writer.query('BEGIN');
                    const assignments = { department: "department_id='D2'", company: "company_id='B'", disabled: 'enabled=false', deleted: 'deleted=true' };
                    await writer.query(`UPDATE organization.person SET ${assignments[scenario]} WHERE tenant_id='T1' AND id=$1`, [actor]);
                    pending = transaction(async (db) => {
                        // Direct current must itself reject disabled/deleted, without borrowing a later recheck.
                        const options = { fixture: true, history: scenario === 'company', node: 'department-report' };
                        const first = entry === 'report' ? await report.list(identity, candidate, options, db, true) : undefined;
                        const context = await authority.current(identity, db, true);
                        const result = first ?? await report.list(identity, candidate, options, db, true);
                        return { status: 200, departmentId: context.departmentId, companyId: context.companyId, revision: context.revision, ids: result.rows.map(r => r.id) };
                    }).catch(e => ({ status: e instanceof Denied ? 403 : e instanceof Unavailable ? 503 : 500 }));
                    await blocked();
                    await writer.query('COMMIT');
                    const actual = await pending;
                    if (scenario === 'disabled' || scenario === 'deleted') {
                        await record(scenario, { status: 403 }, actual, candidate);
                        assert.deepEqual(actual, { status: 403 });
                    }
                    else {
                        const fresh = await authority.current(identity);
                        const expected = scenario === 'department' ? { status: 200, departmentId: 'D2', companyId: 'I', ids: ['B', 'E', 'M', 'N'] } : { status: 200, departmentId: undefined, companyId: 'B', ids: ['h-X-B'] };
                        await record(scenario, expected, actual, candidate);
                        assert.deepEqual({ ...actual, revision: undefined }, { ...expected, revision: undefined });
                        assert.equal(actual.revision, fresh.revision);
                    }
                }
                finally {
                    await writer.query('ROLLBACK');
                    if (pending)
                        await pending;
                    writer.release();
                    await pool.query("UPDATE organization.person SET department_id=$2,company_id=$3,enabled=$4,deleted=$5 WHERE tenant_id='T1' AND id=$1", [actor, original.department_id, original.company_id, original.enabled, original.deleted]);
                    await cache.close();
                }
            });
    test(`${candidate}: grouped export >200 facts emits each literal group exactly once; ordinary export still pages`, async () => {
        const cache = new SessionCache(), authority = new Authority(cache), exportsService = new ExportService(new ReportService(authority));
        const identity = { tenantId: 'T1', personId: 'X' };
        let jobs: string[] = [];
        try {
            await pool.query("INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,fixture,points) SELECT 'T1','fix1-'||lpad(i::text,3,'0'),'X','A',CASE WHEN i<=201 THEN 'fix-group-A' ELSE 'fix-group-B' END,true,2 FROM generate_series(1,205)i");
            const grouped = await exportsService.create(identity, candidate, { history: true, fixture: true, aggregate: true });
            jobs.push(grouped.id);
            const executed = await exportsService.phase(identity, candidate, grouped.id, 'execute');
            const claimed = await exportsService.phase(identity, candidate, grouped.id, 'claim');
            const expected = [{ historical_department_id: 'fix-group-A', count: 201, points: '402' }, { historical_department_id: 'fix-group-B', count: 4, points: '8' }, { historical_department_id: 'old-A', count: 1, points: '10' }];
            await record('grouped-export', { count: 3, rows: expected }, { count: executed.count, rows: claimed.rows }, candidate);
            assert.equal(executed.count, 3);
            assert.deepEqual(claimed, { count: 3, rows: expected });
            const ordinary = await exportsService.create(identity, candidate, { history: true, fixture: true });
            jobs.push(ordinary.id);
            const normal = await exportsService.phase(identity, candidate, ordinary.id, 'execute');
            const output = await collectChunks(exportsService,identity,candidate,ordinary.id);
            const expectedIds = Array.from({ length: 205 }, (_, i) => 'fix1-' + String(i + 1).padStart(3, '0')).concat('h-X-A');
            await record('ordinary-export', { count: 206, ids: expectedIds }, { count: normal.count, ids: output.rows.map((r: any) => r.id) }, candidate);
            assert.equal(normal.count, 206);
            assert.deepEqual(output.rows.map((r: any) => r.id), expectedIds);
            assert.equal(output.rows.some((r: any) => r.data_company_id !== 'A'), false);
        }
        finally {
            await pool.query("DELETE FROM report.export_job WHERE tenant_id='T1' AND id=ANY($1::text[])", [jobs]);
            await pool.query("DELETE FROM report.learning_fact WHERE tenant_id='T1' AND id LIKE 'fix1-%'");
            await cache.close();
        }
    });
}
for (const candidate of ['native', 'casbin'] as const)
    test(`${candidate}: export ignores UI offset and limit and returns the complete filtered result`, async () => {
        const cache = new SessionCache(), service = new ExportService(new ReportService(new Authority(cache)));
        const identity = { tenantId: 'T1', personId: 'X' };
        let id: string | undefined;
        try {
            await pool.query("INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,fixture,points) SELECT 'T1','fix1-'||lpad(i::text,3,'0'),'X','A','fix-group-A',true,2 FROM generate_series(1,205)i");
            const job = await service.create(identity, candidate, { history: true, fixture: true, offset: 150, limit: 3 });
            id = job.id;
            const executed = await service.phase(identity, candidate, id, 'execute'), claimed = await collectChunks(service,identity,candidate,id);
            const expectedIds = Array.from({ length: 205 }, (_, i) => 'fix1-' + String(i + 1).padStart(3, '0')).concat('h-X-A');
            await record('offset-export', { count: 206, ids: expectedIds }, { count: executed.count, ids: claimed.rows.map((r: any) => r.id) }, candidate);
            assert.equal(executed.count, 206);
            assert.deepEqual(claimed.rows.map((r: any) => r.id), expectedIds);
        }
        finally {
            if (id)
                await pool.query("DELETE FROM report.export_job WHERE tenant_id='T1' AND id=$1", [id]);
            await pool.query("DELETE FROM report.learning_fact WHERE tenant_id='T1' AND id LIKE 'fix1-%'");
            await cache.close();
        }
    });
test('locking authority rejects pool and a bare autocommit client', async () => { const cache = new SessionCache(), authority = new Authority(cache), bare = await pool.connect(); try {
    await assert.rejects(authority.current({ tenantId: 'T1', personId: 'M' }, pool, true), Unavailable);
    await assert.rejects(authority.current({ tenantId: 'T1', personId: 'M' }, bare, true), Unavailable);
}
finally {
    bare.release();
    await cache.close();
} });
test.after(async () => pool.end());

async function collectChunks(service:ExportService,identity:{tenantId:string;personId:string},candidate:'native'|'casbin',id:string){
 const rows:any[]=[];let chunk=0,total=-1;for(;;){const page=await service.phase(identity,candidate,id,'claim',chunk);assert.ok(page.rows.length<=200);if(total<0)total=page.count;assert.equal(page.count,total);rows.push(...page.rows);if(page.nextChunk===undefined)break;assert.equal(page.nextChunk,chunk+1);chunk=page.nextChunk;}assert.equal(rows.length,total);return {rows,count:total};
}
