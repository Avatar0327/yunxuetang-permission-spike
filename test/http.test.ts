import test from 'node:test';
import assert from 'node:assert/strict';
const base = process.env.API_A ?? 'http://127.0.0.1:4311';
async function req(path: string, actor = 'L', body?: unknown) { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer spike-' + actor, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() as any }; }
test('real HTTP appointments derive backend then revoke last; direct object denied', async () => {
    assert.equal((await req('/auth/me')).body.capabilities.backend, false);
    assert.equal((await req('/projects/P')).status, 403);
    assert.equal((await req('/appointments', 'Z', { personId: 'L', projectId: 'P', active: true })).status, 200);
    assert.deepEqual((await req('/auth/me')).body.capabilities, { backend: true, nodes: ['project'] });
    assert.equal((await req('/projects/P')).status, 200);
    assert.equal((await req('/projects/Q')).status, 403);
    assert.equal((await req('/appointments', 'Z', { personId: 'L', projectId: 'P', active: false })).status, 200);
    assert.equal((await req('/auth/me')).body.capabilities.backend, false);
    assert.equal((await req('/projects/P/media/1')).status, 403);
});
test('real HTTP frozen export denied after source revoke and auth headers cannot spoof identity', async () => {
    const result = await req('/exports', 'M', { fixture: true });
    assert.equal(result.status, 200);
    assert.equal((await req('/exports/' + result.body.id + '/execute', 'M', {})).status, 200);
    assert.equal((await req('/memberships/m-broad/revoke', 'Z', {})).status, 200);
    assert.equal((await req('/exports/' + result.body.id + '/claim', 'M')).status, 403);
    assert.equal((await req('/report?tenantId=T2&personId=Z', 'L')).status, 403);
});
