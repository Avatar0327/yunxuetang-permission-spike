import type { Appointment, AppointmentCapability, Catalog, CatalogGrant, Context, EffectiveGrant, Membership, NodeDefinition, Resource, Subject, SubjectResolvers } from './contracts.js';
import { companyCap, makeScope } from './scope.js';
export function validContext(context: Context): boolean { return context.authenticated && context.enabled && !context.deleted && Number.isSafeInteger(context.revision) && context.revision >= 0; }
export function activeMembership(membership: Membership, context: Context): boolean { return membership.active && membership.tenantId === context.tenantId && membership.personId === context.personId && ['system_origin', 'active'].includes(membership.provenance); }
export function subjectMatches(subject: Subject, context: Context, resolvers: SubjectResolvers): boolean {
    if (!validContext(context))
        return false;
    if (subject.type === 'public')
        return subject.id === context.tenantId;
    if (subject.type === 'user')
        return subject.id === context.personId;
    const resolver = Object.prototype.hasOwnProperty.call(resolvers, subject.type) ? resolvers[subject.type] : undefined;
    if (!resolver)
        return false;
    try {
        return resolver(subject, context) === true;
    }
    catch {
        return false;
    }
}
export interface NormalizeInput {
    context: Context;
    nodes: readonly NodeDefinition[];
    memberships: readonly Membership[];
    appointments?: readonly Appointment[];
    appointmentCapabilities?: readonly AppointmentCapability[];
    subjectResolvers?: SubjectResolvers;
}
export function normalizePolicy(input: NormalizeInput): EffectiveGrant[] {
    const { context, nodes } = input;
    if (!validContext(context))
        return [];
    const output: EffectiveGrant[] = [];
    for (const m of input.memberships) {
        if (!activeMembership(m, context) || (m.subject && !subjectMatches(m.subject, context, input.subjectResolvers ?? {})))
            continue;
        for (const p of m.policies) {
            const node = nodes.find(n => n.id === p.nodeId);
            if (!node || !p.navigation)
                continue;
            const overrides = m.overrides?.filter(o => o.membershipId === m.id && o.nodeId === node.id) ?? [];
            if (overrides.length > 1)
                continue;
            const scope = overrides.length ? overrides[0]!.scope : p.scope;
            if (!scope)
                continue;
            for (const action of p.actions) {
                const spec = makeScope(context, node, action, scope, m.jurisdiction);
                if (!spec)
                    continue;
                output.push({ sourceId: `role:${m.id}:${node.id}:${action}`, sourceKind: 'role', membershipId: m.id, tenantId: context.tenantId, actorId: context.personId, revision: context.revision, nodeId: node.id, action, rawFields: p.rawFields.filter(f => node.rawFields.includes(f)), delegable: p.delegableActions.includes(action), scope: spec });
            }
        }
    }
    for (const a of input.appointments ?? []) {
        if (!a.active || a.tenantId !== context.tenantId || a.personId !== context.personId)
            continue;
        for (const cap of input.appointmentCapabilities ?? []) {
            const node = nodes.find(n => n.id === cap.nodeId);
            if (!node || node.resourceType !== 'project')
                continue;
            for (const action of cap.actions) {
                const spec = makeScope(context, node, action, { kind: 'all' });
                if (!spec)
                    continue;
                output.push({ sourceId: `appointment:${a.id}:${node.id}:${action}`, sourceKind: 'appointment', tenantId: context.tenantId, actorId: context.personId, revision: context.revision, nodeId: node.id, action, rawFields: [], delegable: false, scope: { ...spec, objectIds: [a.projectId] } });
            }
        }
    }
    return new Set(output.map(g => g.sourceId)).size === output.length ? output : [];
}
export function hardAllowed(context: Context, node: NodeDefinition | undefined, resource: Resource, affectedCompanyIds?: readonly string[], action?: string): boolean {
    if (!validContext(context) || !node || resource.tenantId !== context.tenantId || resource.type !== node.resourceType || !resource.exists || !resource.enabled || resource.deleted || resource.businessAllowed === false)
        return false;
    if (action && (!node.actions.includes(action) || (node.publishedActions?.includes(action) && resource.published !== true)))
        return false;
    const cap = companyCap(context);
    if (affectedCompanyIds && !affectedCompanyIds.every(id => cap.includes(id)))
        return false;
    if (node.companyMode === 'ownWallet')
        return resource.personId === context.personId
            && typeof resource.dataCompanyId === 'string' && resource.dataCompanyId.trim().length > 0
            && resource.crossCompanyReference === false;
    if (node.companyMode === 'content')
        return true;
    const company = resource[node.companyMode];
    return company !== undefined && cap.includes(company);
}
export function backendCapabilities(grants: readonly EffectiveGrant[], nodes: readonly NodeDefinition[]): {
    backend: boolean;
    nodes: string[];
} {
    const ids = [...new Set(grants.filter(g => nodes.some(n => n.id === g.nodeId && n.backend)).map(g => g.nodeId))].sort();
    return { backend: ids.length > 0, nodes: ids };
}
export interface NormalizeCatalogInput {
    context: Context;
    nodes: readonly NodeDefinition[];
    nodeId: string;
    catalog: Catalog;
    courseId: string;
    customBrowse?: readonly CatalogGrant[];
    subjectResolvers: SubjectResolvers;
}
export function normalizeCatalog(input: NormalizeCatalogInput): EffectiveGrant[] {
    const { context, catalog } = input;
    if (!validContext(context) || context.tenantId !== catalog.tenantId)
        return [];
    if (input.customBrowse !== undefined && catalog.lockedBy)
        throw new Error('catalog locked by ancestor');
    const node = input.nodes.find(n => n.id === input.nodeId);
    if (!node)
        return [];
    const browse = 'knowledge.course.browse';
    const grants = input.customBrowse === undefined ? catalog.grants : [...catalog.grants.filter(g => g.action !== browse), ...input.customBrowse.filter(g => g.action === browse)];
    const output: EffectiveGrant[] = [];
    for (const g of grants) {
        const matches = g.subject.type === 'catalog_creator' ? g.subject.id === catalog.id && catalog.creatorId === context.personId : subjectMatches(g.subject, context, input.subjectResolvers);
        if (!matches)
            continue;
        const scope = makeScope(context, node, g.action, { kind: 'all' });
        if (!scope)
            continue;
        output.push({ sourceId: `catalog:${g.id}`, sourceKind: 'catalog', tenantId: context.tenantId, actorId: context.personId, revision: context.revision, nodeId: node.id, action: g.action, rawFields: [], delegable: false, scope: { ...scope, objectIds: [input.courseId] } });
    }
    return new Set(output.map(g => g.sourceId)).size === output.length ? output : [];
}
/** Select one node/action before a single bulk organization call. No SQL or row enforcement. */
export interface QueryInput {
    context: Context;
    nodes: readonly NodeDefinition[];
    grants: readonly EffectiveGrant[];
    nodeId: string;
    action: string;
    organization: import('./contracts.js').OrganizationPublic;
}
export async function buildQueryPolicy(input: QueryInput): Promise<import('./contracts.js').QueryPolicy> {
    const { isDeepStrictEqual } = await import('node:util');
    const { context } = input, node = input.nodes.find(n => n.id === input.nodeId);
    if (!validContext(context) || !node || !node.actions.includes(input.action))
        throw new Error('invalid query context/node/action');
    const selected = input.grants.filter(g => g.nodeId === node.id && g.action === input.action);
    if (new Set(selected.map(g => g.sourceId)).size !== selected.length)
        throw new Error('ambiguous source binding');
    for (const g of selected) {
        const s = g.scope;
        if (g.tenantId !== context.tenantId || g.actorId !== context.personId || g.revision !== context.revision || s.tenantId !== g.tenantId || s.actorId !== g.actorId || s.revision !== g.revision || s.nodeId !== g.nodeId || s.action !== g.action || s.resourceType !== node.resourceType || s.companyMode !== node.companyMode || !isDeepStrictEqual(s.companyIds, companyCap(context)))
            throw new Error('grant binding mismatch');
    }
    const resolved = selected.length ? await input.organization.resolveScopeMembers(selected.map(g => g.scope), context.revision) : [];
    if (resolved.length !== selected.length)
        throw new Error('resolution binding count mismatch');
    for (const [i, r] of resolved.entries())
        if (!isDeepStrictEqual(r.spec, selected[i]!.scope))
            throw new Error('resolution binding mismatch');
    return { tenantId: context.tenantId, actorId: context.personId, revision: context.revision, nodeId: node.id, action: input.action, resourceType: node.resourceType, companyIds: companyCap(context), companyMode: node.companyMode, requirePublished: node.publishedActions?.includes(input.action) ?? false, sources: selected.map((g, i) => ({ sourceId: g.sourceId, rawFields: g.rawFields, resolved: resolved[i]! })) };
}
