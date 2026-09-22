import {query,requireTransaction,type DB} from '../infrastructure/db.js';
import {compile} from '../authz/compiler.js';
import type {PersonFacts} from '../contracts/ports.js';
export class AccountProjectionPort {
 async person(db:DB,fact:PersonFacts){requireTransaction(db);await query(db,'UPDATE account.person_projection SET enabled=$3,deleted=$4 WHERE tenant_id=$1 AND person_id=$2',[fact.tenantId,fact.id,fact.enabled,fact.deleted]);}
}
export async function accountObjects(db:DB,plan:import('../authz/contracts.js').QueryPolicy){
 if(plan.nodeId==='account'){
  const c=compile(plan,{id:'person_id',personId:'person_id',dataCompanyId:'data_company_id',enabled:'enabled',deleted:'deleted'});
  const companies=c.bind(plan.companyIds);
  const relation=`(SELECT p.*,co.data_company_id FROM account.person_projection p CROSS JOIN unnest(${companies}::text[]) co(data_company_id))`;
  return (await query(db,`SELECT r.person_id,r.data_company_id FROM ${relation} r WHERE ${c.where} ORDER BY r.person_id,r.data_company_id`,c.values)).rows.map(r=>JSON.stringify([r.person_id,r.data_company_id]));
 }
 const c=compile(plan,{id:'id',personId:'person_id',dataCompanyId:'data_company_id',enabled:'enabled',deleted:'deleted',crossCompanyReference:'cross_company_reference'});
 return (await query(db,`SELECT r.id FROM account.entry r JOIN account.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id WHERE ${c.where} AND p.enabled AND NOT p.deleted ORDER BY r.id`,c.values)).rows.map(r=>r.id as string);
}
