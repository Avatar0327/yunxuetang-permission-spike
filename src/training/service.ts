import { randomUUID } from 'node:crypto';
import {issueMediaTicket,verifyMediaTicket} from '../authz/public.js';
import { pool, query, transaction, Denied, type DB, type Identity } from '../infrastructure/db.js';
import { Authority } from '../authz/revision.js';
import { compile } from '../authz/compiler.js';
import { companyCap } from '../authz/scope.js';
import type { CandidateName } from '../authz/bulk-candidate.js';
export class TrainingService {
    constructor(public authority: Authority) { }
    async projects(identity: Identity, candidate: CandidateName, id?: string, db: DB = pool, action = 'training.project.view', lock = false) {
        const auth = await this.authority.plan(identity, candidate, 'project', action, db, lock);
        const c = compile(auth.plan, { id: 'id', createdBy: 'created_by', enabled: 'enabled', deleted: 'deleted' });
        let where = c.where;
        if (id)
            where += ` AND r.id=${c.bind(id)}`;
        const rows = (await query(db, `SELECT r.id,r.title,r.team_enabled FROM training.project r WHERE ${where} ORDER BY r.id`, c.values)).rows;
        if (id && !rows.length)
            throw new Denied();
        return { rows, count: rows.length, auth };
    }
    async roster(identity: Identity, candidate: CandidateName, id: string, search?:string, personId?:string) {
        const {auth}=await this.projects(identity,candidate,id);
        const values:unknown[]=[identity.tenantId,id,companyCap(auth.context)];
        let where='r.tenant_id=$1 AND r.project_id=$2 AND r.company_id=ANY($3::text[]) AND p.enabled AND NOT p.deleted';
        if(search!==undefined){if(typeof search!=='string'||search.length>200)throw new Denied();values.push('%'+search+'%');where+=` AND r.snapshot_display_name ILIKE $${values.length}`;}
        if(personId!==undefined){values.push(personId);where+=` AND r.person_id=$${values.length}`;}
        const rows=(await query(pool,`SELECT r.person_id,r.company_id,r.snapshot_display_name AS display_name FROM training.roster r JOIN training.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id WHERE ${where} ORDER BY r.person_id`,values)).rows;
        if(personId&&!rows.length)throw new Denied();
        return {rows,count:rows.length};
    }
    async personal(identity:Identity,candidate:CandidateName,id:string,personId:string,kind:'progress'|'attachment'){
        // Attachment bytes need their own action bound to this exact project.
        // Keep the existing roster access, company and current-person checks too.
        if (kind === 'attachment')
            await this.projects(identity, candidate, id, pool, 'training.project.download');
        await this.roster(identity,candidate,id,undefined,personId);
        const row=(await query(pool,'SELECT progress,attachment FROM training.roster WHERE tenant_id=$1 AND project_id=$2 AND person_id=$3',[identity.tenantId,id,personId])).rows[0];
        if(!row)throw new Denied();
        return kind==='progress'?{personId,progress:row.progress}:{personId,bytes:row.attachment};
    }
    async save(identity: Identity, candidate: CandidateName, id: string, body: {
        title?: string;
        teamEnabled?: boolean;
    }) {
        return transaction(async (db) => {
            const { auth } = await this.projects(identity, candidate, id, db, 'training.project.update', true);
            const affected = (await query(db, 'SELECT DISTINCT company_id FROM training.roster WHERE tenant_id=$1 AND project_id=$2', [identity.tenantId, id])).rows;
            if (affected.some(r => !companyCap(auth.context).includes(r.company_id)))
                throw new Denied();
            if (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 200))
                throw new Denied();
            await query(db, 'UPDATE training.project SET title=coalesce($3,title),team_enabled=coalesce($4,team_enabled) WHERE tenant_id=$1 AND id=$2', [identity.tenantId, id, body.title ?? null, body.teamEnabled ?? null]);
            return { saved: true };
        });
    }
    async appoint(identity: Identity, candidate: CandidateName, personId: string, projectId: string, active: boolean) {
        return transaction(async (db) => {
            const { auth } = await this.projects(identity, candidate, projectId, db, 'training.project.appoint', true);
            const p = await this.authority.ports.organization(db).person({tenantId: identity.tenantId, personId});
            if (!p || !companyCap(auth.context).includes(p.companyId))
                throw new Denied();
            // Idempotency belongs to the authorized relation, never a concatenated ID.
            const result = await query(db, `
                INSERT INTO training.appointment(tenant_id,id,person_id,project_id,active)
                VALUES($1,$2,$3,$4,$5)
                ON CONFLICT(tenant_id,person_id,project_id) DO UPDATE SET active=excluded.active
                RETURNING id,active`, [identity.tenantId, randomUUID(), personId, projectId, active]);
            return result.rows[0];
        });
    }
    async media(identity: Identity, candidate: CandidateName, id: string, segment='1', ticket?:string) {
        const {auth}=await this.projects(identity, candidate, id, pool, 'training.project.download');
        if(ticket!==undefined)verifyMediaTicket(ticket,{...identity,projectId:id,segment,revision:auth.context.revision});
        return {fragment:'synthetic-media-segment',projectId:id,authorization:{revision:auth.context.revision,cache:auth.cache}};
    }
    async mediaTicket(identity:Identity,candidate:CandidateName,id:string,segment:string){
        if(typeof segment!=='string'||!segment||segment.length>100)throw new Denied();
        const {auth}=await this.projects(identity,candidate,id,pool,'training.project.download');
        return {ticket:issueMediaTicket({...identity,projectId:id,segment,revision:auth.context.revision}),expiresInSeconds:60};
    }
    async faceToFace(identity:Identity,candidate:CandidateName,id?:string){
        const {plan}=await this.authority.plan(identity,candidate,'face-to-face','training.face-to-face.view');
        const c=compile(plan,{id:'id',ownerId:'owner_id',enabled:'enabled',deleted:'deleted'});
        const where=c.where+(id?` AND r.id=${c.bind(id)}`:'');
        const rows=(await query(pool,`SELECT r.id FROM training.face_to_face r WHERE ${where} ORDER BY r.id`,c.values)).rows;
        if(id&&!rows.length)throw new Denied();return {rows,count:rows.length};
    }

}
