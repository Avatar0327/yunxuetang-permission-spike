import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { ctx, org, nodes, membership, learning, project } from './fixtures.js';
import { normalizePolicy, normalizeCatalog, backendCapabilities, hardAllowed } from '../src/authz/policy.js';
import { resolveScope, scopeMatches, teamMembers } from '../src/authz/scope.js';
import { NativeCandidate, CasbinCandidate } from '../src/authz/candidates.js';
import { assertCanDelegate } from '../src/authz/delegation.js';
import type { Context, EffectiveGrant, Membership, Resource, Scope, ScopeSpec } from '../src/authz/contracts.js';
const engines = [new NativeCandidate(), new CasbinCandidate()];
const view = 'report.personal-learning.view', edit = 'report.personal-learning.edit';
function plan(ms: Membership[], context = ctx, extra: Parameters<typeof normalizePolicy>[0]['appointments'] = []) {
    return normalizePolicy({ context, nodes, memberships: ms, appointments: extra, appointmentCapabilities: [{ nodeId: 'project', actions: ['training.project.view', 'training.project.update', 'training.project.export'] }], subjectResolvers: {} });
}
async function match(ms: Membership[], resource: Resource, action = view, nodeId = 'personal-learning', context = ctx) {
    const grants = plan(ms, context);
    const expectedResults = [];
    for (const engine of engines)
        expectedResults.push(await engine.match({ context, nodeId, action, resource, nodes, grants, organization: org }));
    return expectedResults;
}
async function expectSources(ms: Membership[], resource: Resource, expected: string[], action = view, nodeId = 'personal-learning', context = ctx, fields: string[] = []) {
    for (const [i, result] of (await match(ms, resource, action, nodeId, context)).entries()) {
        if (process.env.SEMANTIC_EVIDENCE)
            appendFileSync(process.env.SEMANTIC_EVIDENCE, JSON.stringify({ timestamp: new Date().toISOString(), candidate: engines[i]!.name, resourceId: resource.id, tenantId: context.tenantId, nodeId, action, expectedSources: expected, actualSources: result.sourceIds, expectedRawFields: fields, actualRawFields: result.rawFields }) + '\n');
        assert.deepEqual(result.sourceIds, expected, `${engines[i]!.name}: ${resource.id}/${action}`);
        assert.deepEqual(result.rawFields, fields, `${engines[i]!.name}: fields ${resource.id}/${action}`);
    }
}
test('literal team, own department and subtree differ', () => {
    assert.deepEqual(teamMembers(ctx, org), ['A', 'B']);
    const own = plan([membership('own', { kind: 'ownDept' })])[0]!.scope;
    assert.deepEqual(resolveScope(own, org).personIds, ['A', 'C']);
    assert.deepEqual(resolveScope(plan([membership('sub', { kind: 'ownDeptSubtree' })])[0]!.scope, org).personIds, ['A', 'C', 'D']);
});
test('node/action sources never cross product; own-role override, empty and delete', async () => {
    const a = membership('edit', { kind: 'ownDept' }, edit), b = membership('view');
    await expectSources([a, b], learning('B'), ['role:view:personal-learning:' + view]);
    await expectSources([a, b], learning('B'), [], edit);
    await expectSources([a, b], learning('C'), ['role:edit:personal-learning:' + edit], edit);
    a.overrides = [{ membershipId: 'edit', nodeId: 'personal-learning', scope: { kind: 'self' } }];
    await expectSources([a, b], learning('C'), [], edit);
    await expectSources([a, b], learning('B'), ['role:view:personal-learning:' + view]);
    await expectSources([a, b], learning('M'), ['role:edit:personal-learning:' + edit], edit);
    a.overrides[0]!.scope = null;
    assert.equal(plan([a]).length, 0);
    delete a.overrides;
    await expectSources([a], learning('C'), ['role:edit:personal-learning:' + edit], edit);
    const department = membership('dept', { kind: 'ownDept' }, 'report.department.view', 'department-report');
    await expectSources([b, department], learning('B'), [], 'report.department.view', 'department-report');
    await expectSources([b, department], learning('C'), ['role:dept:department-report:report.department.view'], 'report.department.view', 'department-report');
    await expectSources([a, b], learning('B'), [], 'report.personal-learning.download');
});
test('override cannot invent navigation/actions/raw fields or follow new membership', async () => {
    const m = membership('old', { kind: 'ownDept' }, edit);
    m.overrides = [{ membershipId: 'old', nodeId: 'personal-learning', scope: { kind: 'all' } }];
    await expectSources([m], learning('B'), [], view);
    await expectSources([m], learning('B'), ['role:old:personal-learning:' + edit], edit);
    m.policies[0]!.navigation = false;
    assert.equal(plan([m]).length, 0);
    m.policies[0]!.navigation = true;
    m.id = 'new';
    await expectSources([m], learning('B'), [], edit);
});
test('six scope explicit boundaries and revision-bound organization facts', () => {
    const cases: [
        Scope,
        string[]
    ][] = [
        [{ kind: 'all' }, []], [{ kind: 'ownDept' }, ['A', 'C']], [{ kind: 'ownDeptSubtree' }, ['A', 'C', 'D']],
        [{ kind: 'departments', departmentIds: ['D1'] }, ['A', 'C']], [{ kind: 'departments', departmentIds: ['D1'], includeDescendants: true }, ['A', 'C', 'D']],
        [{ kind: 'departments', departmentIds: [] }, []], [{ kind: 'departments', departmentIds: ['unknown'] }, []], [{ kind: 'managed' }, []], [{ kind: 'self' }, ['M']]
    ];
    for (const [scope, expected] of cases) {
        const s = plan([membership('s', scope)])[0]!.scope;
        const r = resolveScope(s, org);
        assert.deepEqual(r.personIds, expected);
        assert.equal(r.all, scope.kind === 'all');
    }
    const m = membership('j', { kind: 'managed' });
    m.jurisdiction = { kind: 'departments', departmentIds: ['D2'] };
    assert.deepEqual(resolveScope(plan([m])[0]!.scope, org).personIds, ['B', 'E']);
    assert.deepEqual(resolveScope(plan([membership('other', { kind: 'managed' }), m])[0]!.scope, org).personIds, []);
    const missing = { ...ctx, departmentId: undefined };
    assert.deepEqual(resolveScope(plan([membership('s', { kind: 'ownDept' })], missing)[0]!.scope, org).personIds, []);
    assert.throws(() => resolveScope(plan([m])[0]!.scope, { ...org, revision: 8 }), /revision/);
    assert.throws(() => resolveScope(plan([m])[0]!.scope, { ...org, tenantId: 'T2' }), /tenant/);
    assert.equal(plan([membership('bad', { kind: 'ownDept' }, 'knowledge.course.maintain', 'course')]).length, 0);
});
test('raw fields are tied to matching source and all hard caps precede union', async () => {
    const a = membership('raw', { kind: 'ownDept' });
    a.policies[0]!.rawFields = ['phone'];
    const b = membership('masked', { kind: 'departments', departmentIds: ['D2'] });
    await expectSources([a, b], learning('A'), ['role:raw:personal-learning:' + view], view, 'personal-learning', ctx, ['phone']);
    await expectSources([a, b], learning('B'), ['role:masked:personal-learning:' + view]);
    for (const bad of [{ ...learning('A'), tenantId: 'T2' }, { ...learning('A'), enabled: false }, { ...learning('A'), deleted: true }, { ...learning('A'), exists: false }])
        await expectSources([a, b], bad, []);
    for (const bad of [{ ...ctx, enabled: false }, { ...ctx, deleted: true }, { ...ctx, authenticated: false }])
        await expectSources([a, b], learning('A'), [], view, 'personal-learning', bad);
    await expectSources([a, b], learning('A', 'CB'), [], view, 'personal-learning', { ...ctx, internal: false, companyId: 'CA', companyIds: ['CA', 'CB'] });
    await expectSources([a, b], learning('A'), [], view, 'unknown');
    const unknown = membership('unknown');
    unknown.subject = { type: 'missing', id: 'X' };
    assert.equal(plan([unknown]).length, 0);
    for (const state of ['inactive', 'recheck_required', 'suspended'] as const) {
        const m = membership('stale');
        m.provenance = state;
        assert.equal(plan([m]).length, 0);
    }
});
test('appointments derive exact backend and project grants; revoke preserves other source', async () => {
    const appointment = (id: string) => ({ id, personId: 'M', tenantId: 'T1', projectId: id, active: true });
    const grants = plan([], ctx, [appointment('P'), appointment('Q')]);
    assert.equal(backendCapabilities(plan([]), nodes).backend, false);
    assert.deepEqual(backendCapabilities(grants, nodes), { backend: true, nodes: ['project'] });
    for (const engine of engines) {
        for (const [id, expected] of [['P', ['appointment:P:project:training.project.view']], ['Q', ['appointment:Q:project:training.project.view']], ['R', []]] as const) {
            const r = await engine.match({ context: ctx, nodeId: 'project', action: 'training.project.view', resource: project(id), nodes, grants, organization: org });
            assert.deepEqual(r.sourceIds, expected);
            assert.deepEqual(r.rawFields, []);
        }
        const r = await engine.match({ context: ctx, nodeId: 'organization', action: 'organization.person.view', resource: { ...project('P'), type: 'person' }, nodes, grants, organization: org });
        assert.deepEqual(r.sourceIds, []);
    }
    assert.deepEqual(backendCapabilities(plan([], ctx, [appointment('Q')]), nodes), { backend: true, nodes: ['project'] });
    assert.equal(backendCapabilities(plan([]), nodes).backend, false);
    assert.equal(backendCapabilities(plan([membership('lawful')]), nodes).backend, true);
    assert.equal(grants.some(g => g.delegable), false);
    assert.equal(hardAllowed({ ...ctx, companyIds: ['CA'] }, nodes.find(n => n.id === 'project')!, project('P'), ['CA', 'CB']), false);
});
test('SELF uses only each registered node anchor and wallet exception stays narrow', async () => {
    const rows: [
        string,
        string,
        string,
        string
    ][] = [['personal-learning', view, 'learning', 'personId'], ['account', 'account.view', 'account', 'personId'], ['course', 'knowledge.course.maintain', 'course', 'uploaderId'], ['project', 'training.project.update', 'project', 'createdBy'], ['face', 'training.face.update', 'face', 'ownerId']];
    for (const [node, action, type, anchor] of rows) {
        const m = membership('self', { kind: 'self' }, action, node), r = { ...project('x'), type, [anchor]: 'M', dataCompanyId: 'CA' };
        await expectSources([m], r, [`role:self:${node}:${action}`], action, node);
        await expectSources([m], { ...r, [anchor]: 'N', ...(anchor === 'createdBy' ? {} : { createdBy: 'M' }) }, [], action, node);
    }
    const customer = { ...ctx, personId: 'A', internal: false, companyId: 'CB', companyIds: ['CB'] };
    const m = membership('history', { kind: 'self' });
    m.personId = 'A';
    await expectSources([m], { ...learning('A', 'CB'), dataCompanyId: 'CA' }, [], view, 'personal-learning', customer);
    const wallet = membership('wallet', { kind: 'self' }, 'account.own.view', 'wallet-own');
    wallet.personId = 'A';
    await expectSources([wallet], { ...learning('A', 'CB'), type: 'account', dataCompanyId: 'CA' }, ['role:wallet:wallet-own:account.own.view'], 'account.own.view', 'wallet-own', customer);
    await expectSources([wallet], { ...learning('B'), type: 'account' }, [], 'account.own.view', 'wallet-own', customer);
    await expectSources([wallet], { ...learning('A'), type: 'account', crossCompanyReference: true }, [], 'account.own.view', 'wallet-own', customer);
    // Historical department D2 does not remove current D1 person A; current D2 B cannot borrow historical D1.
    await expectSources([membership('current', { kind: 'ownDept' })], { ...learning('A'), historicalDepartmentId: 'D2' }, ['role:current:personal-learning:' + view]);
    await expectSources([membership('current', { kind: 'ownDept' })], { ...learning('B'), historicalDepartmentId: 'D1' }, []);
});
test('category locks, independent actions, public and extensible subjects use common grants', async () => {
    const catalog = { id: 'cat', tenantId: 'T1', creatorId: 'M', lockedBy: 'parent', grants: [{ id: 'public', action: 'knowledge.course.browse', subject: { type: 'public', id: 'T1' } }] };
    assert.throws(() => normalizeCatalog({ context: ctx, nodes, nodeId: 'course', catalog, courseId: 'C', customBrowse: [], subjectResolvers: {} }), /locked/);
    const unlocked = { ...catalog, lockedBy: undefined, grants: [...catalog.grants, { id: 'maint', action: 'knowledge.course.maintain', subject: { type: 'user', id: 'M' } }] };
    const replaced = normalizeCatalog({ context: ctx, nodes, nodeId: 'course', catalog: unlocked, courseId: 'C', customBrowse: [{ id: 'class', action: 'knowledge.course.browse', subject: { type: 'classroom_member', id: 'class-1' } }], subjectResolvers: { classroom_member: (_s, c) => c.personId === 'M' } });
    for (const engine of engines) {
        const base = { context: ctx, nodeId: 'course', resource: { ...project('C'), type: 'course' }, nodes, grants: replaced, organization: org };
        assert.deepEqual((await engine.match({ ...base, action: 'knowledge.course.browse' })).sourceIds, ['catalog:class']);
        assert.deepEqual((await engine.match({ ...base, action: 'knowledge.course.maintain' })).sourceIds, ['catalog:maint']);
        assert.deepEqual((await engine.match({ ...base, action: 'knowledge.course.download' })).sourceIds, []);
        assert.deepEqual((await engine.match({ ...base, action: 'knowledge.course.distribute' })).sourceIds, []);
        assert.deepEqual((await engine.match({ ...base, action: 'knowledge.course.browse', resource: { ...base.resource, tenantId: 'T2' } })).sourceIds, []);
    }
    assert.equal(normalizeCatalog({ context: { ...ctx, authenticated: false }, nodes, nodeId: 'course', catalog: unlocked, courseId: 'C', subjectResolvers: {} }).length, 0);
    assert.equal(normalizeCatalog({ context: ctx, nodes, nodeId: 'course', catalog: { ...unlocked, creatorId: 'N', grants: [{ id: 'unknown', action: 'knowledge.course.browse', subject: { type: 'missing', id: 'x' } }] }, courseId: 'C', subjectResolvers: {} }).length, 0);
});
test('selected management membership, resolved set/field caps and levels constrain delegation', async () => {
    const a = membership('A', { kind: 'ownDept' }, edit), b = membership('B', { kind: 'all' }, edit);
    a.policies[0]!.delegableActions = [edit];
    b.policies[0]!.delegableActions = [edit];
    b.policies[0]!.rawFields = ['phone'];
    const resolver = async (s: ScopeSpec) => ({ tenantId: s.tenantId, revision: s.revision, nodeId: s.nodeId, action: s.action, actorId: s.actorId, objectIds: resolveScope(s, org).all ? ['A', 'B', 'C', 'D', 'E'] : resolveScope(s, org).personIds });
    a.policies.push({nodeId:'role-management',navigation:true,actions:['authz.role.create','authz.role.update'],scope:{kind:'all'},rawFields:[],delegableActions:[]});
    const args = { context: ctx, nodes, memberships: [a, b], managementRoleMembershipId: 'A', operation: 'create' as const, targetLevel: 3 as const, proposed: [{ nodeId: 'personal-learning', action: edit, scope: { kind: 'departments', departmentIds: ['D1'] } as Scope, rawFields: [] }], resolveObjects: resolver };
    await assertCanDelegate(args);
    for (const change of [{ targetLevel: 1 }, { operation: 'edit', targetLevel: 1 }, { operation: 'edit', targetLevel: 2 }])
        await assert.rejects(() => assertCanDelegate({ ...args, ...change } as typeof args));
    await assert.rejects(() => assertCanDelegate({ ...args, proposed: [{ ...args.proposed[0]!, scope: { kind: 'all' } }] }), /scope/);
    await assert.rejects(() => assertCanDelegate({ ...args, proposed: [{ ...args.proposed[0]!, rawFields: ['phone'] }] }), /field/);
    await assert.rejects(() => assertCanDelegate({ ...args, proposed: [{ ...args.proposed[0]!, action: view }] }), /action/);
    a.provenance = 'recheck_required';
    await assert.rejects(() => assertCanDelegate(args));
    a.provenance = 'system_origin';
    a.policies[0]!.delegableActions = [];
    await assert.rejects(() => assertCanDelegate(args), /action/);
    a.policies[0]!.delegableActions = [edit];
    await assertCanDelegate({ ...args, targetLevel: 2 });
    a.level = 3;
    await assert.rejects(() => assertCanDelegate({ ...args, operation: 'edit' }), /level/);
    a.level = 1;
    await assertCanDelegate({ ...args, targetLevel: 2 });
    await assert.rejects(() => assertCanDelegate({ ...args, operation: 'edit', targetLevel: 1 }), /level/);
});
test('ambiguous duplicate source IDs fail closed in both candidates', async () => {
    const raw = membership('collision', { kind: 'ownDept' });
    raw.policies[0]!.rawFields = ['phone'];
    const broad = membership('collision', { kind: 'all' });
    await expectSources([raw, broad], learning('B'), []);
});
test('bulk query plan resolves once, preserves source-field pairs, rejects port binding mismatch', async () => {
    const { buildQueryPolicy } = await import('../src/authz/policy.js');
    const a = membership('raw', { kind: 'ownDept' });
    a.policies[0]!.rawFields = ['phone'];
    const grants = plan([a, membership('b', { kind: 'departments', departmentIds: ['D2'] })]);
    let calls = 0;
    const port = { resolveScopeMembers: async (specs: readonly ScopeSpec[], revision: number) => { calls++; assert.equal(revision, 7); return specs.map(s => resolveScope(s, org)); } };
    const p = await buildQueryPolicy({ context: ctx, nodes, grants, nodeId: 'personal-learning', action: view, organization: port });
    assert.equal(calls, 1);
    assert.deepEqual(p.sources.map(s => ({ source: s.sourceId, ids: s.resolved.personIds, fields: s.rawFields })), [
        { source: 'role:raw:personal-learning:' + view, ids: ['A', 'C'], fields: ['phone'] },
        { source: 'role:b:personal-learning:' + view, ids: ['B', 'E'], fields: [] }
    ]);
    assert.deepEqual(p.companyIds, ['CA', 'CB', 'I']);
    await assert.rejects(() => buildQueryPolicy({ context: ctx, nodes, grants, nodeId: 'personal-learning', action: view, organization: { resolveScopeMembers: async (specs) => specs.map(s => ({ ...resolveScope(s, org), spec: { ...s, revision: 8 } })) } }), /binding/);
});
test('appointment revocation/company/state and public custom replacement negatives', async () => {
    const ap = (id: string, active = true) => ({ id, personId: 'M', tenantId: 'T1', projectId: id, active });
    for (const engine of engines) {
        const req = { context: ctx, nodes, nodeId: 'project', action: 'training.project.view', resource: project('P'), organization: org };
        assert.deepEqual((await engine.match({ ...req, grants: plan([], ctx, [ap('P', false), ap('Q')]) })).sourceIds, []);
        assert.deepEqual((await engine.match({ ...req, resource: project('Q'), grants: plan([], ctx, [ap('P', false), ap('Q')]) })).sourceIds, ['appointment:Q:project:training.project.view']);
        const customer = { ...ctx, internal: false, companyId: 'CA', companyIds: ['CA', 'CB'] };
        assert.deepEqual((await engine.match({ ...req, context: customer, resource: project('P', 'CB'), grants: plan([], customer, [ap('P')]) })).sourceIds, []);
        assert.deepEqual((await engine.match({ ...req, action: 'training.project.update', affectedCompanyIds: ['CA', 'CB'], context: customer, grants: plan([], customer, [ap('P')]) })).sourceIds, []);
        assert.deepEqual((await engine.match({ ...req, resource: { ...project('P'), businessAllowed: false }, grants: plan([], ctx, [ap('P')]) })).sourceIds, []);
        const catalog = { id: 'cat', tenantId: 'T1', creatorId: 'N', grants: [{ id: 'public', action: 'knowledge.course.browse', subject: { type: 'public', id: 'T1' } }] };
        const base = { context: ctx, nodes, nodeId: 'course', action: 'knowledge.course.browse', resource: { ...project('C'), type: 'course' }, organization: org };
        const catInput = { context: ctx, nodes, nodeId: 'course', catalog, courseId: 'C', subjectResolvers: {} };
        assert.deepEqual((await engine.match({ ...base, grants: normalizeCatalog(catInput) })).sourceIds, ['catalog:public']);
        assert.deepEqual((await engine.match({ ...base, grants: normalizeCatalog({ ...catInput, customBrowse: [] }) })).sourceIds, []);
    }
});
test('each scope permits and rejects literal resources on each engine', async () => {
    for (const [scope, yes, no] of [
        [{ kind: 'all' }, 'A', null], [{ kind: 'ownDept' }, 'C', 'D'], [{ kind: 'ownDeptSubtree' }, 'D', 'B'],
        [{ kind: 'departments', departmentIds: ['D2'] }, 'B', 'A'], [{ kind: 'self' }, 'M', 'A']
    ] as [
        Scope,
        string,
        string | null
    ][]) {
        const m = membership('scope', scope);
        await expectSources([m], learning(yes), ['role:scope:personal-learning:' + view]);
        if (no)
            await expectSources([m], learning(no), []);
        await expectSources([m], { ...learning(yes), tenantId: 'T2' }, []);
    }
    const managed = membership('scope', { kind: 'managed' });
    managed.jurisdiction = { kind: 'departments', departmentIds: ['D2'] };
    await expectSources([managed], learning('E'), ['role:scope:personal-learning:' + view]);
    await expectSources([managed], learning('C'), []);
    delete managed.jurisdiction;
    await expectSources([managed], learning('E'), []);
    const missing = membership('scope', { kind: 'ownDeptSubtree' });
    await expectSources([missing], learning('A'), [], view, 'personal-learning', { ...ctx, departmentId: undefined });
});
test('delegation additionally requires role mutation action from selected membership', async () => {
 const a=membership('A',{kind:'ownDept'},edit);a.policies[0]!.delegableActions=[edit];
 await assert.rejects(()=>assertCanDelegate({context:ctx,nodes,memberships:[a],managementRoleMembershipId:'A',operation:'create',targetLevel:3,proposed:[],resolveObjects:async s=>({...s,objectIds:[]})}),/role mutation action/);
});
