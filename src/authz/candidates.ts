import { newEnforcer, newModel } from 'casbin';
import type { Candidate, EffectiveGrant, MatchInput, MatchResult } from './contracts.js';
import { hardAllowed } from './policy.js';
import { resolveScope, scopeMatches } from './scope.js';
function result(input: MatchInput, grants: readonly EffectiveGrant[]): MatchResult {
    return { allowed: grants.length > 0, sourceIds: [...new Set(grants.map(g => g.sourceId))].sort(), rawFields: [...new Set(grants.flatMap(g => g.rawFields))].sort(), revision: input.context.revision };
}
function validGrant(g: EffectiveGrant, input: MatchInput): boolean {
    const c = input.context, s = g.scope;
    return g.tenantId === c.tenantId && g.actorId === c.personId && g.revision === c.revision && s.tenantId === c.tenantId && s.actorId === c.personId && s.revision === c.revision && s.nodeId === g.nodeId && s.action === g.action;
}
export class NativeCandidate implements Candidate {
    readonly name = 'native';
    async match(input: MatchInput): Promise<MatchResult> {
        const node = input.nodes.find(n => n.id === input.nodeId);
        if (!hardAllowed(input.context, node, input.resource, input.affectedCompanyIds, input.action))
            return result(input, []);
        try {
            return result(input, input.grants.filter(g => validGrant(g, input) && g.nodeId === input.nodeId && g.action === input.action && scopeMatches(resolveScope(g.scope, input.organization), input.resource)));
        }
        catch {
            return result(input, []);
        }
    }
}
/** The request's source selector lets each enforce collect an independent policy source.
 * This is a semantic candidate benchmark, never the list-query execution strategy. */
export const CASBIN_MODEL = `
[request_definition]
r = tenant, actor, node, action, revision, source, object
[policy_definition]
p = tenant, actor, node, action, revision, source
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = r.tenant == p.tenant && r.actor == p.actor && r.node == p.node && r.action == p.action && r.revision == p.revision && r.source == p.source && scopeForSource(p.source, r.object)
`;
export class CasbinCandidate implements Candidate {
    readonly name = 'casbin';
    async match(input: MatchInput): Promise<MatchResult> {
        const node = input.nodes.find(n => n.id === input.nodeId);
        if (!hardAllowed(input.context, node, input.resource, input.affectedCompanyIds, input.action))
            return result(input, []);
        try {
            const enforcer = await newEnforcer(newModel(CASBIN_MODEL));
            const sourceMap = new Map<string, EffectiveGrant>();
            for (const g of input.grants) {
                if (!validGrant(g, input))
                    continue;
                sourceMap.set(g.sourceId, g);
                await enforcer.addPolicy(g.tenantId, g.actorId, g.nodeId, g.action, String(g.revision), g.sourceId);
            }
            enforcer.addFunction('scopeForSource', (source, object) => { const g = sourceMap.get(String(source)); return !!g && scopeMatches(resolveScope(g.scope, input.organization), object as MatchInput['resource']); });
            const matched: EffectiveGrant[] = [];
            for (const g of sourceMap.values())
                if (await enforcer.enforce(input.context.tenantId, input.context.personId, input.nodeId, input.action, String(input.context.revision), g.sourceId, input.resource))
                    matched.push(g);
            return result(input, matched);
        }
        catch {
            return result(input, []);
        }
    }
}
