import { query, type DB } from '../infrastructure/db.js';
import { compile } from '../authz/compiler.js';
import type { QueryPolicy, PolicySnapshot, DelegationCap, CatalogGrant } from '../authz/contracts.js';
/** Owning-module resource state rule shared by live queries and delegation enumeration. */
export function courseAccessPredicate(action:string) {return action==='knowledge.course.maintain'?'':' AND r.accessible=true';}
export async function knowledgeObjects(db: DB, plan: QueryPolicy) {
 const c=compile(plan,{id:'id',uploaderId:'uploader_id',enabled:'enabled',deleted:'deleted',published:'published'});
 return (await query(db,`SELECT r.id FROM knowledge.course r WHERE ${c.where}${courseAccessPredicate(plan.action)} ORDER BY r.id`,c.values)).rows.map(r=>r.id as string);
}

export interface CategoryFact {id:string;parent_id:string|null;creator_id:string;inherit_parent:boolean;force_children:boolean;provenance?:string;source_id?:string|null;authority_snapshot?:PolicySnapshot|null;grants:CatalogGrant[]}
export function effectiveCategory(rows:CategoryFact[],id:string) {
 const chain:CategoryFact[]=[];let current=rows.find(c=>c.id===id);
 while(current){if(chain.some(c=>c.id===current!.id)||chain.length>=10)throw new Error('invalid category ancestry');chain.unshift(current);current=current.parent_id?rows.find(c=>c.id===current!.parent_id):undefined;}
 if(!chain.length||chain[0]!.parent_id)throw new Error('missing category ancestor');
 let caps:readonly DelegationCap[]|undefined,grants:CategoryFact['grants']=[],lockedBy:string|undefined,forcedBy:string|undefined,policyCategoryId:string|undefined;
 for(const c of chain){lockedBy=forcedBy??(c.inherit_parent?c.parent_id??undefined:undefined);if(!lockedBy){caps=c.source_id?(c.authority_snapshot?.caps??[]):undefined;policyCategoryId=c.id;grants=(!c.provenance||['active','system_origin'].includes(c.provenance))?c.grants:[];}if(!forcedBy&&c.force_children)forcedBy=c.id;}
 const leaf=chain.at(-1)!;
 return {id,tenantId:'',creatorId:leaf.creator_id,grants,caps,lockedBy,forcedBy,policyCategoryId};
}
export async function categoryFacts(db:DB,tenantId:string):Promise<CategoryFact[]>{return (await query(db,'SELECT id,parent_id,creator_id,inherit_parent,force_children,grants,provenance,source_id,authority_snapshot FROM knowledge.category WHERE tenant_id=$1',[tenantId])).rows;}

export interface CoursePolicyFact {id:string;category_id:string;custom_browse:CatalogGrant[]|null;custom_source_id?:string|null;custom_snapshot?:PolicySnapshot|null}
export class KnowledgeFactsPort {
 constructor(private db:DB){}
 async catalogs(identity:import('../infrastructure/db.js').Identity){
  const categories=await categoryFacts(this.db,identity.tenantId);
  const courses:CoursePolicyFact[]=(await query(this.db,`SELECT id,category_id,custom_source_id,custom_snapshot,CASE WHEN custom_provenance IN('active','system_origin') THEN custom_browse WHEN custom_browse IS NOT NULL THEN '[]'::jsonb ELSE NULL END custom_browse FROM knowledge.course WHERE tenant_id=$1`,[identity.tenantId])).rows;
  const classroomIds=(await query(this.db,'SELECT classroom_id FROM knowledge.classroom_member WHERE tenant_id=$1 AND person_id=$2',[identity.tenantId,identity.personId])).rows.map(r=>r.classroom_id as string);
  return {categories,courses,classroomIds};
 }
}
