import { randomUUID } from 'node:crypto';
import { query, transaction, Denied, type Identity } from '../infrastructure/db.js';
import { ReportService, type ListOptions } from './service.js';
import type { CandidateName } from '../authz/bulk-candidate.js';
export class ExportService {
    constructor(public report: ReportService) { }
    async create(identity: Identity, candidate: CandidateName, options: ListOptions) {
        return transaction(async (db) => {
            const result = await this.report.list(identity, candidate, { ...options, export: true, limit: 1 }, db, true);
            const id = randomUUID();
            await query(db, 'INSERT INTO report.export_job(tenant_id,id,person_id,revision,options) VALUES($1,$2,$3,$4,$5)', [identity.tenantId, id, identity.personId, result.evidence.revision, options]);
            return { id, revision: result.evidence.revision };
        });
    }
    async phase(identity: Identity, candidate: CandidateName, id: string, phase: 'execute' | 'claim') {
        return transaction(async (db) => {
            const job = (await query(db, 'SELECT revision,options,payload,state FROM report.export_job WHERE tenant_id=$1 AND id=$2 AND person_id=$3 FOR UPDATE', [identity.tenantId, id, identity.personId])).rows[0];
            if (!job)
                throw new Denied();
            const result = await this.report.list(identity, candidate, { ...job.options, export: true, limit: 200 }, db, true);
            if (Number(job.revision) !== result.evidence.revision)
                throw new Denied();
            if (phase === 'claim') {
                if (job.state !== 'ready')
                    throw new Denied();
                return { rows: job.payload, count: job.payload.length };
            }
            const rows = [...result.rows];
            for (let offset = 200; offset < result.count; offset += 200) {
                const page = await this.report.list(identity, candidate, { ...job.options, export: true, limit: 200, offset }, db, true);
                rows.push(...page.rows);
            }
            await query(db, "UPDATE report.export_job SET payload=$3,state='ready' WHERE tenant_id=$1 AND id=$2", [identity.tenantId, id, JSON.stringify(rows)]);
            return { id, state: 'ready', count: rows.length };
        });
    }
}
