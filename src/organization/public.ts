import type { OrganizationPublic, ScopeSpec, OrganizationSnapshot } from '../authz/contracts.js';
import { resolveScope } from '../authz/scope.js';
import { query, type DB } from '../infrastructure/db.js';
export class OrganizationPort implements OrganizationPublic {
    constructor(private db: DB) { }
    async resolveScopeMembers(specs: readonly ScopeSpec[], revision: number) {
        const tenant = specs[0]?.tenantId;
        if (!tenant)
            return [];
        const org: OrganizationSnapshot = { tenantId: tenant, revision, departments: [], people: [] };
        if (specs.some(s => !['all', 'self'].includes(s.scope.kind) || s.managerId)) {
            org.departments = (await query(this.db, 'select id,parent_id as "parentId" from organization.department where tenant_id=$1', [tenant])).rows;
            // Resolve department semantics centrally using one representative per department,
            // then fetch only the relevant people once. ALL/SELF never enumerate all people.
            const representatives = { ...org, people: org.departments.map(d => ({ id: d.id, departmentId: d.id })) };
            const departments = [...new Set(specs.filter(s => !['all', 'self'].includes(s.scope.kind) && !s.managerId).flatMap(s => resolveScope(s, representatives).personIds))];
            const managers = [...new Set(specs.flatMap(s => s.managerId ? [s.managerId] : []))];
            org.people = (await query(this.db, 'select id,department_id as "departmentId",manager_id as "managerId" from organization.person where tenant_id=$1 AND (department_id=ANY($2::text[]) OR manager_id=ANY($3::text[]))', [tenant, departments, managers])).rows;
        }
        return specs.map(spec => resolveScope(spec, org));
    }
}
