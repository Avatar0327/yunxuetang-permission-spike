import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {pool, metrics, type DB} from '../src/infrastructure/db.js';
import {Authority} from '../src/authz/revision.js';
import {SessionCache} from '../src/authz/cache.js';
import * as compiler from '../src/authz/compiler.js';
import type {QueryPolicy} from '../src/authz/contracts.js';
import {ReportService, type ListOptions} from '../src/report/service.js';
import {captureNativeFactAccess, planNodes} from '../scripts/native-fact-access.js';

const output=process.env.OUTPUT??'evidence/raw/native-candidate2/focused';
const mapping={id:'id',personId:'person_id',companyId:'company_id',dataCompanyId:'data_company_id',enabled:'enabled',deleted:'deleted'};

test('native: four independent full truths and materialized constrained person/company execution',async()=>{
    const evidence=await captureNativeFactAccess();
    await mkdir(output,{recursive:true});
    await writeFile(`${output}/fact-access.json`,JSON.stringify(evidence,null,2));
    assert.equal(evidence.scenarios.length,4);
    for(const s of evidence.scenarios){
        assert.equal(s.resultDigest,s.expectedDigest,`${s.name}: all groups/count/points/fields`);
        assert.equal(s.queries.length,s.name.startsWith('history')?1:2,s.name);
    }
    const constrained=evidence.scenarios.find(s=>s.name==='history-constrained')!;
    const nodes=constrained.queries.flatMap(q=>planNodes(q.plan));
    assert.ok(nodes.some(n=>n['Node Type']==='CTE Scan'),'constrained authorization must execute the materialized person/company relation');
    assert.ok(nodes.some(n=>n['Relation Name']==='learning_fact'),'real fact access remains');
    const broad=evidence.scenarios.find(s=>s.name==='history-broad')!;
    assert.ok(!broad.queries.flatMap(q=>planNodes(q.plan)).some(n=>n['Node Type']==='CTE Scan'),'unrestricted ALL retains legacy physical choice');
});

// Real authority is still read and fenced. This narrow test seam supplies valid
// resolved source variants (including legacy fact IDs) at the compiler boundary.
class VariantAuthority extends Authority {
    constructor(cache:SessionCache,private change:(p:QueryPolicy)=>QueryPolicy){super(cache);}
    override async plan(...args:Parameters<Authority['plan']>){const a=await super.plan(...args);return {...a,plan:this.change(structuredClone(a.plan))};}
}
function pairPlan(p:QueryPolicy){
    p.companyIds=['A','B','A','B'];
    const source=p.sources[0]!;
    source.resolved={...source.resolved,all:false,anchor:undefined,anchorIds:undefined,personIds:['nr-enabled','nr-disabled','nr-deleted'],objectIds:undefined,
        spec:{...source.resolved.spec,personCompanyPairs:[['nr-enabled','A'],['nr-enabled','A'],['nr-disabled','B']]}};
    const second={...structuredClone(source),sourceId:'overlapping-source'};
    second.resolved.spec.personCompanyPairs=[['nr-enabled','A'],['nr-deleted','A']];
    p.sources=[source,second];
    return p;
}
const expectedEnabled=Array.from({length:205},(_,n)=>({historical_department_id:`nr-${String(n).padStart(3,'0')}`,historical_job_id:'historical-job',historical_status:'disabled',count:n===0?2:1,points:String(n===0?10:n+1)}));
const disabledRow={historical_department_id:'nr-disabled-dept',historical_job_id:'former-job',historical_status:'enabled',count:1,points:'13'};
const deletedRow={historical_department_id:'nr-deleted-dept',historical_job_id:null,historical_status:'deleted',count:1,points:'17'};

