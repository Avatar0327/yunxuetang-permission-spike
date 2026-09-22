import { companyCap } from './scope.js';
import { randomUUID } from 'node:crypto';
import { Authority } from './revision.js';
import { nodes } from './registry.js';
import { assertRoleDelegateCapabilities } from './delegation.js';
import { recipientCaps } from './delegation-caps.js';
import { ObjectResolver } from './objects.js';
import type { NodePolicy, Membership, ProposedGrant } from './contracts.js';
import { transaction, query, Denied, Unavailable, type Identity, type DB } from '../infrastructure/db.js';
export interface RoleCommand {id?:string;level:1|2|3;managementRoleMembershipId:string;policies:NodePolicy[];memberPersonIds?:string[]}
export function proposed(policies:NodePolicy[]):ProposedGrant[]{return policies.flatMap(p=>p.actions.map(action=>({nodeId:p.nodeId,action,scope:p.scope,rawFields:p.rawFields})));}
export function validatePolicies(policies:NodePolicy[]) {
 if(!Array.isArray(policies)||new Set(policies.map(p=>p.nodeId)).size!==policies.length)throw new Denied();
 for(const p of policies){const n=nodes.find(n=>n.id===p.nodeId);if(!n||typeof p.navigation!=='boolean'||!p.scope||!n.scopes.includes(p.scope.kind)||!Array.isArray(p.actions)||!Array.isArray(p.rawFields)||!Array.isArray(p.delegableActions)||!p.actions.every(a=>n.actions.includes(a))||!p.rawFields.every(f=>n.rawFields.includes(f))||!p.delegableActions.every(a=>p.actions.includes(a)))throw new Denied();}
}
export class RoleService {
 constructor(private authority:Authority){}
 async create(identity:Identity,body:RoleCommand){return transaction(async db=>{
  const {context}=await this.authority.load(identity,db,true);validatePolicies(body.policies);
  const memberships=await this.authority.memberships(identity,db), resolver=new ObjectResolver(this.authority,db);
  try {assertRoleDelegateCapabilities({context,nodes,memberships,managementRoleMembershipId:body.managementRoleMembershipId,operation:'create',targetLevel:body.level,proposed:proposed(body.policies)});}catch{throw new Denied();}
  const id=body.id??randomUUID();if(typeof id!=='string'||!id||!Array.isArray(body.memberPersonIds??[])||(body.memberPersonIds??[]).some(x=>typeof x!=='string'))throw new Denied();
  const prepared:Membership[]=[];
  for(const personId of [...new Set(body.memberPersonIds??[])]){
   const target=await this.authority.current({tenantId:identity.tenantId,personId},db);
   if(!companyCap(context).includes(target.companyId))throw new Denied();
   const caps=await recipientCaps(context,memberships.find(m=>m.id===body.managementRoleMembershipId)!,target,body.policies,resolver);
   prepared.push({id:randomUUID(),tenantId:identity.tenantId,personId,roleId:id,level:body.level,active:true,provenance:'active',policies:body.policies,delegation:{sourceMembershipId:body.managementRoleMembershipId,sourceActorId:identity.personId,revision:context.revision,caps}});
  }
  await query(db,'INSERT INTO authz.role(tenant_id,id,level,policies) VALUES($1,$2,$3,$4)',[identity.tenantId,id,body.level,JSON.stringify(body.policies)]);
  const membershipIds:string[]=[];
  for(const m of prepared) {
   await query(db,'INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data,source_id) VALUES($1,$2,$3,$4,$5,$6)',[identity.tenantId,m.id,m.personId,id,m,body.managementRoleMembershipId]);membershipIds.push(m.id);
  }
  return {id,membershipIds};
 });}
 async edit(identity:Identity,id:string,body:RoleCommand){return transaction(async db=>{
  const {context}=await this.authority.load(identity,db,true);validatePolicies(body.policies);
  const role=(await query(db,'SELECT level FROM authz.role WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];
  const targets=(await query(db,'SELECT data FROM authz.membership WHERE tenant_id=$1 AND role_id=$2',[identity.tenantId,id])).rows.map(r=>r.data as Membership);
  const level=role?.level??targets[0]?.level;
  if(!role||level===1||body.level!==level)throw new Denied();
  const memberships=await this.authority.memberships(identity,db),resolver=new ObjectResolver(this.authority,db);
  try{assertRoleDelegateCapabilities({context,nodes,memberships,managementRoleMembershipId:body.managementRoleMembershipId,operation:'edit',targetLevel:level,proposed:proposed(body.policies)});}catch{throw new Denied();}
  const selected=memberships.find(m=>m.id===body.managementRoleMembershipId)!;
  for(const target of targets){
   await this.assertNoCycle(identity.tenantId,target.id,selected.id,db);
   const targetContext=await this.authority.current({tenantId:identity.tenantId,personId:target.personId},db);
   if(!companyCap(context).includes(targetContext.companyId))throw new Denied();
   const caps=await recipientCaps(context,selected,targetContext,this.effectivePolicies(body.policies,target),resolver,target.jurisdiction);
   target.policies=body.policies;target.level=level;
   target.delegation={sourceMembershipId:selected.id,sourceActorId:identity.personId,revision:context.revision,caps};
  }
  await query(db,'UPDATE authz.role SET policies=$3,level=$4 WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,JSON.stringify(body.policies),level]);
  for(const target of targets)await query(db,'UPDATE authz.membership SET data=$3,source_id=$4 WHERE tenant_id=$1 AND id=$2',[identity.tenantId,target.id,target,selected.id]);
  await this.audit(identity,db,'role.edit',{id,sourceMembershipId:selected.id,membershipIds:targets.map(m=>m.id)});
  return {id,membershipIds:targets.map(m=>m.id)};
 });}
 private effectivePolicies(policies:NodePolicy[],target:Membership):NodePolicy[]{
  return policies.map(p=>{const o=target.overrides?.find(o=>o.membershipId===target.id&&o.nodeId===p.nodeId);return o?{...p,scope:o.scope??p.scope,actions:o.scope===null?[]:p.actions}:p;});
 }
 private async assertNoCycle(tenant:string,target:string,source:string,db:DB){
  const r=await query(db,`WITH RECURSIVE a AS (SELECT id,source_id FROM authz.membership WHERE tenant_id=$1 AND id=$2 UNION SELECT m.id,m.source_id FROM authz.membership m JOIN a ON a.source_id=m.id WHERE m.tenant_id=$1) SELECT id FROM a WHERE id=$3`,[tenant,source,target]);
  if(source===target||r.rows.length)throw new Denied();
 }
 private async audit(identity:Identity,db:DB,event:string,details:unknown){await query(db,'INSERT INTO authz.audit(tenant_id,revision,event,details) SELECT tenant_id,revision,$2,$3 FROM authz.revision WHERE tenant_id=$1',[identity.tenantId,event,details]);}
 async recheck(identity:Identity,id:string,managementRoleMembershipId:string){return transaction(async db=>{
  const {context}=await this.authority.load(identity,db,true),actorMemberships=await this.authority.memberships(identity,db);
  const actor=actorMemberships.find(m=>m.id===managementRoleMembershipId);
  const {normalizePolicy}=await import('./policy.js');
  if(!actor||!normalizePolicy({context,nodes,memberships:[actor]}).some(g=>g.nodeId==='role-management'&&g.action==='authz.role.recheck'))throw new Denied();
  const row=(await query(db,'SELECT data,source_id FROM authz.membership WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];
  if(!row||!row.source_id)throw new Denied();
  const target=row.data as Membership;
  const targetFact=await this.authority.ports.organization(db).person({tenantId:identity.tenantId,personId:target.personId});
  if(!targetFact||!companyCap(context).includes(targetFact.companyId))throw new Denied();
  let state:'active'|'suspended'='suspended';
  try{
   if(!target.active||!target.delegation||target.delegation.sourceMembershipId!==row.source_id)throw new Denied();
   const sourceRow=(await query(db,'SELECT person_id FROM authz.membership WHERE tenant_id=$1 AND id=$2',[identity.tenantId,row.source_id])).rows[0];
   if(!sourceRow)throw new Denied();
   const sourceIdentity={tenantId:identity.tenantId,personId:sourceRow.person_id};
   const sourceContext=await this.authority.current(sourceIdentity,db),sourceMemberships=await this.authority.memberships(sourceIdentity,db);
   const selected=sourceMemberships.find(m=>m.id===row.source_id)!;
   const resolver=new ObjectResolver(this.authority,db);
   if(!companyCap(sourceContext).includes(targetFact.companyId))throw new Denied();
   const targetContext=await this.authority.current({tenantId:identity.tenantId,personId:target.personId},db);
   target.delegation={sourceMembershipId:row.source_id,sourceActorId:sourceIdentity.personId,revision:context.revision,caps:await recipientCaps(sourceContext,selected,targetContext,this.effectivePolicies(target.policies,target),resolver,target.jurisdiction)};
   state='active';
  }catch(error){if(error instanceof Unavailable)throw error;if(error instanceof Denied || (error instanceof Error && !(error as any).code)){state='suspended';}else throw error;}
  target.provenance=state;
  await query(db,'UPDATE authz.membership SET data=$3 WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,target]);
  await this.audit(identity,db,'delegation.recheck',{id,state,sourceMembershipId:row.source_id,caps:target.delegation?.caps});
  return {id,state};
 });}
 async addMember(identity:Identity,id:string,body:{personId:string;managementRoleMembershipId:string}){return transaction(async db=>{
  const {context}=await this.authority.load(identity,db,true);
  const role=(await query(db,'SELECT level,policies FROM authz.role WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];
  if(!role||!role.policies)throw new Denied();
  const memberships=await this.authority.memberships(identity,db),resolver=new ObjectResolver(this.authority,db);
  try{assertRoleDelegateCapabilities({context,nodes,memberships,managementRoleMembershipId:body.managementRoleMembershipId,operation:'edit',targetLevel:role.level,proposed:proposed(role.policies)});}catch{throw new Denied();}
  const target=await this.authority.current({tenantId:identity.tenantId,personId:body.personId},db);
  if(!companyCap(context).includes(target.companyId))throw new Denied();
  const caps=await recipientCaps(context,memberships.find(m=>m.id===body.managementRoleMembershipId)!,target,role.policies,resolver);
  const m:Membership={id:randomUUID(),tenantId:identity.tenantId,personId:body.personId,roleId:id,level:role.level,active:true,provenance:'active',policies:role.policies,delegation:{sourceMembershipId:body.managementRoleMembershipId,sourceActorId:identity.personId,revision:context.revision,caps}};
  await query(db,'INSERT INTO authz.membership(tenant_id,id,person_id,role_id,data,source_id) VALUES($1,$2,$3,$4,$5,$6)',[identity.tenantId,m.id,m.personId,id,m,body.managementRoleMembershipId]);
  await this.audit(identity,db,'membership.create',{id:m.id,roleId:id,sourceMembershipId:body.managementRoleMembershipId});return {id:m.id};
 });}

}
