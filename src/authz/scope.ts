import type { Context, NodeDefinition, OrganizationSnapshot, Resource, ResolvedScope, Scope, ScopeSpec } from './contracts.js';
export function companyCap(context: Context): string[] { return [...new Set(context.internal ? [context.companyId, ...context.companyIds] : [context.companyId])].sort(); }
export function makeScope(context: Context, node: NodeDefinition, action: string, scope: Scope, jurisdiction?: Scope): ScopeSpec | null {
    if (!node.actions.includes(action) || !node.scopes.includes(scope.kind))
        return null;
    if (scope.kind === 'self' && !node.selfAnchor)
        return null;
    if (['ownDept', 'ownDeptSubtree', 'departments', 'managed'].includes(scope.kind) && !node.departmentAnchor)
        return null;
    const effective = scope.kind === 'managed' ? (jurisdiction?.kind === 'departments' ? jurisdiction : { kind: 'departments' as const, departmentIds: [] }) : scope;
    return { tenantId: context.tenantId, actorId: context.personId, revision: context.revision, nodeId: node.id, action, resourceType: node.resourceType, scope: structuredClone(effective), departmentId: context.departmentId, anchor: node.selfAnchor, departmentAnchor: node.departmentAnchor, companyIds: companyCap(context), companyMode: node.companyMode };
}
function validate(spec: ScopeSpec, org: OrganizationSnapshot) {
    if (spec.tenantId !== org.tenantId)
        throw new Error('scope tenant mismatch');
    if (spec.revision !== org.revision)
        throw new Error('scope revision mismatch');
}
/** Pure reference implementation of the public organization port; no private table access. */
export function resolveScope(spec: ScopeSpec, org: OrganizationSnapshot): ResolvedScope {
    validate(spec, org);
    const base: ResolvedScope = { spec, all: false, personIds: [], objectIds: spec.objectIds };
    if (spec.managerId)
        return { ...base, personIds: org.people.filter(p => p.managerId === spec.managerId).map(p => p.id).sort() };
    if (spec.scope.kind === 'all')
        return { ...base, all: true };
    if (spec.scope.kind === 'self')
        return spec.anchor === 'personId' ? { ...base, personIds: [spec.actorId] } : { ...base, anchor: spec.anchor, anchorIds: [spec.actorId] };
    let roots: string[] = [];
    let descendants = false;
    if (spec.scope.kind === 'ownDept' || spec.scope.kind === 'ownDeptSubtree') {
        roots = spec.departmentId ? [spec.departmentId] : [];
        descendants = spec.scope.kind === 'ownDeptSubtree';
    }
    if (spec.scope.kind === 'departments') {
        roots = spec.scope.departmentIds;
        descendants = spec.scope.includeDescendants === true;
    }
    const known = new Set(org.departments.map(d => d.id));
    const allowed = new Set(roots.filter(id => known.has(id)));
    if (descendants) {
        // Fail closed for malformed graph, cycles or depth > 20, even if a root would otherwise match.
        const parents = new Map(org.departments.map(d => [d.id, d.parentId]));
        for (const d of org.departments) {
            let cursor: string | undefined = d.id;
            const seen = new Set<string>();
            while (cursor) {
                if (seen.has(cursor) || seen.size >= 20 || !known.has(cursor))
                    throw new Error('invalid department hierarchy');
                seen.add(cursor);
                cursor = parents.get(cursor);
            }
        }
        for (let depth = 0; depth < 20; depth++) {
            let added = false;
            for (const d of org.departments)
                if (d.parentId && allowed.has(d.parentId) && !allowed.has(d.id)) {
                    allowed.add(d.id);
                    added = true;
                }
            if (!added)
                break;
        }
    }
    return { ...base, personIds: org.people.filter(p => p.departmentId && allowed.has(p.departmentId)).map(p => p.id).sort() };
}
export function teamMembers(context: Context, org: OrganizationSnapshot): string[] {
    validate({ tenantId: context.tenantId, revision: context.revision } as ScopeSpec, org);
    return org.people.filter(p => p.managerId === context.personId).map(p => p.id).sort();
}
export function scopeMatches(scope: ResolvedScope, resource: Resource): boolean {
    const spec = scope.spec;
    if (resource.tenantId !== spec.tenantId || resource.type !== spec.resourceType)
        return false;
    if (scope.objectIds && !scope.objectIds.includes(resource.id))
        return false;
    if (scope.all)
        return true;
    if (scope.anchor)
        return scope.anchorIds?.includes(resource[scope.anchor] ?? '') ?? false;
    return scope.personIds.includes(resource.personId ?? '');
}
