import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { createClient } from 'redis';
import { pool } from '../src/infrastructure/db.js';
import { effectiveCategory } from '../src/knowledge/public.js';
import { start, prepareAdmin, policy, observe } from './task3-helper.js';

// Literal outcomes are independent of either candidate. Keep every HTTP body, including RED.
async function captured(candidate: string) {
    const api = await start(candidate);
    return {        
...api, request: async (method: string, path: string, body?: unknown, actor = 'Z') => {
            const response = await api.request(method, path, body, actor);
            await appendFile(process.env.FINAL_FIX_HTTP ?? 'evidence/raw/final-fix-http.jsonl', JSON.stringify({ candidate, source: process.env.FINAL_FIX_SOURCE, method, path, actor, request: body, response, at: new Date().toISOString() }) + '\n');
            return response;
        }    
};
}
async function membership(id: string, personId: string, policies: any[], caps?: any[]) {
    const data = { id, tenantId: 'T1', personId, roleId: 'role-9', level: 2, active: true, provenance: 'system_origin', policies, ...(caps ? { delegation: { sourceMembershipId: 'admin', sourceActorId: 'Z', revision: 1, caps } } : {}) };
    await pool.query("INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES('T1',$1,$2,'role-9',$3)", [id, personId, data]);
}
for (const candidate of ['native', 'casbin']) {
    test(`${candidate}: I1 appointment natural keys never collide`, async t => {
        const api = await captured(candidate), p = 'final-' + candidate;
        const people = [p + '-A-B', p + '-A'], projects = [p + '-C', 'B-' + p + '-C', p + '-other'];
        const pairs = [{ person_id: people[0], project_id: projects[0], active: true }, { person_id: people[1], project_id: projects[1], active: false }];
        const rows = async () => (await pool.query("SELECT person_id,project_id,active FROM training.appointment WHERE tenant_id='T1' AND person_id=ANY($1::text[]) ORDER BY person_id DESC,project_id", [people])).rows;
        try {
            for (const person of people) {
                await pool.query("INSERT INTO organization.person(tenant_id,id,company_id,department_id,internal,display_name) VALUES('T1',$1,'I','D1',true,$1)", [person]);
                await pool.query('INSERT INTO authz.session VALUES($1,\'T1\',$2)', [createHash('sha256').update('spike-' + person).digest('hex'), person]);
            }
            for (const id of projects) await pool.query("INSERT INTO training.project(tenant_id,id,created_by,title) VALUES('T1',$1,'Z',$1)", [id]);
            await membership(p, 'M', [policy('project', ['training.project.appoint'])], [{ nodeId: 'project', action: 'training.project.appoint', objectIds: [projects[1]], rawFields: [] }]);
            await observe(candidate, 'I1 first independent appointment', 200, (await api.request('POST', '/appointments', { personId: people[0], projectId: projects[0], active: true })).status);
            await observe(candidate, 'I1 operator cannot authorize first relation', 403, (await api.request('POST', '/appointments', { personId: people[0], projectId: projects[0], active: false }, 'M')).status);
            for (const active of [false, true, true, false]) await t.test('intended second relation active=' + active, async () => {
                const r = await api.request('POST', '/appointments', { personId: people[1], projectId: projects[1], active }, 'M');
                await observe(candidate, 'I1 intended relation transport ' + active, 200, r.status);
                await observe(candidate, 'I1 only intended natural key changes ' + active, [pairs[0], { ...pairs[1], active }], await rows());
                const stored = (await pool.query("SELECT id FROM training.appointment WHERE tenant_id='T1' AND person_id=$1 AND project_id=$2", [people[1], projects[1]])).rows[0];
                await observe(candidate, 'I1 returned actual persisted ID', stored.id, r.body.id);
            });
            await t.test('unrelated appointment, backend and revoke boundaries', async () => {
                await api.request('POST', '/appointments', { personId: people[0], projectId: projects[2], active: true });
                await api.request('POST', '/appointments', { personId: people[0], projectId: projects[0], active: false });
                await observe(candidate, 'I1 revoke first exact object', 403, (await api.request('GET', '/projects/' + projects[0], undefined, people[0])).status);
                await observe(candidate, 'I1 another appointment retained', 200, (await api.request('GET', '/projects/' + projects[2], undefined, people[0])).status);
                await observe(candidate, 'I1 surviving source backend', { backend: true, nodes: ['project'] }, (await api.request('GET', '/auth/me', undefined, people[0])).body.capabilities);
                await api.request('POST', '/appointments', { personId: people[0], projectId: projects[2], active: false });
                await observe(candidate, 'I1 final revoke backend closes', { backend: false, nodes: [] }, (await api.request('GET', '/auth/me', undefined, people[0])).body.capabilities);
            });
        } finally {
            await api.close(); await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=$1", [p]);
            await pool.query("DELETE FROM training.appointment WHERE tenant_id='T1' AND person_id=ANY($1::text[])", [people]);
            await pool.query("DELETE FROM training.project WHERE tenant_id='T1' AND id=ANY($1::text[])", [projects]);
            await pool.query("DELETE FROM authz.session WHERE tenant_id='T1' AND person_id=ANY($1::text[])", [people]);
            await pool.query("DELETE FROM organization.person WHERE tenant_id='T1' AND id=ANY($1::text[])", [people]);
        }
    });
    test(`${candidate}: I2 mixed-case membership is independent of collation`, async t => {
        const api = await captured(candidate), p = 'final-sort-' + candidate, people = ['Z-' + p, 'a-' + p], departments = ['Z-dept-' + p, 'a-dept-' + p, 'b-dept-' + p];
        const roster = async (id: string) => (await pool.query("SELECT person_id,company_id,snapshot_display_name,progress,attachment FROM training.roster WHERE tenant_id='T1' AND project_id=$1 ORDER BY person_id", [id])).rows;
        try {
            for (const person of people) await pool.query("INSERT INTO organization.person(tenant_id,id,company_id,department_id,manager_id,internal,display_name) VALUES('T1',$1,'I','D1','M',true,$1)", [person]);
            await pool.query("INSERT INTO training.person_projection SELECT tenant_id,id,id,company_id,enabled,deleted,department_id,manager_id,display_name FROM organization.person WHERE tenant_id='T1' AND id=ANY($1::text[])", [people]);
            for (const suffix of ['-project', '-team']) await pool.query("INSERT INTO training.project(tenant_id,id,created_by,title,team_enabled) VALUES('T1',$1,'Z',$1,true)", [p + suffix]);
            await membership(p, 'M', [policy('team-enrollment', ['training.enrollment.add', 'training.enrollment.remove'])]);
            await api.request('POST', '/appointments', { personId: 'L', projectId: p + '-project', active: true });
            for (const [suffix, actor] of [['-project', 'L'], ['-team', 'M']]) for (const operation of ['add', 'remove']) await t.test(suffix + ' ' + operation, async () => {
                const id = p + suffix;
                await pool.query("DELETE FROM training.roster WHERE tenant_id='T1' AND project_id=$1", [id]);
                if (operation === 'remove') await pool.query("INSERT INTO training.roster(tenant_id,project_id,person_id,company_id) SELECT 'T1',$1,unnest($2::text[]),'I'", [id, people]);
                await observe(candidate, 'I2 mixed-case ' + suffix + ' ' + operation, 200, (await api.request('POST', '/projects/' + id + '/enrollments', { operation, personIds: people }, actor)).status);
                await observe(candidate, 'I2 exact roster ' + suffix + ' ' + operation, operation === 'add' ? [...people].sort() : [], (await roster(id)).map(r => r.person_id).sort());
            });
            for (const [suffix, actor] of [['-project', 'L'], ['-team', 'M']]) for (const operation of ['add', 'remove']) await t.test(suffix + ' mixed invalid atomic ' + operation, async () => {
                const id = p + suffix; await pool.query("DELETE FROM training.roster WHERE tenant_id='T1' AND project_id=$1", [id]);
                if (operation === 'remove') await pool.query("INSERT INTO training.roster(tenant_id,project_id,person_id,company_id) SELECT 'T1',$1,unnest($2::text[]),'I'", [id, people]);
                const before = await roster(id);
                for (const bad of ['X', 'missing', people[0]]) {
                    await observe(candidate, 'I2 denied full ' + suffix + ' ' + operation + ' ' + bad, 403, (await api.request('POST', '/projects/' + id + '/enrollments', { operation, personIds: [...people, bad] }, actor)).status);
                    await observe(candidate, 'I2 unchanged full roster ' + suffix + ' ' + operation + ' ' + bad, before, await roster(id));
                }
            });
            for (const id of departments) await pool.query("INSERT INTO organization.department(tenant_id,id,company_id) VALUES('T1',$1,'I')", [id]);
            await pool.query("UPDATE organization.department SET parent_id=$2 WHERE tenant_id='T1' AND id=$1", [departments[2], departments[0]]);
            await t.test('department subtree and target parent mixed case', async () => {
                await observe(candidate, 'I2 department mixed-case authorized move', 200, (await api.request('POST', '/departments/' + departments[0] + '/move', { parentId: departments[1] })).status);
                await observe(candidate, 'I2 department exact stored parent', departments[1], (await pool.query("SELECT parent_id FROM organization.department WHERE tenant_id='T1' AND id=$1", [departments[0]])).rows[0].parent_id);
            });
            await membership(p + '-department', 'M', [policy('department', ['organization.department.move'])], [{ nodeId: 'department', action: 'organization.department.move', objectIds: departments.slice(0, 2), rawFields: [] }]);
            await t.test('department unauthorized child atomic', async () => {
                const before = (await pool.query("SELECT id,parent_id FROM organization.department WHERE tenant_id='T1' AND id=ANY($1::text[]) ORDER BY id", [departments])).rows;
                await observe(candidate, 'I2 department incomplete child cap denied', 403, (await api.request('POST', '/departments/' + departments[0] + '/move', { parentId: null }, 'M')).status);
                await observe(candidate, 'I2 department complete tree unchanged', before, (await pool.query("SELECT id,parent_id FROM organization.department WHERE tenant_id='T1' AND id=ANY($1::text[]) ORDER BY id", [departments])).rows);
            });
        } finally {
            await api.close(); await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[])", [[p, p + '-department']]);
            for (const table of ['training.roster', 'training.appointment']) await pool.query(`DELETE FROM ${table} WHERE tenant_id='T1' AND project_id=ANY($1::text[])`, [[p + '-project', p + '-team']]);
            await pool.query("DELETE FROM training.project WHERE tenant_id='T1' AND id=ANY($1::text[])", [[p + '-project', p + '-team']]);
            await pool.query("DELETE FROM training.person_projection WHERE tenant_id='T1' AND id=ANY($1::text[])", [people]);
            await pool.query("DELETE FROM organization.person WHERE tenant_id='T1' AND id=ANY($1::text[])", [people]);
            await pool.query("DELETE FROM organization.department WHERE tenant_id='T1' AND id=ANY($1::text[])", [departments]);
        }
    });
    test(`${candidate}: I3 category target equivalence and fail closed`, async t => {
        await prepareAdmin(); const api = await captured(candidate), p = 'final-category-' + candidate, body = { managementRoleMembershipId: 'admin', grants: [] };
        const safe = { status: 403, body: { message: '你暂时不能查看或操作这项内容，请联系管理员确认权限' } };
        const business = (r: any) => { const { meta, ...body } = r.body; return { status: r.status, body }; };
        try {
            await pool.query("INSERT INTO knowledge.category(tenant_id,id,creator_id) VALUES('T1',$1,'Z'),('T2',$2,'other-1')", [p, p + '-foreign']);
            for (const route of ['configure', 'append-preview', 'append', 'import', 'recheck']) await t.test(route + ' equal safe denial', async () => {
                const observations = [];
                for (const id of [p, p + '-missing', p + '-foreign']) {
                    const path = route === 'import' ? '/categories/import' : '/categories/' + id + (route === 'configure' ? '' : '/' + route);
                    observations.push(business(await api.request('POST', path, route === 'import' ? { updates: [{ id, ...body }] } : body, 'L')));
                }
                await observe(candidate, 'I3 ' + route + ' inaccessible missing foreign same safe response', [safe, safe, safe], observations);
            });
            await t.test('authorized create missing parent is safe denial', async () => {
                await observe(candidate, 'I3 missing parent business response', safe, business(await api.request('POST', '/categories', { id: p + '-child', parentId: p + '-missing', ...body })));
            });
            await t.test('authorized positive and import rollback', async () => {
                await observe(candidate, 'I3 authorized configure retained', 200, (await api.request('POST', '/categories/' + p, body)).status);
                const before = (await pool.query("SELECT * FROM knowledge.category WHERE tenant_id='T1' AND id=$1", [p])).rows;
                const r = await api.request('POST', '/categories/import', { updates: [{ id: p, ...body, forceChildren: true }, { id: p + '-missing', ...body }] });
                await observe(candidate, 'I3 missing target batch safe response', safe, business(r));
                await observe(candidate, 'I3 import entire category unchanged', before, (await pool.query("SELECT * FROM knowledge.category WHERE tenant_id='T1' AND id=$1", [p])).rows);
            });
            await t.test('real Redis fault remains unavailable', async () => {
                const redis = createClient({ socket: { host: '127.0.0.1', port: 56379 } }); redis.on('error', () => { });
                try {                    
await redis.connect(); await redis.sendCommand(['CLIENT', 'PAUSE', '650', 'ALL']);
                    await observe(candidate, 'I3 actual Redis timeout safe 503', { status: 503, body: { message: '服务暂不可用，请稍后重试' } }, business(await api.request('POST', '/categories/' + p, body)));
                    await new Promise(r => setTimeout(r, 750));
                    await observe(candidate, 'I3 Redis recovery authorized configure', 200, (await api.request('POST', '/categories/' + p, body)).status);
                } finally { if (redis.isOpen) await redis.close(); }
            });
        } finally { await api.close(); await pool.query("DELETE FROM knowledge.category WHERE id=ANY($1::text[])", [[p, p + '-foreign', p + '-child']]); }
    });
}
test('I3 damaged existing ancestry is still an unexpected error', () => {
    assert.throws(() => effectiveCategory([{ id: 'child', parent_id: 'missing', creator_id: 'Z', inherit_parent: true, force_children: false, grants: [] }], 'child'), /missing category ancestor/);
});
test.after(() => pool.end());
