import { readFile, writeFile } from 'node:fs/promises';
import { request, check, evidence, dir } from './evidence.js';
import { pool, transaction } from '../src/infrastructure/db.js';
const completed = new Set<string>();
async function observe(id: string, r: Awaited<ReturnType<typeof request>>, actual: unknown, expected: unknown) { await check(id, actual, expected, { candidate: r.payload.meta?.candidate, requestAt: r.requestedAt, completeAt: r.completedAt, revision: r.payload.evidence?.revision ?? r.payload.revision, sourceIds: r.payload.evidence?.sourceIds ?? [], output: r }); completed.add(id); }
try {
    for (let instance = 0; instance < 2; instance++) {
        const scoped = await request('/report?fixture=true&node=department-report', 'M', undefined, instance);
        await observe('AUTH-T01-03', scoped, scoped.payload.rows?.map((r: any) => r.id), ['A', 'C', 'M']);
        await observe('AUTH-T13-02', scoped, scoped.payload.count, 3);
        const broad = await request('/report?fixture=true', 'M', undefined, instance);
        await observe('AUTH-T12-02', broad, broad.payload.rows?.map((r: any) => [r.id, r.phone, r.email, r.id_card]), [['A', 'phone-A', 'email-A', 'card-A'], ['B', null, null, null], ['C', 'phone-C', 'email-C', 'card-C'], ['D', null, null, null], ['E', null, null, null], ['M', 'phone-M', 'email-M', 'card-M'], ['N', null, null, null]]);
        for (const [id, target] of [['AUTH-T10-01', 'B'], ['AUTH-T10-02', 'random-missing'], ['AUTH-T10-03', 'other-1']]) {
            const r = await request('/report?node=department-report&id=' + target, 'M', undefined, instance);
            await observe(id!, r, [r.status, r.payload.message, r.payload.rows], [403, '你暂时不能查看或操作这项内容，请联系管理员确认权限', undefined]);
        }
        const search = await request('/report?fixture=true&node=department-report&search=B', 'M', undefined, instance);
        await observe('AUTH-T13-05', search, [search.payload.rows, search.payload.count], [[], 0]);
        const history = await request('/report?history=true&fixture=true', 'X', undefined, instance);
        await observe('AUTH-T23-03', history, history.payload.rows?.map((r: any) => r.id), ['h-X-A']);
        const disabled = await request('/report', 'disabled', undefined, instance);
        await observe('actor-disabled-denied', disabled, disabled.status, 403);
        for (const limit of [20, 50, 200]) {
            const r = await request('/report?limit=' + limit, 'M', undefined, instance);
            await check('page-size-query-count-' + limit, r.payload.meta.queryCount, 14, { candidate: r.payload.meta.candidate, instance });
            await evidence('query-count', { limit, instance, queries: r.payload.meta.queryCount, candidate: r.payload.meta.candidate, revision: r.payload.evidence?.revision });
        }
    }
    let r = await request('/auth/me', 'L');
    await observe('AUTH-T06-01', r, r.payload.capabilities, { backend: false, nodes: [] });
    await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: true });
    r = await request('/auth/me', 'L', undefined, 1);
    await observe('AUTH-T06-02', r, r.payload.capabilities, { backend: true, nodes: ['project'] });
    r = await request('/projects', 'L');
    await observe('AUTH-T06-04', r, [r.payload.rows?.map((x: any) => x.id), r.payload.count], [['P'], 1]);
    await request('/appointments', 'Z', { personId: 'L', projectId: 'Q', active: true });
    r = await request('/projects', 'L');
    await observe('appointment-P-plus-Q', r, r.payload.rows?.map((x: any) => x.id), ['P', 'Q']);
    await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: false });
    r = await request('/projects', 'L', undefined, 1);
    await observe('AUTH-T06-10', r, r.payload.rows?.map((x: any) => x.id), ['Q']);
    await request('/appointments', 'Z', { personId: 'L', projectId: 'Q', active: false });
    r = await request('/auth/me', 'L', undefined, 1);
    await observe('AUTH-T06-11', r, r.payload.capabilities, { backend: false, nodes: [] });
    await request('/people/X','Z',{departmentId:'wide-1'});
    await request('/people/Y','Z',{departmentId:'wide-2'});
    for (const [actor, ids] of [['X', ['X']], ['Y', ['Y']]] as const) {
        await request('/appointments', 'Z', { personId: actor, projectId: 'P', active: true });
        r = await request('/projects/P', actor);
        await observe('shared-project-detail-visible', r, r.status, 200);
        r = await request('/projects/P/roster', actor);
        await observe('AUTH-T21-06', r, [r.payload.rows?.map((x: any) => x.person_id), r.payload.count], [ids, 1]);
        r = await request('/projects/P', actor, { title: 'must-not-save' });
        await observe('AUTH-T21-11', r, r.status, 403);
    }
    const job = await request('/exports', 'M', { fixture: true });
    await observe('AUTH-T17-02', job, job.status, 200);
    r = await request('/exports/' + job.payload.id + '/execute', 'M', {});
    await observe('AUTH-T17-03', r, [r.status, r.payload.count], [200, 7]);
    r = await request('/exports/' + job.payload.id + '/claim', 'M');
    await observe('AUTH-T12-04', r, r.payload.rows?.map((x: any) => [x.id, x.phone]), [['A', 'phone-A'], ['B', null], ['C', 'phone-C'], ['D', null], ['E', null], ['M', 'phone-M'], ['N', null]]);
    await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: true });
    r = await request('/exports/' + job.payload.id + '/claim', 'M');
    await observe('AUTH-T17-04', r, r.status, 403);
    await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: false });
    const counts = (await pool.query(`select (select count(*)::int from organization.person where tenant_id='T1') people,(select count(*)::int from organization.person where tenant_id='T2') other,(select count(*)::int from organization.department where tenant_id='T1') departments,(select count(*)::int from report.learning_fact where not fixture) facts`)).rows[0];
    await check('AUTH-T18-scale', counts, { people: 50000, other: 500, departments: 2000, facts: 1000000 });
    for (const [name, sql] of [['depth21', "INSERT INTO organization.department VALUES('T1','bad-depth','chain-20','I')"], ['cycle', "UPDATE organization.department SET parent_id='chain-20' WHERE tenant_id='T1' AND id='chain-1'"], ['parent', "INSERT INTO organization.department VALUES('T1','bad-parent','missing','I')"], ['category11', "INSERT INTO knowledge.category(tenant_id,id,parent_id) VALUES('T1','bad-category','cat-10')"]]) {
        let rejected = false;let sqlstate:string|undefined;
        try {
            await transaction(async (db) => { await db.query(sql!); });
        }
        catch(error) {
            sqlstate=(error as any).code;rejected = sqlstate==='P0001';
        }
        await check('hierarchy-' + name, rejected, true,{sqlstate});
    }
    await evidence('functional-summary', { completed: [...completed], at: new Date().toISOString() });
    // No broad gate is inferred from these focused observations. The immutable manifest remains unchanged.
    const manifest = JSON.parse(await readFile('docs/acceptance-manifest.json', 'utf8'));
    for (const g of manifest.groups)
        for (const point of g.required_subcases)
            point.status = 'incomplete';
    await writeFile(`${dir}/gaps.json`, JSON.stringify({ note: 'Every manifest point remains incomplete at full acceptance level; focused IDs in functional.jsonl are observations, not complete group coverage. Controller must audit exact correspondence.', manifest, implementedObservations: [...completed], missing: ['controller actual browser campaign','capped50-client600-second reference windows','independent per-ID semantic acceptance audit'] }, null, 2));
    console.log(JSON.stringify({ focusedChecks: 'passed', fullAcceptance: 'incomplete', evidenceDir: dir }));
}
finally {
    await pool.end();
}
