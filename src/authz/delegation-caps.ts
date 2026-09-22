import type { Context, Membership, NodePolicy, DelegationCap, Scope } from './contracts.js';
import { assertGrantSubset } from './delegation.js';
import { nodes } from './registry.js';
import { ObjectResolver } from './objects.js';
import { Denied, Unavailable } from '../infrastructure/db.js';
/** Resolve the recipient's actual scopes against the selected grantor's actual capabilities. */
export async function recipientCaps(context:Context,selected:Membership,target:Context,policies:NodePolicy[],resolver:ObjectResolver,jurisdiction?:Scope):Promise<DelegationCap[]> {
 try {
  return await assertGrantSubset({context,nodes,memberships:[selected],managementRoleMembershipId:selected.id,
   proposalContext:target,proposalJurisdiction:jurisdiction,
   proposed:policies.flatMap(p=>p.actions.map(action=>({nodeId:p.nodeId,action,scope:p.scope,rawFields:p.rawFields}))),
   resolveObjects:s=>resolver.resolve(s)});
 } catch(error) {if(error instanceof Unavailable)throw error;throw new Denied();}
}
