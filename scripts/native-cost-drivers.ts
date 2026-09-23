/** DIAGNOSTIC ONLY. No application imports this scratch module. No service call on import. */
import assert from 'node:assert/strict';
import {mkdir, writeFile, appendFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {Authority} from '../src/authz/revision.js';
import {SessionCache} from '../src/authz/cache.js';
import {ReportService} from '../src/report/service.js';
import {compile, type Mapping} from '../src/authz/compiler.js';
import type {Context, QueryPolicy} from '../src/authz/contracts.js';
import type {CandidateName} from '../src/authz/bulk-candidate.js';
import {metrics, type DB, type Identity} from '../src/infrastructure/db.js';
import {beginRequest,withRequest,finishRequest,span,observePool,safeError} from '../src/infrastructure/telemetry.js';
import {scenarioTruth,digest} from './benchmark-truth.js';

export type Variant='baseline'|'frozen-authority'|'one-source'|'no-company-ceiling'|'no-pair-cap'|'unbound-raw-fields';
const variants:Exclude<Variant,'baseline'>[]=['frozen-authority','one-source','no-company-ceiling','no-pair-cap','unbound-raw-fields'];
export const mapping:Mapping={id:'id',personId:'person_id',companyId:'company_id',dataCompanyId:'data_company_id',enabled:'enabled',deleted:'deleted'};
type Payload={count:number;rows:Record<string,any>[]};
type RawQuery={originalSQL:string;originalParameters:unknown[];sql:string;parameters:unknown[];durationMs:number;rows?:Record<string,any>[];error?:unknown};
const isHistoryCTE=(sql:string)=>/^WITH history_people AS MATERIALIZED\s*\(/.test(sql);
export const isDataSQL=(sql:string)=>/^SELECT (?:r\.id|r\.historical_department_id|count\(\*\)::int count FROM report\.)/.test(sql)
 || (isHistoryCTE(sql)&&/\)\s+SELECT (?:r\.historical_department_id|count\(\*\)::int groups)/.test(sql));
type Statement={sql:string;parameters:unknown[]};
type StatementTransform=(sql:string,parameters:unknown[])=>Statement;
export interface CompanyUniverse {tenantId:string;companies:string[];digest:string;source:'tenant historical fact companies'}
export function companyUniverse(tenantId:string,rows:Record<string,unknown>[]):CompanyUniverse {
 assert.ok(rows.every(r=>typeof r.data_company_id==='string'),'historical company universe must contain text values');
 const companies=[...new Set(rows.map(r=>r.data_company_id as string))].sort();
 return {tenantId,companies,digest:digest({tenantId,companies}),source:'tenant historical fact companies'};
}

/** Defense in depth for our generated queries; not a general SQL security parser. Server also enforces read-only. */
export function assertReadOnlySQL(sql:string){
 if(!(/^SELECT\s/i.test(sql)||(isHistoryCTE(sql)&&isDataSQL(sql)))||/\bFOR\s+(?:KEY\s+)?SHARE\b/i.test(sql)||/;|--|\/\*|\*\//.test(sql)||/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|DO|INTO|VACUUM|ANALYZE|LOCK|SET|RESET)\b/i.test(sql)||/\b(?:nextval|setval|pg_advisory\w*|pg_terminate_backend|pg_cancel_backend|set_config|dblink\w*|lo_import|lo_export)\s*\(/i.test(sql))throw new Error('read-only query guard rejected SQL');
}
export class MemoryCache extends SessionCache {
 private values=new Map<string,string>();
 override async available(){}
 override async get(key:string,cold=false){const value=cold?null:this.values.get(key)??null;return {value,hit:value===null?'cold':'memory'};}
 override async set(key:string,value:string){this.values.set(key,value);}
 override async close(){} // Base Redis client is never connected, pinged, read or written.
 copy(){const out=new MemoryCache();for(const [k,v] of this.values)out.values.set(k,v);return out;}
}
export function frozenContextGetter(context:Context){
 const captured=structuredClone(context);
 return (identity:Identity)=>{assert.equal(identity.tenantId,captured.tenantId,'frozen context identity tenant');assert.equal(identity.personId,captured.personId,'frozen context identity person');return structuredClone(captured);};
}
export class DiagnosticAuthority extends Authority {
 lastPlan?:QueryPolicy;
 constructor(cache:MemoryCache,readonly variant:Variant,readonly frozen:Context,readonly sourceId:string){super(cache);}
 override async current(identity:Identity,db?:DB,lock=false):Promise<Context>{
  assert.equal(lock,false,'diagnostic forbids lock/write flows');
  return this.variant==='frozen-authority'?span('diagnostic.authority.frozen',async()=>frozenContextGetter(this.frozen)(identity)):super.current(identity,db,false);
 }
 override async load(identity:Identity,db?:DB,lock=false,cold=false){
  const loaded=await super.load(identity,db,lock,cold);
  if(this.variant!=='one-source')return loaded;
  const grants=loaded.grants.filter(g=>g.sourceId===this.sourceId);assert.equal(grants.length,1,'fixed source must exist exactly once');
  return {...loaded,grants}; // normalization unchanged; original plan/select/build resolve only this source
 }
 override async plan(identity:Identity,candidate:CandidateName,node:string,action:string,db?:DB,lock=false,cold=false){
  const result=await super.plan(identity,candidate,node,action,db,lock,cold);
  if(this.variant==='no-pair-cap'){
   result.plan=withoutPairs(result.plan);
  }
  this.lastPlan=result.plan;return result;
 }
}

export function withoutPairs(plan:QueryPolicy):QueryPolicy {
 return {...plan,sources:plan.sources.map(source=>{
  const {personCompanyPairs:omitted,...spec}=source.resolved.spec;
  return {...source,resolved:{...source.resolved,spec}};
 })}; // Shallow immutable copy; no extra cloning of large pair arrays inside timing.
}

/** Derive expressions from the real compiler; no copied compiler or report implementation. */
function makeSQLTransform(plan:QueryPolicy,variant:Variant,cteUniverseBound=false){
 const c=compile(plan,mapping);let where=c.where;
 if(variant==='no-company-ceiling'){
  assert.ok(['companyId','dataCompanyId'].includes(plan.companyMode),'company experiment only supports report modes');
  const column=mapping[plan.companyMode as 'companyId'|'dataCompanyId'];
  const pattern=new RegExp(`r\\.${column}=ANY\\((\\$\\d+)::text\\[\\]\\)`);
  assert.ok(pattern.test(where),'missing company term');
  // Retain parameter position/type without filtering. plan.companyIds is always a non-null array.
  where=where.replace(pattern,'($1::text[] IS NOT NULL)');
 }
 const fields=['phone','email','id_card'].map(name=>({before:c.field(name),after:`CASE WHEN ${plan.sources.some(s=>s.rawFields.includes(name))?'true':'false'} THEN r.${name} ELSE NULL END AS ${name}`}));
 return (sql:string)=>{
  assert.ok(!(variant==='no-company-ceiling'&&isHistoryCTE(sql))||cteUniverseBound,'CTE company enumeration requires statementTransform with recorded universe');
  assert.ok(sql.includes(`WHERE ${c.where}`),'expected production WHERE');
  let transformed=sql.replace(`WHERE ${c.where}`,`WHERE ${where}`);
  if(variant==='unbound-raw-fields')for(const f of fields)transformed=transformed.replace(f.before,f.after);
  if(variant==='baseline')assert.equal(transformed,sql,'zero ablation must preserve SQL byte-for-byte');
  return transformed;
 };
}
export function sqlTransform(plan:QueryPolicy,variant:Variant){return makeSQLTransform(plan,variant);}
/** Actual C2 has two company restrictions: compiler ANY and CTE candidate enumeration. */
export function statementTransform(plan:QueryPolicy,variant:Variant,universe?:CompanyUniverse):StatementTransform {
 const textTransform=makeSQLTransform(plan,variant,true);
 if(universe){assert.equal(universe.tenantId,plan.tenantId,'company universe tenant mismatch');assert.equal(universe.digest,digest({tenantId:universe.tenantId,companies:universe.companies}),'company universe digest mismatch');assert.deepEqual(universe.companies,[...new Set(universe.companies)].sort(),'company universe must be deduplicated/sorted');}
 return (sql,parameters)=>{
  let actual=parameters;
  if(variant==='no-company-ceiling'&&isHistoryCTE(sql)){
   assert.ok(universe,'no-company CTE requires recorded historical company universe');
   const domains=[...sql.matchAll(/CROSS JOIN \(SELECT DISTINCT unnest\(\$(\d+)::text\[\]\) AS data_company_id\) dc/g)];
   assert.equal(domains.length,1,'expected exactly one DISTINCT company enumeration');
   const index=Number(domains[0]![1])-1;assert.deepEqual(parameters[index],plan.companyIds,'CTE enumeration must bind original plan company ceiling');
   actual=[...parameters];actual[index]=universe.companies;
  }
  const output={sql:textTransform(sql),parameters:actual};
  if(variant==='baseline'){assert.equal(output.sql,sql);assert.deepEqual(output.parameters,parameters);}
  return output;
 };
}
export function balancedPairs(pairs:number):('baseline'|'variant')[][]{
 assert.ok(Number.isInteger(pairs)&&pairs>=2&&pairs<=100,'pairs must be integer 2..100');assert.equal(pairs%2,0,'pairs must be even');
 return Array.from({length:pairs},(_,i)=>i%2?['variant','baseline']:['baseline','variant']);
}
function rowKey(r:Record<string,any>){return r.id===undefined?JSON.stringify([r.historical_department_id,r.historical_job_id,r.historical_status]):String(r.id);}
export function payloadDiff(baseline:Payload,actual:Payload){
 const b=new Map(baseline.rows.map(r=>[rowKey(r),r])),v=new Map(actual.rows.map(r=>[rowKey(r),r]));
 const counts={extraRows:0,missingRows:0,changedRows:0,newlyExposedCells:0,missingCells:0,changedCells:0,sourceIdsAdded:0,sourceIdsRemoved:0};
 for(const key of new Set([...b.keys(),...v.keys()])){
  const before=b.get(key),after=v.get(key);if(!before)counts.extraRows++;if(!after)counts.missingRows++;if(before&&after&&digest(before)!==digest(after))counts.changedRows++;
  for(const field of ['phone','email','id_card']){const a=before?.[field],z=after?.[field];if(a==null&&z!=null)counts.newlyExposedCells++;else if(a!=null&&z==null)counts.missingCells++;else if(a!=null&&z!=null&&a!==z)counts.changedCells++;}
  const old=new Set<string>(before?.source_ids??[]),now=new Set<string>(after?.source_ids??[]);counts.sourceIdsAdded += [...now].filter(x=>!old.has(x)).length;counts.sourceIdsRemoved += [...old].filter(x=>!now.has(x)).length;
 }
 return {...counts,countDelta:actual.count-baseline.count,digestEqual:digest(actual)===digest(baseline),baselineDigest:digest(baseline),actualDigest:digest(actual),scope:'payload only: first list page or all aggregate groups'};
}
function auditSelection(plan:QueryPolicy,history:boolean,variant:Variant){
 const c=compile(plan,mapping),where=c.where;
 const fields=history?'NULL::text AS phone,NULL::text AS email,NULL::text AS id_card': ['phone','email','id_card'].map(f=>c.field(f)).join(',');
 const sources=c.sourceIds();
 const relation=history?'report.learning_fact r JOIN report.person_projection p ON p.tenant_id=r.tenant_id AND p.person_id=r.person_id':'report.person_projection r';
 const sql=`SELECT r.id,r.person_id,r.${history?'data_company_id':'company_id'} AS audit_company_id,${fields},${sources} FROM ${relation} WHERE ${where}${history?' AND p.deleted=false AND p.enabled=true':''}`;
 return {sql:sqlTransform(plan,variant)(sql),parameters:c.values};
}
/** Full population SQL anti-difference audit, outside measured trials. No materialized table or maintenance. */
export function auditQuery(baseline:QueryPolicy,actual:QueryPolicy,history:boolean,variant:Variant){
 const b=auditSelection(baseline,history,'baseline'),v=auditSelection(actual,history,variant);
 const shifted=v.sql.replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+b.parameters.length));
 const expose=['phone','email','id_card'].map(f=>`count(*) FILTER (WHERE b.${f} IS NULL AND v.${f} IS NOT NULL)`);
 const missing=['phone','email','id_card'].map(f=>`count(*) FILTER (WHERE b.${f} IS NOT NULL AND v.${f} IS NULL)`);
 const capIndex=b.parameters.length+v.parameters.length+1;
 const sql=`SELECT count(*) FILTER (WHERE b.id IS NULL)::text AS extra_rows,count(*) FILTER (WHERE v.id IS NULL)::text AS missing_rows,
 (${expose.join('+')})::text AS newly_exposed_cells,(${missing.join('+')})::text AS missing_cells,
 count(*) FILTER (WHERE b.source_ids IS DISTINCT FROM v.source_ids)::text AS source_ids_changed_rows,
 count(*) FILTER (WHERE v.id IS NOT NULL AND NOT(v.audit_company_id=ANY($${capIndex}::text[])))::text AS outside_company_ceiling_rows
 FROM (${b.sql}) b FULL OUTER JOIN (${shifted}) v ON b.id=v.id`;
 assertReadOnlySQL(sql);return {sql,parameters:[...b.parameters,...v.parameters,baseline.companyIds]};
}

