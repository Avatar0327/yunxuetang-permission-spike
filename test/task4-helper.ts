import {transaction} from '../src/infrastructure/db.js';
import {OrganizationFactsPort} from '../src/organization/public.js';
import {ReportProjectionPort} from '../src/report/public.js';
import {TrainingProjectionPort} from '../src/training/public.js';
/** Explicit abnormal fixture injection, never a supported product command. */
export async function syntheticMissingDepartment(personId:string){await transaction(async db=>{
 await db.query("UPDATE organization.person SET department_id=null WHERE tenant_id='T1' AND id=$1",[personId]);
 const fact=await new OrganizationFactsPort(db).person({tenantId:'T1',personId});if(!fact)throw Error('missing fixture');
 await new ReportProjectionPort().person(db,fact);await new TrainingProjectionPort().person(db,fact);
});}
