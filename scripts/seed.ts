import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool, transaction } from '../src/infrastructure/db.js';
import { nodes } from '../src/authz/registry.js';
import type { Membership, NodePolicy, Scope } from '../src/authz/contracts.js';
const policy = (nodeId: string, scope: Scope, rawFields: string[] = [], actions?: string[]): NodePolicy => ({ nodeId, navigation: true, scope, rawFields, actions: actions ?? nodes.find(n => n.id === nodeId)!.actions, delegableActions: [] });
try {
    await transaction(async (db) => {
        await db.query('DROP SCHEMA IF EXISTS account,report,training,knowledge,authz,organization CASCADE');
        await db.query(await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
        await db.query(await readFile(new URL('../sql/seed.sql', import.meta.url), 'utf8'));
        const memberships: Membership[] = [
            { id: 'm-broad', tenantId: 'T1', personId: 'M', roleId: 'role-1', level: 2, active: true, provenance: 'system_origin', policies: [policy('personal-learning', { kind: 'all' }, [], ['report.personal-learning.view', 'report.personal-learning.export']), policy('history', { kind: 'all' })] },
            { id: 'm-dept', tenantId: 'T1', personId: 'M', roleId: 'role-2', level: 2, active: true, provenance: 'system_origin', policies: [policy('personal-learning', { kind: 'ownDept' }, ['phone', 'email', 'id_card']), policy('department-report', { kind: 'ownDept' }, ['phone', 'email', 'id_card'])] },
            { id: 'x-self', tenantId: 'T1', personId: 'X', roleId: 'role-3', level: 3, active: true, provenance: 'system_origin', policies: [policy('history', { kind: 'self' }),policy('own-account',{kind:'self'}),policy('account',{kind:'self'},[],['account.entry.view','account.entry.source','account.entry.export'])] },
            { id: 'admin', tenantId: 'T1', personId: 'Z', roleId: 'role-4', level: 1, active: true, provenance: 'system_origin', policies: nodes.map(n => policy(n.id, { kind: 'all' }, n.rawFields)) }
        ];
        for (const m of memberships)
            await db.query('INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data) VALUES($1,$2,$3,$4,$5)', [m.tenantId, m.id, m.personId, m.roleId, m]);
        for (const id of ['M', 'X', 'Y', 'L', 'Z', 'disabled', 'deleted'])
            await db.query('INSERT INTO authz.session VALUES($1,$2,$3)', [createHash('sha256').update('spike-' + id).digest('hex'), 'T1', id]);
        await db.query('UPDATE authz.revision SET revision=$1', [Date.now()]);
        for (const table of ['organization.person', 'organization.department', 'authz.company_grant', 'authz.membership', 'training.appointment', 'training.project', 'training.roster', 'knowledge.category', 'authz.role', 'knowledge.course', 'knowledge.classroom_member', 'training.face_to_face'])
            await db.query(`CREATE TRIGGER revision AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION authz.bump()`);
    });
    await pool.query('ANALYZE');
    console.log('seed committed: T1=50000, T2=500, departments=2000, facts=1000000 + 2 fixture facts');
}
finally {
    await pool.end();
}
