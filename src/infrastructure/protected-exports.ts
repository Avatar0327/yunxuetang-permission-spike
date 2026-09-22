import {randomUUID} from 'node:crypto';
import {query,transaction,Denied,type DB,type Identity} from './db.js';
import {Authority,ExportWorker} from '../authz/public.js';
import type {CandidateName} from '../authz/bulk-candidate.js';
export type ExportDomain='report'|'training'|'account';
export interface ExportPage {rows:unknown[];count:number;revision:number}
export type ExportReader=(identity:Identity,candidate:CandidateName,options:any,offset:number,db:DB)=>Promise<ExportPage>;
/** Protocol shared by owning modules. No domain tables or row interpretation here. */
export class ProtectedExports {
 constructor(private domain:ExportDomain,private authority:Authority,private read:ExportReader){}
 private async epoch(db:DB,tenant:string){const row=(await query(db,`SELECT version FROM ${this.domain}.export_epoch WHERE tenant_id=$1 FOR SHARE`,[tenant])).rows[0];if(!row)throw new Denied();return String(row.version);}
 async create(identity:Identity,candidate:CandidateName,options:unknown){
  return transaction(async db=>{
   const current=await this.authority.current(identity,db,true),epoch=await this.epoch(db,identity.tenantId);
   const result=await this.read(identity,candidate,options,0,db);const id=randomUUID();
   await query(db,`INSERT INTO ${this.domain}.export_job(tenant_id,id,person_id,revision,options,epoch,total_count) VALUES($1,$2,$3,$4,$5,$6,$7)`,[identity.tenantId,id,identity.personId,current.revision,options,epoch,result.count]);
   return {id,revision:current.revision,count:result.count};
  });
 }
 private async step(identity:Identity,candidate:CandidateName,id:string,claim:number|undefined,worker?:{token:string}){
  return transaction(async db=>{
   // Sole lock order: authority, source epoch, then job. Every phase checks current requester.
   const current=await this.authority.current(identity,db,true),epoch=await this.epoch(db,identity.tenantId);
   if(worker)await new ExportWorker().verify(worker.token,this.domain,identity.tenantId,db);
   const job=(await query(db,`SELECT * FROM ${this.domain}.export_job WHERE tenant_id=$1 AND id=$2 AND person_id=$3 FOR UPDATE`,[identity.tenantId,id,identity.personId])).rows[0];
   if(!job||Number(job.revision)!==current.revision||String(job.epoch)!==epoch)throw new Denied();
   const page=await this.read(identity,candidate,job.options,Number(job.next_offset),db);
   if(page.revision!==current.revision||page.count!==Number(job.total_count))throw new Denied();
   if(claim!==undefined){
    if(job.state!=='ready'||!Number.isSafeInteger(claim)||claim<0)throw new Denied();
    const chunk=(await query(db,`SELECT payload FROM ${this.domain}.export_chunk WHERE tenant_id=$1 AND job_id=$2 AND chunk_no=$3`,[identity.tenantId,id,claim])).rows[0];
    if(!chunk)throw new Denied();
    return {rows:chunk.payload,count:Number(job.total_count),...(claim+1<Number(job.chunk_count)?{nextChunk:claim+1}:{})};
   }
   if(job.state==='ready')return {id,state:'ready',count:Number(job.total_count)};
   if(page.rows.length>200||(!page.rows.length&&Number(job.next_offset)<page.count))throw new Denied();
   const next=Number(job.next_offset)+page.rows.length,ready=next>=page.count;
   await query(db,`INSERT INTO ${this.domain}.export_chunk(tenant_id,job_id,chunk_no,payload) VALUES($1,$2,$3,$4)`,[identity.tenantId,id,job.chunk_count,JSON.stringify(page.rows)]);
   await query(db,`UPDATE ${this.domain}.export_job SET next_offset=$3,chunk_count=chunk_count+1,state=$4 WHERE tenant_id=$1 AND id=$2`,[identity.tenantId,id,next,ready?'ready':'running']);
   return {id,state:ready?'ready':'running',count:page.count};
  });
 }
 async phase(identity:Identity,candidate:CandidateName,id:string,phase:'execute'|'claim',chunk=0):Promise<any>{
  if(phase==='claim')return this.step(identity,candidate,id,chunk);
  // Compatibility runner: bounded pages and transactions, never a process-wide row accumulator.
  let result;do{result=await this.step(identity,candidate,id,undefined);}while(result.state!=='ready');return result;
 }
 async worker(token:string,candidate:CandidateName,id:string){
  const identity=await new ExportWorker().requester(token,this.domain,id);
  return this.step(identity,candidate,id,undefined,{token});
 }
}
