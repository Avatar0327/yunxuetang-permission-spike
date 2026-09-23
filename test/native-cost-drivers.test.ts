import test from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/authz/compiler.js';
import type {Context, QueryPolicy} from '../src/authz/contracts.js';
import {assertReadOnlySQL, sqlTransform, frozenContextGetter, payloadDiff, balancedPairs, MemoryCache, auditQuery, mapping, parseArgs} from '../scripts/native-cost-drivers.js';
const context:Context={tenantId:'T1',personId:'A',companyId:'I',companyIds:['I'],internal:true,authenticated:true,enabled:true,deleted:false,revision:3};
const plan:QueryPolicy={tenantId:'T1',actorId:'A',revision:3,nodeId:'personal-learning',action:'report.personal-learning.view',resourceType:'person',companyIds:['I'],companyMode:'companyId',requirePublished:false,sources:[{sourceId:'role:one',rawFields:['phone'],resolved:{all:false,personIds:['A'],spec:{tenantId:'T1',actorId:'A',revision:3,nodeId:'personal-learning',action:'report.personal-learning.view',resourceType:'person',companyMode:'companyId',companyIds:['I'],scope:{kind:'self'}}}},{sourceId:'role:two',rawFields:[],resolved:{all:true,personIds:[],spec:{tenantId:'T1',actorId:'A',revision:3,nodeId:'personal-learning',action:'report.personal-learning.view',resourceType:'person',companyMode:'companyId',companyIds:['I'],scope:{kind:'all'}}}}]};
test('zero ablation preserves complete SQL and parameter positions',()=>{
 const c=compile(plan,mapping);const sql=`SELECT r.id,${c.field('phone')},${c.field('email')},${c.sourceIds()} FROM report.person_projection r WHERE ${c.where}`;
 const params=structuredClone(c.values);assert.equal(sqlTransform(plan,'baseline')(sql),sql);assert.deepEqual(c.values,params);
 const company=sqlTransform(plan,'no-company-ceiling')(sql);assert.match(company,/\(\$2::text\[\] IS NOT NULL\)/);assert.ok(!company.includes('r.company_id=ANY'));assert.ok(company.includes(c.field('phone')));
 const raw=sqlTransform(plan,'unbound-raw-fields')(sql);assert.ok(raw.includes('CASE WHEN true THEN r.phone ELSE NULL END AS phone'));assert.ok(raw.includes(c.field('email')));assert.ok(raw.includes(c.where));assert.ok(raw.includes('AS source_ids'));
 assert.throws(()=>sqlTransform(plan,'baseline')('SELECT x FROM report.person_projection r WHERE true'),/expected production WHERE/);
});
test('read-only guard rejects writes, stacked statements, locks, mutating functions and arbitrary EXPLAIN',()=>{
 for(const sql of ['DELETE FROM report.learning_fact','WITH x AS (DELETE FROM a RETURNING *) SELECT * FROM x','SELECT 1; SELECT 2','SELECT * FROM a FOR UPDATE','SELECT nextval(\'x\')','SELECT pg_advisory_lock(1)','EXPLAIN ANALYZE DELETE FROM a','SELECT 1 -- comment'])assert.throws(()=>assertReadOnlySQL(sql),/read-only/);
 assert.doesNotThrow(()=>assertReadOnlySQL('SELECT count(*) FROM report.person_projection WHERE enabled=true'));
 assert.doesNotThrow(()=>assertReadOnlySQL('SELECT * FROM (SELECT r.id FROM report.person_projection r) b FULL OUTER JOIN (SELECT r.id FROM report.person_projection r) v USING(id)'));
});
test('frozen context getter refuses another identity and returns independent clones',()=>{
 const get=frozenContextGetter(context);const c=get({tenantId:'T1',personId:'A'});c.companyIds.push('BAD');c.revision=9;assert.deepEqual(get({tenantId:'T1',personId:'A'}),context);assert.throws(()=>get({tenantId:'T2',personId:'A'}),/identity/);
});
test('memory cache has no service dependency and cold means snapshot miss',async()=>{
 const cache=new MemoryCache();await cache.available();await cache.set('x','value');assert.deepEqual(await cache.get('x'),{value:'value',hit:'memory'});assert.equal((await cache.get('x',true)).value,null);assert.equal((await cache.get('x')).value,'value');await cache.close();
});
test('payload diff distinguishes extra/missing rows, field exposure, and source changes',()=>{
 const a={count:2,rows:[{id:'A',phone:null,source_ids:['one']},{id:'B',phone:'b',source_ids:['one']}]};
 const b={count:2,rows:[{id:'A',phone:'secret',source_ids:['one','two']},{id:'C',phone:'c',source_ids:['two']}]};
 const d=payloadDiff(a,b);assert.equal(d.extraRows,1);assert.equal(d.missingRows,1);assert.equal(d.newlyExposedCells,2);assert.equal(d.missingCells,1);assert.equal(d.sourceIdsAdded,2);assert.equal(d.sourceIdsRemoved,1);assert.equal(d.countDelta,0);assert.equal(d.digestEqual,false);
});
test('balanced pair order is bounded and auditable',()=>{
 assert.deepEqual(balancedPairs(4),[['baseline','variant'],['variant','baseline'],['baseline','variant'],['variant','baseline']]);assert.throws(()=>balancedPairs(3),/even/);assert.throws(()=>balancedPairs(102),/100/);
});
test('full population audit renumbers both arms and retains typed predicates',()=>{
 const q=auditQuery(plan,plan,false,'no-company-ceiling');assertReadOnlySQL(q.sql);assert.match(q.sql,/FULL OUTER JOIN/);assert.match(q.sql,/extra_rows/);assert.match(q.sql,/newly_exposed_cells/);assert.ok(q.parameters.length>compile(plan,mapping).values.length);assert.match(q.sql,/IS NOT NULL/);
});
test('CLI default is describe and rejects combined variants and service flags',()=>{
 assert.equal(parseArgs([]).run,false);assert.throws(()=>parseArgs(['--variants=no-pair-cap,no-company-ceiling']),/unknown/);assert.throws(()=>parseArgs(['--run','--pairs=3']),/even/);assert.throws(()=>parseArgs(['--pool=100']),/unknown/);
});

