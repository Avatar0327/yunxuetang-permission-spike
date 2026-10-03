import {spanSync} from '../infrastructure/telemetry.js';
import type { QueryPolicy } from './contracts.js';
export interface Mapping {
    id: string;
    personId?: string;
    companyId?: string;
    dataCompanyId?: string;
    createdBy?: string;
    uploaderId?: string;
    ownerId?: string;
    enabled: string;
    deleted: string;
    published?: string;
    crossCompanyReference?: string;
}
export function compile(plan: QueryPolicy, m: Mapping, alias = 'r') {
    const values: unknown[] = [];
    const bind = (v: unknown) => { values.push(v); return `$${values.length}`; };
    const col = (k: keyof Mapping) => { const name = m[k]; if (!name || !/^[a-z_]+$/.test(name))
        throw new Error('unregistered SQL field'); return `${alias}.${name}`; };
    const terms = [`${alias}.tenant_id=${bind(plan.tenantId)}`, `${col('enabled')}=true`, `${col('deleted')}=false`];
    if (plan.companyMode === 'companyId' || plan.companyMode === 'dataCompanyId')
        terms.push(`${col(plan.companyMode)}=ANY(${bind(plan.companyIds)}::text[])`);
    if (plan.companyMode === 'ownWallet')
        terms.push(`${col('personId')}=${bind(plan.actorId)}`, `length(trim(${col('dataCompanyId')}))>0`, `${col('crossCompanyReference')}=false`);
    if (plan.requirePublished)
        terms.push(`${col('published')}=true`);
    const sources = plan.sources.map(s => {
        const r = s.resolved;
        let predicate = r.all ? 'true' : r.anchor ? `${col(r.anchor)}=ANY(${bind(r.anchorIds ?? [])}::text[])` : `${col('personId')} IN (SELECT unnest(${bind(r.personIds)}::text[]))`;
        if (r.objectIds)
            predicate = `(${predicate}) AND ${col('id')}=ANY(${bind(r.objectIds)}::text[])`;
        if(r.spec.personCompanyPairs !== undefined) {
            const pairs=r.spec.personCompanyPairs;
            predicate=`(${predicate}) AND EXISTS (SELECT 1 FROM jsonb_array_elements(${bind(spanSync('compiler.pairs.stringify',()=>JSON.stringify(pairs)))}::jsonb) pc(pair) WHERE pc.pair->>0=${col('personId')} AND pc.pair->>1=${col('dataCompanyId')})`;
        }
        return { ...s, predicate: `(${predicate})` };
    });
    terms.push(`(${sources.map(s => s.predicate).join(' OR ') || 'false'})`);
    const field = (name: string) => `CASE WHEN ${sources.filter(s => s.rawFields.includes(name)).map(s => s.predicate).join(' OR ') || 'false'} THEN ${alias}.${name} ELSE NULL END AS ${name}`;
    const sourceIds = () => `array_remove(ARRAY[${sources.map(s => `CASE WHEN ${s.predicate} THEN ${bind(s.sourceId)}::text END`).join(',')}],NULL) AS source_ids`;
    return { where: terms.join(' AND '), values, field, sourceIds, bind };
}

/** Optional history aggregate optimization, not a separate policy engine.
 * The report owner supplies one synthetic row per current person/data-company,
 * with enabled=true/deleted=false representing fact eligibility. Actual facts
 * must still enforce those flags; current-person state is filtered separately.
 * Anything depending on a fact ID or another resource field keeps compile's
 * exact per-fact path. An unrestricted ALL union retains the original SQL.
 */
export function compileHistoryPersonCompany(plan: QueryPolicy, m: Mapping) {
    const units = compileHistoryUnits(plan, m);
    if (units === undefined || plan.sources.some(({resolved:r}) => r.all && r.spec.personCompanyPairs === undefined))
        return undefined;
    return units;
}

/** Round 2: the same eligibility as the person/company relation, without excluding an
 * unrestricted ALL source. When it returns a compilation, every source predicate depends
 * only on (person_id, data_company_id), so evaluating it on one synthetic row per current
 * person and candidate data company is exact for every fact of that unit.
 */
export function compileHistoryUnits(plan: QueryPolicy, m: Mapping) {
    const supported: Mapping = {id:'id',personId:'person_id',companyId:'company_id',dataCompanyId:'data_company_id',enabled:'enabled',deleted:'deleted'};
    if (plan.nodeId !== 'history' || plan.resourceType !== 'learning'
        || !['report.history.view','report.history.export'].includes(plan.action)
        || plan.companyMode !== 'dataCompanyId' || plan.requirePublished
        || Object.keys(m).some(key => m[key as keyof Mapping] !== supported[key as keyof Mapping])
        || Object.keys(supported).some(key => m[key as keyof Mapping] !== supported[key as keyof Mapping])
        || plan.sources.some(({resolved:r}) => r.objectIds !== undefined || r.spec.objectIds !== undefined
            || (r.anchor !== undefined && r.anchor !== 'personId')
            || (r.spec.anchor !== undefined && r.spec.anchor !== 'personId')))
        return undefined;
    return compile(plan, m);
}
