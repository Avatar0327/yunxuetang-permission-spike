import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { pool, Unavailable, Denied } from '../src/infrastructure/db.js';
import { SessionCache } from '../src/authz/cache.js';
import { Authority } from '../src/authz/revision.js';
import { TrainingService } from '../src/training/service.js';
async function waiting(fragment: string) { for (let i = 0; i < 100; i++) {
    const r = await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query ILIKE $1", ['%' + fragment + '%']);
    if (r.rows[0].n > 0)
        return;
    await new Promise(r => setTimeout(r, 20));
} throw Error('expected real DB lock wait did not occur'); }
async function record(name: string, details: any) { await appendFile(process.env.RACE_EVIDENCE ?? 'evidence/raw/task2-races.jsonl', JSON.stringify({ name, at: new Date().toISOString(), ...details }) + '\n'); }
for (const candidate of ['native', 'casbin'] as const) {
    test(`${candidate}: snapshot build crossing revoke rejects stale version`, async () => {
        const cache = new SessionCache(), authority = new Authority(cache), blocker = await pool.connect();
        const original = (await pool.query("SELECT data FROM authz.membership WHERE tenant_id='T1' AND id='m-broad'")).rows[0].data;
        try {
            await blocker.query('BEGIN');
            await blocker.query('LOCK TABLE authz.membership IN ACCESS EXCLUSIVE MODE');
            const started = new Date().toISOString();
            const result = authority.plan({ tenantId: 'T1', personId: 'M' }, candidate, 'personal-learning', 'report.personal-learning.view', pool, false, true).then(() => ({ allowed: true, error: null }), e => ({ allowed: false, error: e }));
            await waiting('FROM authz.membership m JOIN authz.role');
            await blocker.query("UPDATE authz.membership SET data=jsonb_set(data,'{active}','false') WHERE tenant_id='T1' AND id='m-broad'");
            await blocker.query('COMMIT');
            const committedAt = new Date().toISOString();
            const actual = await result;
            assert.equal(actual.allowed, false);
            assert.ok(actual.error instanceof Unavailable);
            await record('snapshot-build-revoke', { candidate, started, committedAt, actualStatus: actual.error.status, expectedStatus: 503 });
        }
        finally {
            await blocker.query('ROLLBACK');
            blocker.release();
            await pool.query("UPDATE authz.membership SET data=$1 WHERE tenant_id='T1' AND id='m-broad'", [original]);
            await cache.close();
        }
    });
    test(`${candidate}: write before revoke commits; revoke before next write denies`, async () => {
        const cache = new SessionCache(), authority = new Authority(cache), training = new TrainingService(authority), blocker = await pool.connect();
        await training.appoint({ tenantId: 'T1', personId: 'Z' }, candidate, 'L', 'Q', true);
        try {
            await blocker.query('BEGIN');
            await blocker.query("SELECT id FROM training.project WHERE tenant_id='T1' AND id='Q' FOR UPDATE");
            const startedAt = new Date().toISOString();
            const saving = training.save({ tenantId: 'T1', personId: 'L' }, candidate, 'Q', { title: 'lawful-before-revoke' }).then(r => ({ result: r, doneAt: new Date().toISOString() }));
            await waiting('UPDATE training.project SET title');
            const revoking = training.appoint({ tenantId: 'T1', personId: 'Z' }, candidate, 'L', 'Q', false).then(r => ({ result: r, doneAt: new Date().toISOString() }));
            await waiting('FOR UPDATE OF r');
            await blocker.query('COMMIT');
            const saved = await saving, revoked = await revoking;
            assert.equal(saved.result.saved, true);
            assert.equal(revoked.result.active, false);
            await assert.rejects(training.save({ tenantId: 'T1', personId: 'L' }, candidate, 'Q', { title: 'must-not-save' }), Denied);
            const title = (await pool.query("SELECT title FROM training.project WHERE tenant_id='T1' AND id='Q'")).rows[0].title;
            assert.equal(title, 'lawful-before-revoke');
            await record('write-revoke-order', { candidate, startedAt, saved, revoked, title, expectedTitle: 'lawful-before-revoke', afterRevokeStatus: 403 });
        }
        finally {
            await blocker.query('ROLLBACK');
            blocker.release();
            await pool.query("UPDATE training.project SET title='项目 Q' WHERE tenant_id='T1' AND id='Q'");
            await cache.close();
        }
    });
}
test.after(async () => pool.end());
