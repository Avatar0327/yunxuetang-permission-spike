import {query,transaction,Denied,type Identity} from '../infrastructure/db.js';
import {Authority} from './revision.js';
import {normalizePolicy,buildQueryPolicy} from './policy.js';
import {selectSources,type CandidateName} from './bulk-candidate.js';
import {companyCap,scopeMatches} from './scope.js';
import {nodes} from './registry.js';
export class CompanyGrantService {
 constructor(private authority:Authority){}
 async change(identity:Identity,candidate:CandidateName,body:{personId:string;companyId:string;active:boolean;managementRoleMembershipId:string}){
  if(typeof body.active!=='boolean'||![body.personId,body.companyId,body.managementRoleMembershipId].every(x=>typeof x==='string'&&x.length>0))throw new Denied();
  return transaction(async db=>{
   const context=await this.authority.current(identity,db,true);
   await this.authority.cache.available();
   const memberships=await this.authority.memberships(identity,db),selected=memberships.filter(m=>m.id===body.managementRoleMembershipId);
   const grants=await selectSources(candidate,context,normalizePolicy({context,nodes,memberships:selected}),'administration','authz.company.grant');
   if(!grants.some(g=>g.delegable)||!companyCap(context).includes(body.companyId))throw new Denied();
   const target=await this.authority.ports.organization(db).person({tenantId:identity.tenantId,personId:body.personId});
   if(!target||!target.internal||!target.enabled||target.deleted||!companyCap(context).includes(target.companyId))throw new Denied();
   const plan=await buildQueryPolicy({context,nodes,nodeId:'administration',action:'authz.company.grant',grants:grants.filter(g=>g.delegable),organization:this.authority.ports.organization(db)});
   if(!plan.sources.some(s=>scopeMatches(s.resolved,{id:target.id,personId:target.id,tenantId:identity.tenantId,type:'person',companyId:target.companyId,exists:true,enabled:target.enabled,deleted:target.deleted})))throw new Denied();
   if(body.active)await query(db,'INSERT INTO authz.company_grant(tenant_id,person_id,company_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[identity.tenantId,body.personId,body.companyId]);
   else await query(db,'DELETE FROM authz.company_grant WHERE tenant_id=$1 AND person_id=$2 AND company_id=$3',[identity.tenantId,body.personId,body.companyId]);
   return {changed:true};
  });
 }
}
