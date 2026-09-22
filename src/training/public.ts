import type { TrainingFacts } from '../contracts/ports.js';
import { query, requireTransaction, type DB, type Identity } from '../infrastructure/db.js';
export class TrainingFactsPort implements TrainingFacts {
    constructor(private db: DB) {}
    async appointments(identity: Identity) {
        return (await query(this.db, 'SELECT id,tenant_id AS "tenantId",person_id AS "personId",project_id AS "projectId",active FROM training.appointment WHERE tenant_id=$1 AND person_id=$2', [identity.tenantId, identity.personId])).rows;
    }
}

export async function trainingObjects(db: DB, plan: import('../authz/contracts.js').QueryPolicy) {
    const { compile }=await import('../authz/compiler.js');
    const c=compile(plan,{id:'id',personId:'person_id',companyId:'company_id',createdBy:'created_by',ownerId:'owner_id',enabled:'enabled',deleted:'deleted'});
    const relation=plan.nodeId==='team-enrollment'?'training.person_projection':plan.nodeId==='project'?'training.project':'training.face_to_face';
    return (await query(db,`SELECT r.id FROM ${relation} r WHERE ${c.where} ORDER BY r.id`,c.values)).rows.map(r=>r.id as string);
}

export class TrainingProjectionPort {
    async person(db:DB,fact:import('../contracts/ports.js').PersonFacts){
        requireTransaction(db);
        await query(db,'UPDATE training.person_projection SET company_id=$3,enabled=$4,deleted=$5,department_id=$6,manager_id=$7,display_name=$8 WHERE tenant_id=$1 AND id=$2',[fact.tenantId,fact.id,fact.companyId,fact.enabled,fact.deleted,fact.departmentId??null,fact.managerId??null,fact.displayName??'']);
    }
}
