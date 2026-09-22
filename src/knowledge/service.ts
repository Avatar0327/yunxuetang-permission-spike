import { randomUUID } from 'node:crypto';
import { categoryFacts,effectiveCategory,courseAccessPredicate } from './public.js';
import { Authority,assertGrantSubset,nodes,ObjectResolver,compile,type CatalogGrant,type CandidateName } from '../authz/public.js';
import { pool,transaction,query,Denied,type DB,type Identity } from '../infrastructure/db.js';
export class KnowledgeService {
 constructor(private authority:Authority){}
 private async grants(identity:Identity,db:DB,input:unknown):Promise<CatalogGrant[]>{
  if(!Array.isArray(input))throw new Denied();
  const result:CatalogGrant[]=[];
  for(const g of input){
   if(!g||!nodes.find(n=>n.id==='course')!.actions.includes(g.action)||typeof g.subject?.id!=='string')throw new Denied();
   const {type,id}=g.subject;
   if(type==='public'){if(id!==identity.tenantId||g.action!=='knowledge.course.browse')throw new Denied();}
   else if(type==='user'){if(!await this.authority.ports.organization(db).person({tenantId:identity.tenantId,personId:id}))throw new Denied();}
   else if(type==='role'){if(!await this.authority.roleExists(identity.tenantId,id,db))throw new Denied();}
   else if(type==='classroom_member'){if(!(await query(db,'SELECT 1 FROM knowledge.classroom_member WHERE tenant_id=$1 AND classroom_id=$2 LIMIT 1',[identity.tenantId,id])).rows.length)throw new Denied();}
   else throw new Denied();
   result.push({id:randomUUID(),action:g.action,subject:{type,id}});
  }
  return result;
 }
 private async ceiling(identity:Identity,db:DB,source:string,grants:CatalogGrant[],affected:(action:string)=>string[]){
  const context=await this.authority.current(identity,db),memberships=await this.authority.memberships(identity,db),resolver=new ObjectResolver(this.authority,db);
  try{
   const caps=await assertGrantSubset({context,nodes,memberships,managementRoleMembershipId:source,proposed:[...new Set(grants.map(g=>g.action))].map(action=>({nodeId:'course',action,scope:{kind:'all'},rawFields:[],objectIds:affected(action)})),resolveObjects:s=>resolver.resolve(s)});
   return {sourceMembershipId:source,revision:context.revision,caps};
  }catch{throw new Denied();}
 }
 private async categoryCeiling(identity:Identity,db:DB,source:string,grants:CatalogGrant[],id:string,patch:{inheritParent?:boolean;forceChildren?:boolean}={}){
  const categories=await categoryFacts(db,identity.tenantId);
  const target=categories.find(c=>c.id===id);
  if(target){target.inherit_parent=patch.inheritParent??target.inherit_parent;target.force_children=patch.forceChildren??target.force_children;}
  const courses=(await query(db,'SELECT id,category_id,custom_browse FROM knowledge.course WHERE tenant_id=$1 ORDER BY id',[identity.tenantId])).rows;
  const affected=courses.map(course=>({course,catalog:effectiveCategory(categories,course.category_id)})).filter(({catalog})=>catalog.policyCategoryId===id);
  return this.ceiling(identity,db,source,grants,action=>affected.filter(({course,catalog})=>action!=='knowledge.course.browse'||catalog.lockedBy||course.custom_browse===null).map(({course})=>course.id));
 }
 private async configure(identity:Identity,candidate:CandidateName,db:DB,id:string,action='knowledge.category.configure'){
  const current=effectiveCategory(await categoryFacts(db,identity.tenantId),id);
  if(current.lockedBy)throw new Denied();
  if(current.creatorId!==identity.personId)await this.authority.plan(identity,candidate,'category',action,db);
  return current;
 }
 async createCategory(identity:Identity,candidate:CandidateName,body:any){return transaction(async db=>{
  await this.authority.plan(identity,candidate,'category','knowledge.category.create',db,true);
  if(typeof body.id!=='string'||!body.id||('inheritParent'in body&&typeof body.inheritParent!=='boolean')||('forceChildren'in body&&typeof body.forceChildren!=='boolean'))throw new Denied();
  const grants=await this.grants(identity,db,body.grants??[]);
  if(body.parentId){const parent=effectiveCategory(await categoryFacts(db,identity.tenantId),body.parentId);if((parent.forcedBy||body.inheritParent)&&grants.length)throw new Denied();}
  const snapshot=await this.categoryCeiling(identity,db,body.managementRoleMembershipId,grants,body.id);
  await query(db,'INSERT INTO knowledge.category(tenant_id,id,parent_id,creator_id,inherit_parent,force_children,grants,source_id,provenance,authority_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'active\',$9)',[identity.tenantId,body.id,body.parentId??null,identity.personId,body.inheritParent??false,body.forceChildren??false,JSON.stringify(grants),body.managementRoleMembershipId,snapshot]);
  return {id:body.id};
 });}
 private async updateInTransaction(identity:Identity,candidate:CandidateName,db:DB,id:string,body:any){
  await this.configure(identity,candidate,db,id);
  // Structural parent mutation is a separate explicit command, never a policy-update bypass.
  if('parentId'in body||('inheritParent'in body&&typeof body.inheritParent!=='boolean')||('forceChildren'in body&&typeof body.forceChildren!=='boolean'))throw new Denied();
  const grants=await this.grants(identity,db,body.grants);const snapshot=await this.categoryCeiling(identity,db,body.managementRoleMembershipId,grants,id,body);
  await query(db,'UPDATE knowledge.category SET grants=$3,inherit_parent=coalesce($4,inherit_parent),force_children=coalesce($5,force_children),source_id=$6,provenance=\'active\',authority_snapshot=$7 WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,JSON.stringify(grants),body.inheritParent??null,body.forceChildren??null,body.managementRoleMembershipId,snapshot]);
  return {id};
 }
 async updateCategory(identity:Identity,candidate:CandidateName,id:string,body:any){return transaction(async db=>{await this.authority.load(identity,db,true);return this.updateInTransaction(identity,candidate,db,id,body);});}
 async importCategories(identity:Identity,candidate:CandidateName,updates:any){return transaction(async db=>{
  await this.authority.load(identity,db,true);if(!Array.isArray(updates)||updates.length>100)throw new Denied();
  for(const u of updates)await this.updateInTransaction(identity,candidate,db,u.id,u);return {updated:updates.length};
 });}
 async append(identity:Identity,candidate:CandidateName,id:string,body:any,preview:boolean){return transaction(async db=>{
  const {context}=await this.authority.load(identity,db,true);await this.configure(identity,candidate,db,id,'knowledge.category.append');
  const current=(await query(db,'SELECT grants FROM knowledge.category WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];
  const additions=await this.grants(identity,db,body.grants);await this.categoryCeiling(identity,db,body.managementRoleMembershipId,additions,id);
  if(preview)return {id,revision:context.revision,additions,retained:current.grants};
  if(body.revision!==context.revision)throw new Denied();
  const combined=[...current.grants,...additions];
  // Existing permits must also remain within this selected source before provenance changes.
  const snapshot=await this.categoryCeiling(identity,db,body.managementRoleMembershipId,combined,id);
  await query(db,'UPDATE knowledge.category SET grants=$3,source_id=$4,provenance=\'active\',authority_snapshot=$5 WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,JSON.stringify(combined),body.managementRoleMembershipId,snapshot]);return {id,appended:additions.length};
 });}
 async courses(identity:Identity,candidate:CandidateName,options:{id?:string;prefix?:string;action?:string;limit?:number;offset?:number}={},db:DB=pool){
  const action=options.action??'knowledge.course.browse';const {plan}=await this.authority.plan(identity,candidate,'course',action,db);
  const c=compile(plan,{id:'id',uploaderId:'uploader_id',enabled:'enabled',deleted:'deleted',published:'published'});
  let where=c.where+courseAccessPredicate(action);
  if(options.id)where+=` AND r.id=${c.bind(options.id)}`;
  if(options.prefix)where+=` AND starts_with(r.id,${c.bind(options.prefix)})`;
  const count=Number((await query(db,`SELECT count(*) n FROM knowledge.course r WHERE ${where}`,c.values)).rows[0].n);
  const rows=(await query(db,`SELECT r.id,r.title,r.published FROM knowledge.course r WHERE ${where} ORDER BY r.id LIMIT ${c.bind(Math.min(Math.max(Number(options.limit)||50,1),200))} OFFSET ${c.bind(Math.max(Number(options.offset)||0,0))}`,c.values)).rows;
  if(options.id&&!rows.length)throw new Denied();return {rows,count};
 }
 async download(identity:Identity,candidate:CandidateName,id:string){return transaction(async db=>{
  await this.authority.load(identity,db,true);await this.courses(identity,candidate,{id,action:'knowledge.course.download'},db);
  const data=(await query(db,'SELECT payload FROM knowledge.course WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];return {id,bytes:data.payload};
 });}
 async customBrowse(identity:Identity,candidate:CandidateName,id:string,body:any){return transaction(async db=>{
  await this.authority.load(identity,db,true);await this.courses(identity,candidate,{id,action:'knowledge.course.maintain'},db);
  const row=(await query(db,'SELECT category_id FROM knowledge.course WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];
  const catalog=effectiveCategory(await categoryFacts(db,identity.tenantId),row.category_id);if(catalog.lockedBy)throw new Denied();
  const grants=await this.grants(identity,db,body.grants);if(grants.some(g=>g.action!=='knowledge.course.browse'))throw new Denied();
  const snapshot=await this.ceiling(identity,db,body.managementRoleMembershipId,grants,()=>[id]);
  await query(db,'UPDATE knowledge.course SET custom_browse=$3,custom_source_id=$4,custom_provenance=\'active\',custom_snapshot=$5 WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,JSON.stringify(grants),body.managementRoleMembershipId,snapshot]);
  return {id};
 });}
 async saveCourse(identity:Identity,candidate:CandidateName,id:string,body:any){return transaction(async db=>{
  await this.authority.load(identity,db,true);await this.courses(identity,candidate,{id,action:'knowledge.course.maintain'},db);
  if(['uploaderId','createdBy','categoryId'].some(k=>k in body)||('title'in body&&typeof body.title!=='string')||['published','accessible','enabled','deleted'].some(k=>k in body&&typeof body[k]!=='boolean'))throw new Denied();
  await query(db,'UPDATE knowledge.course SET title=coalesce($3,title),published=coalesce($4,published),accessible=coalesce($5,accessible),enabled=coalesce($6,enabled),deleted=coalesce($7,deleted) WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,body.title??null,body.published??null,body.accessible??null,body.enabled??null,body.deleted??null]);return {id};
 });}
 async distribute(identity:Identity,candidate:CandidateName,id:string){return transaction(async db=>{await this.authority.load(identity,db,true);await this.courses(identity,candidate,{id,action:'knowledge.course.distribute'},db);return {id,distributed:true};});}
 async recheckPolicy(identity:Identity,candidate:CandidateName,id:string,kind:'category'|'custom'){return transaction(async db=>{
  await this.authority.load(identity,db,true);
  let row:any;
  if(kind==='category'){
   await this.configure(identity,candidate,db,id);
   row=(await query(db,'SELECT grants,source_id FROM knowledge.category WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];
  }else{
   await this.courses(identity,candidate,{id,action:'knowledge.course.maintain'},db);
   row=(await query(db,'SELECT category_id,custom_browse AS grants,custom_source_id AS source_id FROM knowledge.course WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id])).rows[0];
   if(!row||effectiveCategory(await categoryFacts(db,identity.tenantId),row.category_id).lockedBy)throw new Denied();
  }
  if(!row?.source_id||!Array.isArray(row.grants))throw new Denied();
  let state:'active'|'suspended'='suspended',snapshot:unknown=null;
  try{
   const sourceIdentity=await this.authority.sourceMembershipIdentity(identity.tenantId,row.source_id,db);
   if(!sourceIdentity)throw new Denied();
   snapshot=kind==='custom'?await this.ceiling(sourceIdentity,db,row.source_id,row.grants,()=>[id]):await this.categoryCeiling(sourceIdentity,db,row.source_id,row.grants,id);state='active';
  }catch(error){if(!(error instanceof Denied))throw error;}
  if(kind==='category')await query(db,'UPDATE knowledge.category SET provenance=$3,authority_snapshot=coalesce($4,authority_snapshot) WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,state,snapshot]);
  else await query(db,'UPDATE knowledge.course SET custom_provenance=$3,custom_snapshot=coalesce($4,custom_snapshot) WHERE tenant_id=$1 AND id=$2',[identity.tenantId,id,state,snapshot]);
  const revision=(await this.authority.current(identity,db)).revision;
  await query(db,'INSERT INTO knowledge.policy_audit(tenant_id,target_id,kind,state,source_id,revision,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)',[identity.tenantId,id,kind,state,row.source_id,revision,snapshot]);
  return {id,state};
 });}

}
