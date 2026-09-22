import {createHash} from 'node:crypto';
import {pool,query,Denied,type DB} from '../infrastructure/db.js';
import type {ExportDomain} from '../infrastructure/protected-exports.js';
/** Separate hashed service credential; has no user session or business-read capability. */
export class ExportWorker {
 async verify(token:string,domain:ExportDomain,tenant?:string,db:DB=pool){
  const row=(await query(db,'SELECT tenant_id FROM authz.export_worker WHERE token_hash=$1 AND domain=$2 AND enabled',[createHash('sha256').update(token).digest('hex'),domain])).rows[0];
  if(!row||(tenant&&row.tenant_id!==tenant))throw new Denied();return row.tenant_id as string;
 }
 async requester(token:string,domain:ExportDomain,id:string){
  const tenant=await this.verify(token,domain);
  // Owning-module public lookup registered by bootstrap; no arbitrary requester from HTTP.
  const port=lookups.get(domain);if(!port)throw new Denied();
  const identity=await port(tenant,id);if(!identity)throw new Denied();return identity;
 }
}
const lookups=new Map<ExportDomain,(tenant:string,id:string)=>Promise<{tenantId:string;personId:string}|undefined>>();
export function registerExportLookup(domain:ExportDomain,lookup:(tenant:string,id:string)=>Promise<{tenantId:string;personId:string}|undefined>){if(lookups.has(domain))throw Error('duplicate export lookup');lookups.set(domain,lookup);}