test('actual production report path preserves baseline SQL; frozen removes exactly nine authority reads',async()=>{
 const {DiagnosticAuthority}=await import('../scripts/native-cost-drivers.js');
 const {ReportService}=await import('../src/report/service.js');
 const queries:string[]=[];
 let actorEnabled=true;
 const db={query:async(sql:string)=>{
  queries.push(sql);assertReadOnlySQL(sql);
  let rows:any[];
  if(sql.startsWith('SELECT revision,schema_version'))rows=[{revision:3,schema_version:1,authority_observed_at:new Date(),companies:['I']}];
  else if(sql==='SELECT revision FROM authz.revision WHERE tenant_id=$1')rows=[{revision:3}];
  else if(sql.startsWith('SELECT id,tenant_id AS'))rows=[{id:'A',tenantId:'T1',companyId:'I',internal:true,enabled:actorEnabled,deleted:false}];
  else if(sql.startsWith('SELECT count(*)'))rows=[{count:1}];
  else if(sql.startsWith('SELECT r.id'))rows=[{id:'A',person_id:'A',phone:'secret',email:null,id_card:null,source_ids:['role:stub:personal-learning:report.personal-learning.view']}];
  else throw new Error('Unexpected offline SQL: '+sql);
  return {rows,rowCount:rows.length};
 }} as any;
 const seed=new MemoryCache();await seed.set('snapshot:T1:A:3',JSON.stringify({schemaVersion:1,appointments:[],memberships:[{id:'stub',tenantId:'T1',personId:'A',roleId:'r',level:1,active:true,provenance:'system_origin',policies:[{nodeId:'personal-learning',navigation:true,actions:['report.personal-learning.view'],scope:{kind:'all'},rawFields:['phone'],delegableActions:[]}]}]}));
 const results:any[]=[];const data:string[][]=[];const currentReads:number[]=[];
 for(const variant of ['baseline','frozen-authority'] as const){
  queries.length=0;const a=new DiagnosticAuthority(seed.copy(),variant,context,'unused');
  const r=await new ReportService(a).list({tenantId:'T1',personId:'A'},'native',{},db);
  results.push({count:r.count,rows:r.rows});data.push(queries.filter(q=>q.startsWith('SELECT r.id')||q.startsWith('SELECT count(*)')));currentReads.push(queries.length-2);
 }
 assert.deepEqual(results[0],results[1]);assert.deepEqual(data[0],data[1]);assert.deepEqual(currentReads,[9,0]);
 actorEnabled=false;
 await assert.rejects(()=>new ReportService(new DiagnosticAuthority(seed.copy(),'baseline',context,'unused')).list({tenantId:'T1',personId:'A'},'native',{},db));
 const stale=await new ReportService(new DiagnosticAuthority(seed.copy(),'frozen-authority',context,'unused')).list({tenantId:'T1',personId:'A'},'native',{},db);
 assert.equal(stale.count,1,'frozen snapshot intentionally admits a disabled actor: unsafe counterfactual witness');
});

