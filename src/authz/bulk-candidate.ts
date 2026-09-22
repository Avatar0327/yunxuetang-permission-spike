import { newEnforcer, newModel } from 'casbin';
import type { Context, EffectiveGrant } from './contracts.js';
export type CandidateName = 'native' | 'casbin';
const model = `[request_definition]
r = tenant, actor, node, action, revision, source
[policy_definition]
p = tenant, actor, node, action, revision, source
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = r.tenant == p.tenant && r.actor == p.actor && r.node == p.node && r.action == p.action && r.revision == p.revision && r.source == p.source`;
/** Genuine candidate static source selection. Common SQL then evaluates each source's scope per row. */
export async function selectSources(candidate: CandidateName, c: Context, grants: EffectiveGrant[], node: string, action: string) {
    if (candidate === 'native')
        return grants.filter(g => g.tenantId === c.tenantId && g.actorId === c.personId && g.revision === c.revision && g.nodeId === node && g.action === action);
    if (candidate !== 'casbin')
        throw new Error('unknown candidate');
    const e = await newEnforcer(newModel(model));
    for (const g of grants)
        await e.addPolicy(g.tenantId, g.actorId, g.nodeId, g.action, String(g.revision), g.sourceId);
    const result: EffectiveGrant[] = [];
    for (const g of grants)
        if (await e.enforce(c.tenantId, c.personId, node, action, String(c.revision), g.sourceId))
            result.push(g);
    return result;
}
