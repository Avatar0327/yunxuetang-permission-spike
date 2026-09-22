import {pool,query,transaction,Denied,type DB,type Identity} from '../infrastructure/db.js';
import {Authority} from '../authz/revision.js';
import {compile} from '../authz/compiler.js';
import type {CandidateName} from '../authz/bulk-candidate.js';
export class AccountService {
 constructor(private authority:Authority){}
 private async authorized(identity:Identity,candidate:CandidateName,action:string,db:DB=pool,own=false){
  const {plan}=await this.authority.plan(identity,candidate,own?'own-account':'account',action,db);
  return compile(plan,{id:'id',personId:'person_id',dataCompanyId:'data_company_id',enabled:'enabled',deleted:'deleted',crossCompanyReference:'cross_company_reference'});
 }
 async own(identity:Identity,candidate:CandidateName){
  const c=await this.authorized(identity,candidate,'account.own.view',pool,true);
  const rows=(await query(pool,`SELECT r.data_company_id AS company_id,r.currency,coalesce(sum(r.remaining) FILTER(WHERE kind='reward'),0)::int balance,coalesce(sum(r.remaining) FILTER(WHERE kind='debt'),0)::int debt FROM account.entry r WHERE ${c.where} GROUP BY r.data_company_id,r.currency ORDER BY r.data_company_id,r.currency`,c.values)).rows;
  return {rows};
 }
 async list(identity:Identity,candidate:CandidateName,exporting=false,id?:string,source=false){
  const c=await this.authorized(identity,candidate,source?'account.entry.source':exporting?'account.entry.export':'account.entry.view');
  const where=c.where+(id?` AND r.id=${c.bind(id)}`:'');
  const rows=(await query(pool,`SELECT r.id,r.person_id,r.data_company_id,r.currency,r.kind,r.amount,r.remaining${source?',s.payload':''} FROM account.entry r JOIN account.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id ${source?'JOIN account.source s ON s.tenant_id=r.tenant_id AND s.company_id=r.data_company_id AND s.id=r.source_id':''} WHERE ${where} AND p.enabled AND NOT p.deleted ORDER BY r.id`,c.values)).rows;
  if(id&&!rows.length)throw new Denied();return {rows,count:rows.length};
 }
 async offset(identity:Identity,candidate:CandidateName,body:{debtId:string;rewardId:string}){
  if(![body.debtId,body.rewardId].every(x=>typeof x==='string'&&x.length>0)||body.debtId===body.rewardId)throw new Denied();
  return transaction(async db=>{
   await this.authority.current(identity,db,true);
   const c=await this.authorized(identity,candidate,'account.entry.offset',db);
   const ids=[body.debtId,body.rewardId].sort();
   const rows=(await query(db,`SELECT r.* FROM account.entry r JOIN account.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id WHERE ${c.where} AND p.enabled AND NOT p.deleted AND r.id=ANY(${c.bind(ids)}::text[]) ORDER BY r.id FOR UPDATE OF r`,c.values)).rows;
   const debt=rows.find(r=>r.id===body.debtId),reward=rows.find(r=>r.id===body.rewardId);
   if(!debt||!reward||debt.kind!=='debt'||reward.kind!=='reward'||debt.person_id!==reward.person_id||debt.data_company_id!==reward.data_company_id||debt.currency!==reward.currency)throw new Denied();
   const amount=Math.min(debt.remaining,reward.remaining);
   await query(db,'UPDATE account.entry SET remaining=remaining-$3 WHERE tenant_id=$1 AND id=ANY($2::text[])',[identity.tenantId,ids,amount]);
   await query(db,'INSERT INTO account.offset_audit(tenant_id,debt_id,reward_id,amount,actor_id) VALUES($1,$2,$3,$4,$5)',[identity.tenantId,debt.id,reward.id,amount,identity.personId]);
   return {offset:amount};
  });
 }
}
