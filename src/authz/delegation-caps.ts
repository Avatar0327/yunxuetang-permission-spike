import type { Context, Membership, NodePolicy, DelegationCap } from './contracts.js';
import { normalizePolicy } from './policy.js';
import { makeScope } from './scope.js';
import { nodes } from './registry.js';
import { ObjectResolver } from './objects.js';
import { Denied } from '../infrastructure/db.js';
/** Evaluate recipient-relative SELF/department scopes against one selected grantor, by actual object IDs. */
export async function recipientCaps(context:Context,selected:Membership,target:Context,policies:NodePolicy[],resolver:ObjectResolver):Promise<DelegationCap[]> {
 const grants=normalizePolicy({context,nodes,memberships:[selected]}).filter(g=>g.delegable), result:DelegationCap[]=[];
 for(const p of policies) for(const action of p.actions) {
  const node=nodes.find(n=>n.id===p.nodeId)!;
  const spec=makeScope(target,node,action,p.scope,selected.jurisdiction); if(!spec)throw new Denied();
  const desired=await resolver.resolve(spec),coverage=new Map<string,Set<string>>();
  for(const g of grants.filter(g=>g.nodeId===p.nodeId&&g.action===action)) {
   const cap=await resolver.resolve(g.scope);
   for(const id of cap.objectIds){const fields=coverage.get(id)??new Set<string>();for(const f of g.rawFields)fields.add(f);coverage.set(id,fields);}
  }
  if(desired.objectIds.some(id=>!coverage.has(id)||!p.rawFields.every(f=>coverage.get(id)!.has(f))))throw new Denied();
  result.push({nodeId:p.nodeId,action,objectIds:desired.objectIds,rawFields:p.rawFields});
 }
 return result;
}