test('native: history snapshots, current states, source OR/pair caps, fact eligibility and export paging',async()=>{
    const db=await pool.connect(),cache=new SessionCache();
    await db.query('BEGIN');
    try{
        await db.query(`INSERT INTO report.person_projection(tenant_id,id,person_id,company_id,enabled,deleted,department_id,job_id)
          VALUES ('T1','nr-enabled','nr-enabled','I',true,false,'current-dept','current-job'),
          ('T1','nr-disabled','nr-disabled','I',false,false,'current-dept','current-job'),
          ('T1','nr-deleted','nr-deleted','I',true,true,'current-dept','current-job'),
          ('T1','nr-denied','nr-denied','A',true,false,'current-dept','current-job'),
          ('T2','nr-enabled','nr-enabled','A',true,false,'current-dept','current-job')`);
        await db.query(`INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,historical_job_id,historical_status,fixture,points)
          SELECT 'T1','nr-fact-'||lpad(n::text,3,'0'),'nr-enabled','A','nr-'||lpad(n::text,3,'0'),'historical-job','disabled',true,n+1 FROM generate_series(0,204)n`);
        await db.query(`INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,historical_job_id,historical_status,fixture,points,enabled,deleted) VALUES
          ('T1','nr-duplicate-group','nr-enabled','A','nr-000','historical-job','disabled',true,9,true,false),
          ('T1','nr-disabled-fact','nr-disabled','B','nr-disabled-dept','former-job','enabled',true,13,true,false),
          ('T1','nr-deleted-fact','nr-deleted','A','nr-deleted-dept',null,'deleted',true,17,true,false),
          ('T1','nr-company-denied','nr-enabled','B','forbidden',null,'enabled',true,100,true,false),
          ('T1','nr-person-denied','nr-denied','A','forbidden',null,'enabled',true,100,true,false),
          ('T2','nr-tenant-denied','nr-enabled','A','forbidden',null,'enabled',true,100,true,false),
          ('T1','nr-fact-disabled','nr-enabled','A','forbidden',null,'enabled',true,100,false,false),
          ('T1','nr-fact-deleted','nr-enabled','A','forbidden',null,'enabled',true,100,true,true),
          ('T1','nr-nonfixture','nr-enabled','A','nonfixture',null,'enabled',false,19,true,false)`);
        const captured:string[]=[];
        const observed={query:async(sql:string,values:unknown[]=[])=>{captured.push(sql);return db.query(sql,values);}} as DB;
        const service=new ReportService(new VariantAuthority(cache,pairPlan));
        const get=(o:ListOptions={})=>service.list({tenantId:'T1',personId:'X'},'native',{history:true,aggregate:true,liveHistory:true,fixture:true,groupBy:'department,job,status',...o},observed);
        const enabled=await get();
        assert.deepEqual(enabled.rows,expectedEnabled);assert.equal(enabled.count,206);
        for(const [state,rows,count] of [['disabled',[disabledRow],1],['deleted',[deletedRow],1],['all',[...expectedEnabled,deletedRow,disabledRow],208]] as const){
            const result=await get({state});assert.deepEqual(result.rows,rows,state);assert.equal(result.count,count,state);
        }
        assert.equal((await get({fixture:false})).count,207,'fixture filter stays on facts');
        assert.deepEqual((await get({search:'disabled',state:'all'})).rows,[disabledRow]);
        assert.deepEqual((await get({search:'absent',state:'all'})).rows,[]);
        assert.deepEqual((await get({id:'nr-fact-003'})).rows,[expectedEnabled[3]]);
        assert.equal((await get({id:'nr-company-denied'})).count,0);
        const simple=await get({id:'nr-fact-003',groupBy:undefined});
        assert.deepEqual(simple.rows,[{historical_department_id:'nr-003',count:1,points:'4'}]);
        const first=await get({export:true}),last=await get({export:true,offset:200}),past=await get({export:true,offset:999});
        assert.deepEqual(first.rows,expectedEnabled.slice(0,200));assert.deepEqual(last.rows,expectedEnabled.slice(200));assert.deepEqual(past.rows,[]);
        for(const page of [first,last,past]){assert.equal(page.groupCount,205);assert.equal(page.count,206);}
        const before=captured.length;
        const detail=await get({aggregate:false,id:'nr-fact-003'});
        assert.deepEqual(detail.rows,[{id:'nr-fact-003',person_id:'nr-enabled',data_company_id:'A',historical_department_id:'nr-003',historical_job_id:'historical-job',historical_status:'disabled',points:4,source_ids:['role:x-self:history:report.history.view','overlapping-source']}]);
        assert.ok(!captured.slice(before).some(sql=>sql.startsWith('WITH ')),'history detail retains original source-field path');
        // Changing current company/job/department cannot rewrite historical dimensions or cap by current company.
        await db.query("UPDATE report.person_projection SET company_id='B',department_id='changed',job_id='changed',enabled=false WHERE tenant_id='T1' AND person_id='nr-enabled'");
        assert.deepEqual((await get()).rows,[]);
        assert.deepEqual((await get({search:'enabled',state:'disabled'})).rows,expectedEnabled);
        await db.query("UPDATE report.person_projection SET deleted=true WHERE tenant_id='T1' AND person_id='nr-enabled'");
        assert.deepEqual((await get({search:'enabled',state:'deleted'})).rows,expectedEnabled);
        assert.deepEqual((await get({search:'enabled',state:'all'})).rows,expectedEnabled);
        assert.ok(captured.some(sql=>/^WITH .* AS MATERIALIZED/.test(sql)),'eligible aggregate actually takes relation path');
    }finally{await db.query('ROLLBACK');db.release();await cache.close();}
});