export function verifySourceProvenance(expectedSource:string,head:string,trackedStatus:string){
 assert.match(expectedSource,/^[0-9a-f]{40}$/,'expected-source must be full 40 lowercase hex characters');
 assert.equal(head,expectedSource,'expected-source must equal exact HEAD; prefixes are not accepted');
 assert.equal(trackedStatus,'','tracked tree must be clean, including staged and unstaged changes');
 return {expectedSource,head,trackedTreeClean:true,trackedStatus};
}
export async function diagnosticFingerprints(){
 return Promise.all([new URL(import.meta.url),new URL('../test/native-cost-drivers.test.ts',import.meta.url)].map(async url=>{
  const path=fileURLToPath(url),bytes=await readFile(path);
  return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }));
}
function sourceProvenance(expectedSource:string){
 const head=execFileSync('git',['rev-parse','--verify','HEAD'],{encoding:'utf8'}).trim();
 const trackedStatus=execFileSync('git',['status','--porcelain=v1','--untracked-files=no'],{encoding:'utf8'});
 return verifySourceProvenance(expectedSource,head,trackedStatus);
}
export function parseArgs(args:string[]){
 const options={run:false,output:'',pairs:10,audit:true,only:'' as Variant|'',expectedSource:''};
 for(const a of args){
  if(a==='--run')options.run=true;
  else if(a.startsWith('--output='))options.output=a.slice(9);
  else if(a.startsWith('--pairs='))options.pairs=Number(a.slice(8));
  else if(a==='--audit=none')options.audit=false;
  else if(a==='--audit=full')options.audit=true;
  else if(a.startsWith('--variant=')&&variants.includes(a.slice(10) as any)){
   assert.equal(options.only,'','duplicate --variant is forbidden, including identical values');options.only=a.slice(10) as Variant;
  }else if(a.startsWith('--expected-source=')){
   assert.equal(options.expectedSource,'','duplicate --expected-source is forbidden');options.expectedSource=a.slice(18);
   assert.match(options.expectedSource,/^[0-9a-f]{40}$/,'expected-source must be full 40 lowercase hex characters');
  }else throw new Error('unknown argument: '+a);
 }
 balancedPairs(options.pairs);
 if(options.run){assert.ok(options.output,'--run requires unique --output directory');assert.ok(options.expectedSource,'--run requires explicit --expected-source=<full40hex>');}
 return options;
}
function guardedDB(pool:pg.Pool,raw:RawQuery[],transform?:StatementTransform):DB{
 return {query:async(sql:string,parameters:unknown[]=[])=>{
  assertReadOnlySQL(sql);const effective=isDataSQL(sql)&&transform?transform(sql,parameters):{sql,parameters};assertReadOnlySQL(effective.sql);
  const row:RawQuery={originalSQL:sql,originalParameters:parameters,sql:effective.sql,parameters:effective.parameters,durationMs:0};raw.push(row);const start=performance.now();
  try{const result=await pool.query(effective.sql,effective.parameters);row.durationMs=performance.now()-start;row.rows=result.rows;return result;}catch(e){row.durationMs=performance.now()-start;row.error=safeError(e);throw e;}
 }} as DB;
}
function phaseSummary(trials:any[]){
 const names=['authority.current','authority.load','authority.plan','snapshot.build','snapshot.parse','snapshot.stringify','snapshot.normalize','cap.parseBatch','policy.selectSources','policy.build','scope.resolve','report.compile','compiler.pairs.stringify','pool.acquire','sql.roundtrip','diagnostic.authority.frozen'];
 return names.map(name=>({name,inclusiveMs:summaryStats(trials.map(t=>(t.diagnostic?.spans??[]).filter((s:any)=>s.name===name).reduce((n:number,s:any)=>n+s.durationMs,0))),exclusiveMs:summaryStats(trials.map(t=>(t.diagnostic?.spans??[]).filter((s:any)=>s.name===name).reduce((n:number,s:any)=>n+s.exclusiveMs,0)))}));
}
function summaryStats(values:number[]){const a=[...values].sort((x,y)=>x-y);const q=(p:number)=>a.length?a[Math.ceil(a.length*p)-1]:null;return {n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),min:a[0]??null,max:a.at(-1)??null};}
function fixedSource(scenario:string){return scenario.endsWith('constrained')?`role:bm-managed:${scenario.startsWith('history')?'history:report.history.view':'personal-learning:report.personal-learning.view'}`:`role:m-broad:${scenario.startsWith('history')?'history:report.history.view':'personal-learning:report.personal-learning.view'}`;}
function dataSQL(raw:RawQuery[]){return raw.filter(q=>isDataSQL(q.originalSQL)).map(q=>({sql:q.sql,parameters:q.parameters}));}
function shape(plan:QueryPolicy){return {sources:plan.sources.length,persons:plan.sources.reduce((n,s)=>n+s.resolved.personIds.length,0),objects:plan.sources.reduce((n,s)=>n+(s.resolved.objectIds?.length??0),0),pairs:plan.sources.reduce((n,s)=>n+(s.resolved.spec.personCompanyPairs?.length??0),0),revision:plan.revision};}
export async function run(options:ReturnType<typeof parseArgs>){
 assert.equal(options.run,true);assert.equal(process.env.OBSERVE,'1','set OBSERVE=1 before imports for actual inherited method spans');
 const provenance={...sourceProvenance(options.expectedSource),inputs:await diagnosticFingerprints()};
 const head=provenance.head;
 await mkdir(options.output,{recursive:false});
 const meta={startedAt:new Date().toISOString(),head,provenance,options,limitations:['Sequential local diagnostic; not HTTP or qualification or shared-pool queueing benefit.','Token lookup and Redis omitted consistently; identical in-memory snapshot cache adapter in both arms.','No ablation gains may be summed; paired difference distribution is distinct from difference of arm p95s. Phase inclusive/exclusive distributions are per-request sums for that named span, never additive across names or independent p95s.','Stable-state results do not validate revocation/fault safety of frozen authority. No-company CTE uses a recorded untimed tenant-wide historical company universe; setup cost and changes after capture are not measured.','All raw SQL/parameters/results are synthetic diagnostic evidence and may contain synthetic field values.','No EXPLAIN, DDL, writes, maintenance or service configuration changes.']};
 await writeFile(`${options.output}/manifest.json`,JSON.stringify(meta,null,2));
 const pool=new pg.Pool({host:process.env.PGHOST??'127.0.0.1',port:Number(process.env.PGPORT??55432),database:process.env.PGDATABASE??'permission_spike',user:process.env.PGUSER??'spike',password:process.env.PGPASSWORD??'spike',max:20,connectionTimeoutMillis:800,statement_timeout:10000,options:'-c default_transaction_read_only=on'});
 pool.on('error',()=>{});observePool(pool);
 const truth=scenarioTruth();const results:any[]=[];
 try{
  const environment=await pool.query("SELECT current_setting('default_transaction_read_only') AS readonly,current_setting('statement_timeout') AS statement_timeout,version()");assert.equal(environment.rows[0].readonly,'on');await writeFile(`${options.output}/environment.json`,JSON.stringify(environment.rows,null,2));
  for(const [scenario,definition] of Object.entries(truth.scenarios)){
   const identity={tenantId:'T1',personId:definition.actor},history=definition.history;
   const listOptions={limit:50,history,aggregate:history,groupBy:history?'department,job,status' as const:undefined};
   const seedCache=new MemoryCache(),seedAuthority=new Authority(seedCache),setupRaw:RawQuery[]=[];
   let loaded:Awaited<ReturnType<Authority['load']>>;
   try{loaded=await seedAuthority.load(identity,guardedDB(pool,setupRaw),false,true);}catch(e){await writeFile(`${options.output}/${scenario}-setup.json`,JSON.stringify({queries:setupRaw,error:safeError(e),complete:false},null,2));throw e;}
   const expected:Payload={count:definition.expectedCount,rows:definition.expectedRows};
   await writeFile(`${options.output}/${scenario}-setup.json`,JSON.stringify({queries:setupRaw,context:loaded.context,expected},null,2));
   let historicalCompanies:CompanyUniverse|undefined;
   if(history&&(!options.only||options.only==='no-company-ceiling')){
    const raw:RawQuery[]=[];
    try{
     const rows=await guardedDB(pool,raw).query('SELECT DISTINCT data_company_id FROM report.learning_fact WHERE tenant_id=$1 ORDER BY data_company_id',[identity.tenantId]);
     historicalCompanies=companyUniverse(identity.tenantId,rows.rows);
     await writeFile(`${options.output}/${scenario}-company-universe.json`,JSON.stringify({queries:raw,universe:historicalCompanies,timed:false},null,2));
    }catch(e){await writeFile(`${options.output}/${scenario}-company-universe.json`,JSON.stringify({queries:raw,error:safeError(e),complete:false},null,2));throw e;}
   }
   for(const variant of options.only?[options.only]:variants){
    if(variant==='unbound-raw-fields'&&history||variant==='no-pair-cap'&&!history)continue;
    let audited=false;
    for(const snapshotMode of ['hot','cold'] as const){
     const label=`${scenario}-${variant}-${snapshotMode}`;
     const arms={} as Record<'baseline'|'variant',{authority:DiagnosticAuthority;service:ReportService;plan:QueryPolicy;transform:StatementTransform;sql:ReturnType<typeof dataSQL>}>;
     for(const arm of ['baseline','variant'] as const){
      const actualVariant=arm==='baseline'?'baseline':variant;
      const authority=new DiagnosticAuthority(seedCache.copy(),actualVariant,loaded.context,fixedSource(scenario)),service=new ReportService(authority);
      // Build transform from the actual production plan, outside timing. Capture a production-service preflight.
      const prepRaw:RawQuery[]=[],raw:RawQuery[]=[];
      let plan:QueryPolicy,transform:StatementTransform,preflight:Awaited<ReturnType<ReportService['list']>>;
      try{
       await authority.plan(identity,'native',history?'history':'personal-learning',history?'report.history.view':'report.personal-learning.view',guardedDB(pool,prepRaw),false,snapshotMode==='cold');
       plan=structuredClone(authority.lastPlan!);transform=statementTransform(plan,actualVariant,historicalCompanies);
       preflight=await service.list(identity,'native',{...listOptions,cold:snapshotMode==='cold'},guardedDB(pool,raw,transform));
      }catch(e){await writeFile(`${options.output}/${label}-${arm}-preflight.json`,JSON.stringify({preparation:prepRaw,queries:raw,error:safeError(e),complete:false},null,2));throw e;}
      await writeFile(`${options.output}/${label}-${arm}-preflight.json`,JSON.stringify({plan,shape:shape(plan),companyUniverse:actualVariant==='no-company-ceiling'?historicalCompanies:undefined,preparation:prepRaw,queries:raw,result:preflight,diff:payloadDiff(expected,preflight)},null,2));
      assert.deepEqual(authority.lastPlan,plan,'plan drift during preflight');
      if(arm==='baseline'){assert.equal(digest({count:preflight.count,rows:preflight.rows}),definition.resultDigest,'baseline independent truth failed');for(const q of raw){assert.equal(q.sql,q.originalSQL,'zero ablation SQL mismatch');assert.deepEqual(q.parameters,q.originalParameters,'zero ablation parameters mismatch');}}
      arms[arm]={authority,service,plan,transform,sql:dataSQL(raw)};
     }
     // Balanced paired local replay, no concurrent requests or additional load windows.
     const trials:any[]=[];
     for(const [pairIndex,order] of balancedPairs(options.pairs).entries())for(const arm of order){
      const a=arms[arm],raw:RawQuery[]=[],trace=beginRequest(`${label}-${pairIndex}-${arm}`,{enabled:true,sink:()=>{}}),m={queries:0};
      let payload:Payload|undefined,error:unknown,evidence:unknown;const start=performance.now();
      try{const r=await metrics.run(m,()=>withRequest(trace,()=>a.service.list(identity,'native',{...listOptions,cold:snapshotMode==='cold'},guardedDB(pool,raw,a.transform))));payload={count:r.count,rows:r.rows};evidence=r.evidence;}catch(e){error=safeError(e);}
      const durationMs=performance.now()-start,diagnostic=finishRequest(trace,error?503:200,error?'diagnostic-error':'diagnostic-success');
      const trial={pairId:`${label}-${pairIndex}`,order,arm,variant,snapshotMode,scenario,durationMs,sqlCount:m.queries,rawQueryCount:raw.length,error,payload,evidence,queries:raw,diagnostic,diff:payload?payloadDiff(expected,payload):null};
      // Validation and file I/O outside timing; retain failures before deciding whether to stop.
      await appendFile(`${options.output}/${label}-trials.jsonl`,JSON.stringify(trial)+'\n');trials.push(trial);
      if(!error){assert.deepEqual(a.authority.lastPlan,a.plan,'plan drift; stop rather than benchmark changed state');assert.deepEqual(dataSQL(raw),a.sql,'data SQL/parameters drift');if(arm==='baseline')assert.equal(digest(payload),definition.resultDigest,'baseline truth drift');}
     }
     const delta:number[]=[];for(let pair=0;pair<options.pairs;pair++){const b=trials.find(t=>t.pairId===`${label}-${pair}`&&t.arm==='baseline'),v=trials.find(t=>t.pairId===`${label}-${pair}`&&t.arm==='variant');if(!b.error&&!v.error)delta.push(b.durationMs-v.durationMs);}
     const armSummary=(arm:string)=>({attempts:trials.filter(t=>t.arm===arm).length,failures:trials.filter(t=>t.arm===arm&&t.error).length,durationMs:summaryStats(trials.filter(t=>t.arm===arm&&!t.error).map(t=>t.durationMs)),sqlCount:summaryStats(trials.filter(t=>t.arm===arm&&!t.error).map(t=>t.sqlCount)),phaseTimings:phaseSummary(trials.filter(t=>t.arm===arm&&!t.error))});
     const summary={label,variant,scenario,snapshotMode,baseline:armSummary('baseline'),variantArm:armSummary('variant'),pairedSavingsMs:summaryStats(delta),meaning:'positive paired savings means baseline slower; local sequential effect only',fullPopulationAudit:options.audit?'pending/see artifact':'not run; payload-only leakage visibility'};
     if(options.audit&&!audited){
      const q=auditQuery(arms.baseline.plan,arms.variant.plan,history,variant),raw:RawQuery[]=[];
      try{const r=await guardedDB(pool,raw).query(q.sql,q.parameters);await writeFile(`${options.output}/${scenario}-${variant}-full-audit.json`,JSON.stringify({queries:raw,result:r.rows,meaning:variant==='no-pair-cap'?'extra_rows = row admissions denied by original per-source pairs, all other constraints retained':'all row/cell/source differences against unmodified production baseline; outside_company_ceiling_rows is separate',oracle:'Full set comparison to production baseline, plus independent original payload truth. Not a newly redefined expected truth.'},null,2));summary.fullPopulationAudit='complete';}catch(e){await writeFile(`${options.output}/${scenario}-${variant}-full-audit.json`,JSON.stringify({queries:raw,error:safeError(e),complete:false},null,2));summary.fullPopulationAudit='failed; do not claim zero leakage';}
      audited=true;
     }else if(audited)summary.fullPopulationAudit='same frozen scenario audit retained from hot mode; inspect artifact completion/error';
     results.push(summary);await writeFile(`${options.output}/summary.json`,JSON.stringify({meta,results},null,2));
    }
   }
  }
  const finalProvenance={...sourceProvenance(options.expectedSource),inputs:await diagnosticFingerprints()};
  assert.deepEqual(finalProvenance,provenance,'source or diagnostic files changed during replay; evidence incomplete');
  await writeFile(`${options.output}/complete.json`,JSON.stringify({provenance:finalProvenance,finishedAt:new Date().toISOString(),cells:results.length,scope:'diagnostic replay only; no performance Go/No-Go and no concession adopted'},null,2));
 }catch(e){await writeFile(`${options.output}/fatal.json`,JSON.stringify({error:safeError(e),message:String(e),at:new Date().toISOString()},null,2));throw e;}finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const options=parseArgs(process.argv.slice(2));
 if(!options.run)console.log(JSON.stringify({mode:'describe',variants,pairs:options.pairs,liveWorkPerformed:false,run:'Controller only after exclusive environment handoff: OBSERVE=1 node --import tsx <this file> --run --expected-source=<full40hex> --pairs=10 --output=<new directory>',scope:'No token/Redis/HTTP; sequential local diagnostic; production semantics unchanged.'},null,2));
 else await run(options);
}