test('pair-only transform retains other caps, sources, fields, and original immutable plan',async()=>{
 const {withoutPairs}=await import('../scripts/native-cost-drivers.js');
 const input=structuredClone(plan);input.companyMode='dataCompanyId';input.sources[0]!.resolved.spec.personCompanyPairs=[['A','I']];input.sources[0]!.resolved.objectIds=['fact-A'];
 const saved=structuredClone(input),output=withoutPairs(input);assert.deepEqual(input,saved);
 assert.equal(output.sources[0]!.resolved.spec.personCompanyPairs,undefined);assert.deepEqual(output.sources[0]!.resolved.objectIds,['fact-A']);assert.deepEqual(output.companyIds,input.companyIds);assert.deepEqual(output.sources.map(s=>[s.sourceId,s.rawFields]),input.sources.map(s=>[s.sourceId,s.rawFields]));
 assert.match(compile(input,mapping).where,/jsonb_array_elements/);assert.doesNotMatch(compile(output,mapping).where,/jsonb_array_elements/);assert.match(compile(output,mapping).where,/data_company_id=ANY/);
});

test('review: CLI rejects repeated variants and requires explicit full source SHA for run',()=>{
 for(const args of [['--variant=no-pair-cap','--variant=one-source'],['--variant=no-pair-cap','--variant=no-pair-cap']])assert.throws(()=>parseArgs(args),/duplicate --variant/);
 assert.throws(()=>parseArgs(['--run','--output=unused']),/expected-source/);
 for(const sha of ['9f9fe1f','g'.repeat(40),'a'.repeat(39),'a'.repeat(41)])assert.throws(()=>parseArgs(['--run','--output=unused',`--expected-source=${sha}`]),/40.*hex/);
 const options=parseArgs(['--run','--output=unused','--expected-source='+'a'.repeat(40)]);assert.equal((options as any).expectedSource,'a'.repeat(40));
});
test('review: source provenance rejects prefix match and staged/unstaged tracked changes',async()=>{
 const {verifySourceProvenance}=await import('../scripts/native-cost-drivers.js') as any;const sha='a'.repeat(40);
 assert.deepEqual(verifySourceProvenance(sha,sha,''),{expectedSource:sha,head:sha,trackedTreeClean:true,trackedStatus:''});
 assert.throws(()=>verifySourceProvenance('aaaaaaa',sha,''),/40.*hex/);
 assert.throws(()=>verifySourceProvenance(sha,'a'.repeat(39)+'b',''),/exact HEAD/);
 for(const status of [' M src/report/service.ts\n','M  src/report/service.ts\n','D  src/authz/scope.ts\n'])assert.throws(()=>verifySourceProvenance(sha,sha,status),/tracked tree/);
});
test('review: provenance fingerprints actual script and test bytes offline',async()=>{
 const {diagnosticFingerprints}=await import('../scripts/native-cost-drivers.js') as any;const files=await diagnosticFingerprints();
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');const {fileURLToPath}=await import('node:url');
 assert.equal(files.length,2);
 for(const [i,name] of ['../scripts/native-cost-drivers.ts','native-cost-drivers.test.ts'].entries()){
  const path=fileURLToPath(new URL(name,import.meta.url)),bytes=await readFile(path);
  assert.deepEqual(files[i],{path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
});

function c2Plan(duplicateCompany=false):QueryPolicy {
 const p=structuredClone(plan);p.nodeId='history';p.action='report.history.view';p.resourceType='learning';p.companyMode='dataCompanyId';p.companyIds=duplicateCompany?['I','I']:['I'];p.sources=p.sources.slice(0,1);
 const r=p.sources[0]!.resolved;r.spec={...r.spec,nodeId:p.nodeId,action:p.action,resourceType:p.resourceType,companyMode:p.companyMode,companyIds:p.companyIds,capDimension:'person-company-v1',personCompanyPairs:[['A','I'],['A','X']]};
 return p;
}
async function captureC2(plan:QueryPolicy){
 const {ReportService}=await import('../src/report/service.js');const queries:{sql:string;parameters:unknown[]}[]=[];
 const rows=[{historical_department_id:'old',historical_job_id:'job',historical_status:'enabled',count:1,points:'1'}];
 const service=new ReportService({plan:async()=>({plan,permissionMs:0,cache:'offline'})} as any);
 const result=await service.list({tenantId:'T1',personId:'A'},'native',{history:true,aggregate:true,groupBy:'department,job,status'},{query:async(sql:string,parameters:unknown[])=>{queries.push({sql,parameters:structuredClone(parameters)});return {rows,rowCount:rows.length};}} as any);
 assert.equal(queries.length,1);return {query:queries[0]!,result};
}
test('C2: real materialized report SQL is recognized and zero-ablation preserves duplicate-company binds',async()=>{
 const {isDataSQL,statementTransform}=await import('../scripts/native-cost-drivers.js') as any;const p=c2Plan(true),captured=await captureC2(p),q=captured.query;
 assert.match(q.sql,/^WITH history_people AS MATERIALIZED/);assert.equal(isDataSQL(q.sql),true);assert.doesNotThrow(()=>assertReadOnlySQL(q.sql));
 const output=statementTransform(p,'baseline')(q.sql,q.parameters);assert.deepEqual(output,q);assert.equal(captured.result.count,1);assert.match(output.sql,/SELECT DISTINCT unnest/);
 assert.deepEqual(q.parameters.at(-1),['I','I']);
});
test('C2: company ablation must remove both ceiling filter and enumerated domain, retaining pair/tenant checks',async()=>{
 const {statementTransform,companyUniverse}=await import('../scripts/native-cost-drivers.js') as any;const p=c2Plan(true),q=(await captureC2(p)).query,saved=structuredClone(q);
 assert.throws(()=>sqlTransform(p,'no-company-ceiling')(q.sql),/enumeration|universe/);
 assert.throws(()=>statementTransform(p,'no-company-ceiling')(q.sql,q.parameters),/universe/);
 const universe=companyUniverse('T1',[{data_company_id:'I'},{data_company_id:'X'},{data_company_id:'X'},{data_company_id:'Y'}]);
 assert.deepEqual(universe.companies,['I','X','Y']);assert.throws(()=>statementTransform(p,'no-company-ceiling') (q.sql,q.parameters),/universe/);
 assert.throws(()=>statementTransform(p,'no-company-ceiling',{...universe,tenantId:'T2'})(q.sql,q.parameters),/tenant/);
 const out=statementTransform(p,'no-company-ceiling',universe)(q.sql,q.parameters);
 assert.deepEqual(q,saved);assert.deepEqual(out.parameters.at(-1),['I','X','Y']);assert.deepEqual(out.parameters.slice(0,-1),q.parameters.slice(0,-1));
 assert.doesNotMatch(out.sql,/r\.data_company_id=ANY/);assert.match(out.sql,/SELECT DISTINCT unnest/);assert.match(out.sql,/jsonb_array_elements/);assert.match(out.sql,/p\.tenant_id=\$/);assert.match(out.sql,/h\.tenant_id=r\.tenant_id/);
 // Independent finite witness using the emitted company domain and the unchanged per-source pair input.
 const pairStrings=(q.parameters.filter(x=>typeof x==='string'&&x.startsWith('[[')) as string[]).flatMap(x=>JSON.parse(x) as [string,string][]);
 const allowed=(companies:string[])=>companies.filter(company=>pairStrings.some(([person,c])=>person==='A'&&c===company));
 assert.deepEqual(allowed(['I']),['I']);assert.deepEqual(allowed(out.parameters.at(-1) as string[]),['I','X']); // Y remains denied by the pair cap.
 const changedDomain=q.sql.replace('SELECT DISTINCT unnest','SELECT unnest');assert.throws(()=>statementTransform(p,'no-company-ceiling',universe)(changedDomain,q.parameters),/DISTINCT|enumeration/);
});
test('C2: WITH read-only guard rejects write CTEs, unknown CTE paths, stacked SQL and locks',()=>{
 for(const sql of ['WITH history_people AS MATERIALIZED (DELETE FROM report.person_projection RETURNING *) SELECT r.historical_department_id FROM report.learning_fact r','WITH other AS (SELECT 1) SELECT * FROM other','WITH history_people AS MATERIALIZED (SELECT 1) SELECT r.historical_department_id FROM report.learning_fact r; DELETE FROM report.learning_fact','WITH history_people AS MATERIALIZED (SELECT 1 FOR SHARE) SELECT r.historical_department_id FROM report.learning_fact r'])assert.throws(()=>assertReadOnlySQL(sql),/read-only/);
});
test('C2: per-fact audit retains pair caps and current state while removing only variant company ceiling',()=>{
 const p=c2Plan(),q=auditQuery(p,p,true,'no-company-ceiling');assertReadOnlySQL(q.sql);
 assert.equal((q.sql.match(/r\.data_company_id=ANY/g)??[]).length,1);assert.equal((q.sql.match(/p\.deleted=false AND p\.enabled=true/g)??[]).length,2);assert.equal((q.sql.match(/jsonb_array_elements/g)??[]).length,4);assert.match(q.sql,/FULL OUTER JOIN/);assert.doesNotMatch(q.sql,/history_people/);
});
test('C2: removing pair caps may select original unrestricted ALL SQL and must remain recognized',async()=>{
 const {withoutPairs,isDataSQL,statementTransform}=await import('../scripts/native-cost-drivers.js') as any;const p=c2Plan();p.sources[0]!.resolved.all=true;
 assert.match((await captureC2(p)).query.sql,/^WITH history_people/);
 const mutated=withoutPairs(p),q=(await captureC2(mutated)).query;assert.match(q.sql,/^SELECT r\.historical_department_id/);assert.equal(isDataSQL(q.sql),true);assert.deepEqual(statementTransform(mutated,'no-pair-cap')(q.sql,q.parameters),q);
});