test('native: legacy fact object filter falls back with exact truth; self anchor remains eligible',async()=>{
    const cache=new SessionCache();
    try{
        const sqls:string[]=[];
        const db={query:async(sql:string,values:unknown[]=[])=>{sqls.push(sql);return pool.query(sql,values);}} as DB;
        const service=new ReportService(new VariantAuthority(cache,p=>{p.companyIds=['A','B','A'];p.sources[0]!.resolved.objectIds=['h-X-B'];return p;}));
        const result=await service.list({tenantId:'T1',personId:'X'},'native',{history:true,aggregate:true,liveHistory:true,fixture:true},db);
        assert.deepEqual(result.rows,[{historical_department_id:'old-B',count:1,points:'20'}]);assert.equal(result.count,1);
        assert.ok(!sqls.some(sql=>sql.startsWith('WITH ')),'fact IDs require exact per-fact predicate');
        const self=new ReportService(new Authority(cache));sqls.length=0;
        const own=await self.list({tenantId:'T1',personId:'X'},'native',{history:true,aggregate:true,liveHistory:true,fixture:true},db);
        assert.deepEqual(own.rows,[{historical_department_id:'old-A',count:1,points:'10'}]);
        assert.ok(sqls.some(sql=>sql.startsWith('WITH ')),'safe personId anchor is eligible');
        for(const change of [
            (p:QueryPolicy)=>{p.sources=[];},
            (p:QueryPolicy)=>{p.companyIds=[];},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.spec.personCompanyPairs=[];},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.objectIds=[];}
        ]){
            const empty=new ReportService(new VariantAuthority(cache,p=>{change(p);return p;}));
            const denied=await empty.list({tenantId:'T1',personId:'X'},'native',{history:true,aggregate:true,liveHistory:true,fixture:true},db);
            assert.equal(denied.count,0);assert.deepEqual(denied.rows,[]);
        }
        const cappedAll=new ReportService(new VariantAuthority(cache,p=>{p.companyIds=['A','B'];p.sources[0]!.resolved.all=true;p.sources[0]!.resolved.spec.personCompanyPairs=[['X','A']];return p;}));
        const capped=await cappedAll.list({tenantId:'T1',personId:'X'},'native',{history:true,aggregate:true,liveHistory:true,fixture:true},db);
        assert.deepEqual(capped.rows,[{historical_department_id:'old-A',count:1,points:'10'}]);
    }finally{await cache.close();}
});

test('native: compiler applicability rejects unsupported mappings and policy dependencies',async()=>{
    const cache=new SessionCache();
    try{
        const plan=(await new Authority(cache).plan({tenantId:'T1',personId:'X'},'native','history','report.history.view')).plan;
        const relation=compiler.compileHistoryPersonCompany;
        assert.equal(typeof relation,'function','central compiler supplies safe optional relation');
        assert.ok(relation(plan,mapping));
        for(const change of [
            (p:QueryPolicy)=>{p.requirePublished=true;},
            (p:QueryPolicy)=>{p.companyMode='companyId';},
            (p:QueryPolicy)=>{p.companyMode='content';},
            (p:QueryPolicy)=>{p.companyMode='ownWallet';},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.anchor='uploaderId';},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.anchor='ownerId';},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.anchor='createdBy';},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.spec.anchor='uploaderId';},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.objectIds=[];},
            (p:QueryPolicy)=>{p.sources[0]!.resolved.spec.objectIds=[];},
            (p:QueryPolicy)=>{p.nodeId='personal-learning';},
            (p:QueryPolicy)=>{p.resourceType='person';},
            (p:QueryPolicy)=>{p.action='unregistered';}
        ]){const changed=structuredClone(plan);change(changed);assert.equal(relation(changed,mapping),undefined);}
        for(const key of ['id','personId','companyId','dataCompanyId','enabled','deleted'] as const){assert.equal(relation(plan,{...mapping,[key]:'unsupported'}),undefined);}
        const capped=structuredClone(plan);capped.sources[0]!.resolved.all=true;capped.sources[0]!.resolved.spec.personCompanyPairs=[['X','A']];assert.ok(relation(capped,mapping),'ALL with pair cap is constrained');
        const empty=structuredClone(plan);empty.sources=[];assert.ok(relation(empty,mapping),'empty union still compiles false');
    }finally{await cache.close();}
});

// Round 2: the two mid-request fences are one statement each instead of three, so 13 becomes 9;
// the T-1 path issues the same single data statement. The count stays independent of fact count.
test('native: constrained historical aggregation retains 9 hot queries including token',async()=>{
    const cache=new SessionCache(),authority=new Authority(cache),service=new ReportService(authority);
    try{
        await service.list({tenantId:'T1',personId:'person-00003'},'native',{history:true,aggregate:true,liveHistory:true});
        for(const liveHistory of [true,false])for(const fixture of [false,true]){
            const meter={queries:0};
            await metrics.run(meter,async()=>{
                const identity=await authority.token('spike-person-00003');
                await service.list(identity,'native',{history:true,aggregate:true,liveHistory,fixture});
            });
            assert.equal(meter.queries,9,`live=${liveHistory} fixture=${fixture}: SQL count independent of returned fact count`);
        }
    }finally{await cache.close();}
});
test.after(()=>pool.end());
