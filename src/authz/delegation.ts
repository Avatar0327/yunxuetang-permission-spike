import type { Context, Membership, NodeDefinition, ObjectSet, ProposedGrant, ScopeSpec, Scope, DelegationCap } from './contracts.js';
import { activeMembership, normalizePolicy, validContext } from './policy.js';
import { makeScope } from './scope.js';
export interface DelegateInput {
    context: Context;
    nodes: readonly NodeDefinition[];
    memberships: readonly Membership[];
    managementRoleMembershipId: string;
    operation: 'create' | 'edit';
    targetLevel: 1 | 2 | 3;
    proposed: readonly ProposedGrant[];
    resolveObjects: (spec: ScopeSpec) => Promise<ObjectSet>;
}
function checkBound(set: ObjectSet, spec: ScopeSpec) { if (set.tenantId !== spec.tenantId || set.actorId !== spec.actorId || set.revision !== spec.revision || set.nodeId !== spec.nodeId || set.action !== spec.action || set.dimension !== spec.capDimension)
    throw new Error('delegation resolution binding mismatch'); }
/** Role mutation and capability checks only; recipients are resolved separately. */
export function assertRoleDelegateCapabilities(input: Omit<DelegateInput, 'resolveObjects'>): void {
    const m = input.memberships.find(m => m.id === input.managementRoleMembershipId);
    if (!validContext(input.context) || !m || !activeMembership(m, input.context))
        throw new Error('inactive management membership');
    if (![2, 3].includes(input.targetLevel) || !['create', 'edit'].includes(input.operation) || (input.operation === 'edit' && input.targetLevel <= m.level))
        throw new Error('role level forbidden');
    const normalized = normalizePolicy({ context: input.context, nodes: input.nodes, memberships: [m] });
    const mutationAction = input.operation === 'create' ? 'authz.role.create' : 'authz.role.update';
    if (!normalized.some(g => g.nodeId === 'role-management' && g.action === mutationAction && g.scope.scope.kind === 'all'))
        throw new Error('role mutation action not allowed in selected membership');
    grantCapabilities(input);
}
export async function assertCanDelegate(input: DelegateInput): Promise<void> {
    assertRoleDelegateCapabilities(input);
    await assertGrantSubset(input);
}

/** Capability subset check reused by non-role grants; caller checks its own mutation action and locks. */
export type GrantSubsetInput = Omit<DelegateInput, 'operation' | 'targetLevel'> & {
    proposalContext?: Context;
    proposalJurisdiction?: Scope;
};
/** Validate capabilities without resolving relative scopes against the grantor. */
function grantCapabilities(input: Omit<GrantSubsetInput, 'resolveObjects'>) {
    const m = input.memberships.find(m => m.id === input.managementRoleMembershipId);
    if (!validContext(input.context) || !m || !activeMembership(m, input.context))
        throw new Error('inactive management membership');
    const grants = normalizePolicy({ context: input.context, nodes: input.nodes, memberships: [m] }).filter(g => g.delegable);
    const target = input.proposalContext ?? input.context;
    if (!validContext(target) || target.tenantId !== input.context.tenantId || target.revision !== input.context.revision)
        throw new Error('proposal context binding mismatch');
    return input.proposed.map(p => {
        const node = input.nodes.find(n => n.id === p.nodeId);
        if (!node)
            throw new Error('unknown node');
        const scope = makeScope(target, node, p.action, p.scope, input.proposalContext ? input.proposalJurisdiction : m.jurisdiction);
        if (!scope)
            throw new Error('unsupported scope/action');
        const candidates = grants.filter(g => g.nodeId === p.nodeId && g.action === p.action);
        if (!candidates.length)
            throw new Error('action not delegable');
        // Empty object sets still require a registered, explicitly delegable action and fields.
        if (!p.rawFields.every(f => node.rawFields.includes(f) && candidates.some(g => g.rawFields.includes(f))))
            throw new Error('field not delegable');
        if (p.objectIds !== undefined) scope.objectIds = [...p.objectIds];
        return { p, scope, candidates };
    });
}
/** Return the exact validated proposal caps, never the broader source caps. */
export async function assertGrantSubset(input: GrantSubsetInput): Promise<DelegationCap[]> {
    const result: DelegationCap[] = [];
    for (const { p, scope, candidates } of grantCapabilities(input)) {
        const proposed = await input.resolveObjects(scope);
        checkBound(proposed, scope);
        const coverage = new Map<string, Set<string>>();
        for (const g of candidates) {
            const cap = await input.resolveObjects(g.scope);
            checkBound(cap, g.scope);
            for (const id of cap.objectIds) {
                const fields = coverage.get(id) ?? new Set<string>();
                for (const f of g.rawFields)
                    fields.add(f);
                coverage.set(id, fields);
            }
        }
        for (const id of proposed.objectIds) {
            if (!coverage.has(id))
                throw new Error('scope exceeds selected membership');
            if (!p.rawFields.every(f => coverage.get(id)!.has(f)))
                throw new Error('field exceeds selected membership');
        }
        result.push({...(proposed.dimension?{dimension:proposed.dimension}:{}),nodeId:p.nodeId, action:p.action, objectIds:proposed.objectIds, rawFields:p.rawFields});
    }
    return result;
}
