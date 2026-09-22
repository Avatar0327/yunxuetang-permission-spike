import type { ScopeSpec, ObjectSet } from './contracts.js';
import { buildQueryPolicy } from './policy.js';
import { nodes } from './registry.js';
import { reportObjects } from '../report/public.js';
import { trainingObjects } from '../training/public.js';
import { knowledgeObjects } from '../knowledge/public.js';
import { Authority } from './revision.js';
import { Denied, type DB } from '../infrastructure/db.js';
export class ObjectResolver {
 constructor(private authority: Authority,private db:DB){}
 async resolve(spec:ScopeSpec):Promise<ObjectSet> {
  const context=await this.authority.current({tenantId:spec.tenantId,personId:spec.actorId},this.db);
  if(context.revision!==spec.revision)throw new Denied();
  const plan=await buildQueryPolicy({context,nodes,nodeId:spec.nodeId,action:spec.action,organization:this.authority.ports.organization(this.db),grants:[{sourceId:'trusted-object-resolution',sourceKind:'role',tenantId:spec.tenantId,actorId:spec.actorId,revision:spec.revision,nodeId:spec.nodeId,action:spec.action,scope:spec,rawFields:[],delegable:false}]});
  let objectIds:string[];
  if(['personal-learning','department-report','history','administration'].includes(spec.nodeId))objectIds=await reportObjects(this.db,plan);
  else if(['project','face-to-face'].includes(spec.nodeId))objectIds=await trainingObjects(this.db,plan);
  else if(spec.nodeId==='course')objectIds=await knowledgeObjects(this.db,plan);
  else if(['role-management','category'].includes(spec.nodeId))objectIds=[spec.nodeId].filter(id=>!spec.objectIds||spec.objectIds.includes(id));
  else throw new Denied();
  return {tenantId:spec.tenantId,actorId:spec.actorId,revision:spec.revision,nodeId:spec.nodeId,action:spec.action,objectIds};
 }
}
