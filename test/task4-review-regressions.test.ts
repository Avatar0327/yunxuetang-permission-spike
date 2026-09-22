import test from 'node:test';
import { pool } from '../src/infrastructure/db.js';
import { start, observe, policy } from './task3-helper.js';
import type { Membership } from '../src/authz/contracts.js';

async function insert(m: Membership, sourceId?: string) {
    await pool.query('INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data,source_id) VALUES($1,$2,$3,$4,$5,$6)', [m.tenantId, m.id, m.personId, m.roleId, m, sourceId ?? null]);
}
function membership(id: string, personId: string, roleId: string, policies: Membership['policies']): Membership {
    return { id, tenantId: 'T1', personId, roleId, level: 3, active: true, provenance: 'system_origin', policies };
}
function cap(m: Membership, nodeId: string, action: string, objectIds: string[]) {
    m.provenance = 'active';
    m.delegation = { sourceMembershipId: 'admin', sourceActorId: 'Z', revision: 1, caps: [{ nodeId, action, objectIds, rawFields: [] }] };
    return m;
}

for (const candidate of ['native', 'casbin']) {
    test(`${candidate}: R1 membership revoke retains target-person cap`, async t => {
        const api = await start(candidate), id = 't4-r1-' + candidate;
        const ids = ['actor', 'B', 'C', 'B-child', 'C-child'].map(s => id + '-' + s);
        try {
            const action = 'authz.membership.revoke';
            await insert(cap(membership(ids[0]!, 'M', 'role-11', [policy('administration', [action])]), 'administration', action, ['B']), 'admin');
            await insert(membership(ids[1]!, 'B', 'role-12', []));
            await insert(membership(ids[2]!, 'C', 'role-12', []));
            await insert({ ...membership(ids[3]!, 'A', 'role-12', []), provenance: 'active' }, ids[1]);
            await insert({ ...membership(ids[4]!, 'E', 'role-12', []), provenance: 'active' }, ids[2]);
            const states = async (which: string[]) => (await pool.query("SELECT id,data->>'active' active,data->>'provenance' provenance FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[]) ORDER BY id", [which])).rows;
            const before = (await pool.query("SELECT data,source_id FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[]) ORDER BY id", [[ids[2], ids[4]]])).rows;
            const denied = await api.request('POST', '/memberships/' + ids[2] + '/revoke', {}, 'M');
            await t.test('denies C', async () => observe(candidate, 'R1 B-only revoke cannot borrow broad report scope for C', 403, denied.status));
            await t.test('no target/dependent writes', async () => {
                const after = (await pool.query("SELECT data,source_id FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[]) ORDER BY id", [[ids[2], ids[4]]])).rows;
                await observe(candidate, 'R1 denied target and dependent byte-equivalent state', before, after);
                await observe(candidate, 'R1 denied target and dependent literal lifecycle', [
                    { id: ids[2], active: 'true', provenance: 'system_origin' },
                    { id: ids[4], active: 'true', provenance: 'active' }
                ], await states([ids[2]!, ids[4]!]));
            });
            await t.test('permits B', async () => {
                const allowed = await api.request('POST', '/memberships/' + ids[1] + '/revoke', {}, 'M');
                await observe(candidate, 'R1 B-only revoke permits B', 200, allowed.status);
                await observe(candidate, 'R1 allowed target revoked and dependent frozen', [
                    { id: ids[1], active: 'false', provenance: 'system_origin' },
                    { id: ids[3], active: 'true', provenance: 'recheck_required' }
                ], await states([ids[1]!, ids[3]!]));
            });
        } finally {
            await api.close();
            await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[])", [[ids[3], ids[4]]]);
            await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[])", [ids]);
        }
    });

    test(`${candidate}: R2 attachment uses project-specific download action`, async t => {
        const a = await start(candidate, 4311), b = await start(candidate, 4312), id = 't4-r2-' + candidate;
        const viewId = id + '-view', downloadId = id + '-download';
        const download = cap(membership(downloadId, 'M', 'role-14', [policy('project', ['training.project.download'])]), 'project', 'training.project.download', ['Q']);
        const attachment = () => b.request('GET', '/projects/P/people/A/attachment', undefined, 'M');
        try {
            await insert(cap(membership(viewId, 'M', 'role-13', [policy('project', ['training.project.view'])]), 'project', 'training.project.view', ['P', 'Q']), 'admin');
            await t.test('view remains progress only', async () => {
                const progress = await b.request('GET', '/projects/P/people/A/progress', undefined, 'M');
                await observe(candidate, 'R2 view-only progress preserved', { status: 200, progress: 50 }, { status: progress.status, progress: progress.body.progress });
                const response = await attachment();
                await observe(candidate, 'R2 view-only attachment denies without bytes', { status: 403, bytes: null }, { status: response.status, bytes: response.body.bytes ?? null });
            });
            await insert(download, 'admin');
            await t.test('other project download cannot join broader view', async () => {
                const response = await attachment();
                await observe(candidate, 'R2 download Q cannot borrow view P', { status: 403, bytes: null }, { status: response.status, bytes: response.body.bytes ?? null });
            });
            download.delegation!.caps[0]!.objectIds = ['P'];
            await pool.query("UPDATE authz.membership SET data=$2 WHERE tenant_id='T1' AND id=$1", [downloadId, download]);
            await t.test('matching download permits bytes', async () => {
                const response = await attachment();
                await observe(candidate, 'R2 matching P download returns protected bytes', { status: 200, bytes: 'attachment-A' }, { status: response.status, bytes: response.body.bytes ?? null });
            });
            await t.test('download-only revoke applies next new request', async () => {
                const revoke = await a.request('POST', '/memberships/' + downloadId + '/revoke', {});
                await observe(candidate, 'R2 download membership revoke committed', 200, revoke.status);
                const response = await attachment();
                await observe(candidate, 'R2 next B attachment denies revoked download', { status: 403, bytes: null, afterCommit: true, pubsub: false }, { status: response.status, bytes: response.body.bytes ?? null, afterCommit: response.body.meta.requestAt >= revoke.body.meta.responseAt, pubsub: response.body.meta.pubsub });
                const progress = await b.request('GET', '/projects/P/people/A/progress', undefined, 'M');
                await observe(candidate, 'R2 download revoke retains independent view progress', { status: 200, progress: 50 }, { status: progress.status, progress: progress.body.progress });
            });
        } finally {
            await b.close();
            await a.close();
            await pool.query("DELETE FROM authz.membership WHERE tenant_id='T1' AND id=ANY($1::text[])", [[viewId, downloadId]]);
        }
    });
}
test.after(() => pool.end());
