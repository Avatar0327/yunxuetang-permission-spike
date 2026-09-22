import {AccountService} from './service.js';
import {ProtectedExports} from '../infrastructure/protected-exports.js';
import {pool,query} from '../infrastructure/db.js';
export class AccountExports extends ProtectedExports {
 constructor(service:AccountService){super('account',service.authority,async(i,c,_o,offset,db)=>service.exportPage(i,c,offset,db));}
}
export async function accountExportRequester(tenant:string,id:string){return(await query(pool,'SELECT tenant_id AS "tenantId",person_id AS "personId" FROM account.export_job WHERE tenant_id=$1 AND id=$2',[tenant,id])).rows[0];}
