import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {setTimeout as sleep} from 'node:timers/promises';
import * as t from '../src/infrastructure/telemetry.js';
function request(id = 'test-request', enabled = true) { return t.beginRequest(id, {enabled, sink: () => {}}); }
test('nested exclusive time subtracts union of overlapping children, never their sum', async () => {
 const r=request(); await t.withRequest(r,()=>t.span('outer',async()=>{await Promise.all([t.span('a',()=>sleep(25)),t.span('b',()=>sleep(25))]);}));
 const d=t.finishRequest(r,200)!,outer=d.spans.find((s:any)=>s.name==='outer')!;
 assert.ok(outer.durationMs>=20);assert.ok(outer.exclusiveMs>=0);assert.ok(outer.exclusiveMs<outer.durationMs/2);
 assert.equal(d.spans.filter((s:any)=>s.parentId===outer.id).length,2);
});
test('exceptions retain identity and safe original classification without messages, parameters or causes leaking',async()=>{
 const r=request();const e=Object.assign(new Error('secret-value password token'),{code:'57014',detail:'business payload',cause:Object.assign(new Error('credential'),{code:'ECONNRESET'})});
 await assert.rejects(t.withRequest(r,()=>t.span('sql.roundtrip',async()=>{throw e;})),x=>x===e);
 const d=t.finishRequest(r,503)!;assert.equal(d.errors[0]!.code,'57014');assert.equal(d.errors[0]!.causeCode,'ECONNRESET');assert.doesNotMatch(JSON.stringify(d),/secret-value|password|credential|business payload/);
});
test('disabled instrumentation returns exact synchronous and promise values and emits nothing',async()=>{
 let writes=0;const r=t.beginRequest('disabled',{enabled:false,sink:()=>writes++});const value={ok:true};const p=Promise.resolve(value);
 assert.equal(t.withRequest(r,()=>t.span('x',()=>p)),p);assert.equal(t.withRequest(r,()=>t.spanSync('x',()=>value)),value);assert.equal(t.finishRequest(r,200)!,undefined);assert.equal(writes,0);
});
test('concurrent contexts never cross request or parent boundaries',async()=>{
 const a=request('a'),b=request('b');await Promise.all([t.withRequest(a,()=>t.span('only-a',()=>sleep(10))),t.withRequest(b,()=>t.span('only-b',()=>sleep(15)))]);
 assert.deepEqual(t.finishRequest(a,200)!.spans.map((s:any)=>s.name),['request','only-a']);assert.deepEqual(t.finishRequest(b,200)!.spans.map((s:any)=>s.name),['request','only-b']);
});
test('fingerprints normalize literals and comments and expose only a digest',()=>{
 const a=t.sqlFingerprint("SELECT * FROM x WHERE id=123 AND token='secret' -- comment");const b=t.sqlFingerprint("SELECT * FROM x WHERE id=456 AND token='other'");assert.equal(a,b);assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,t.sqlFingerprint('SELECT id FROM x'));
});
test('untrusted IDs and arbitrary error names/codes cannot become diagnostic payloads',()=>{
 const r=request('Bearer secret user@example.com');const d=t.finishRequest(r,500)!;assert.match(d.requestId,/^[A-Za-z0-9_-]{1,100}$/);assert.doesNotMatch(JSON.stringify(t.safeError({name:'secret payload',code:'secret-token',cause:{code:'password'}})),/secret|password/);
});
test('span and error records stay bounded, loss is explicit and finish is idempotent',()=>{
 let writes=0;const r=t.beginRequest('bounded',{enabled:true,sink:()=>writes++});t.withRequest(r,()=>{for(let i=0;i<3000;i++){t.spanSync('bounded',()=>1);t.recordError('bounded',new Error('secret'));}});
 const d=t.finishRequest(r,500)!;assert.ok(d.spans.length<=512);assert.ok(d.errors.length<=64);assert.ok(d.droppedSpans>0);assert.ok(d.droppedErrors>0);t.finishRequest(r,500)!;assert.equal(writes,1);
});
test('real pg pool wait is separate, queued requests stay correlated, and errors evict client as before',{skip:process.env.TELEMETRY_PG_TEST!=='1'},async()=>{
 const pool=new pg.Pool({host:'127.0.0.1',port:55432,user:'spike',password:'spike',database:'permission_spike',max:1,connectionTimeoutMillis:800});t.observePool(pool);
 try {
  const held=await pool.connect();const r=request('queued');const work=t.withRequest(r,()=>pool.query('SELECT pg_sleep(0.025), 1 AS n'));await sleep(50);held.release();assert.equal((await work).rows[0].n,1);
  const d=t.finishRequest(r,200)!,acq=d.spans.find((s:any)=>s.name==='pool.acquire')!,sql=d.spans.find((s:any)=>s.name==='sql.roundtrip')!;assert.ok(acq.durationMs>=40);assert.ok(sql.durationMs>=20);assert.ok(sql.startMs>=acq.startMs+acq.durationMs-1);assert.equal(sql.rowCount,1);assert.equal(sql.returnedRows,1);
  const before=(await pool.query('SELECT pg_backend_pid() pid')).rows[0].pid;const err=request('error');await assert.rejects(t.withRequest(err,()=>pool.query('SELECT 1/0')),e=>(e as any).code==='22012');const failure=t.finishRequest(err,503)!;assert.equal(failure.errors[0]!.code,'22012');assert.equal(failure.errors[0]!.name,'error');assert.notEqual((await pool.query('SELECT pg_backend_pid() pid')).rows[0].pid,before);
 } finally {await pool.end();}
});
test('transport abort keeps context until original pending SQL error settles',async()=>{
 const records:any[]=[];const r=t.beginRequest('late-sql',{enabled:true,sink:d=>records.push(d)});
 await t.withRequest(r,async()=>{const pending=t.span('sql.roundtrip',async()=>{await sleep(15);throw Object.assign(new Error('private'),{code:'57014'});});const rejected=assert.rejects(pending);t.markTransportAbort(r);await rejected;t.settleRequest(r,503);});
 assert.equal(records.filter(d=>d.type==='request_diagnostic').length,1);const d=records.find(d=>d.type==='request_diagnostic');assert.equal(d.outcome,'transport_abort');assert.ok(d.errors.some((e:any)=>e.code==='57014'));assert.ok(d.spans.find((s:any)=>s.name==='sql.roundtrip').durationMs>=10);
});
test('real pool acquire timeout is classified before wrappers and does not log query parameters',{skip:process.env.TELEMETRY_PG_TEST!=='1'},async()=>{
 const pool=new pg.Pool({host:'127.0.0.1',port:55432,user:'spike',password:'spike',database:'permission_spike',max:1,connectionTimeoutMillis:30});t.observePool(pool);const held=await pool.connect();
 try{const r=request('pool-timeout');await assert.rejects(t.withRequest(r,()=>pool.query('SELECT $1::text',['private-token-value'])));const d=t.finishRequest(r,503)!;assert.equal(d.errors[0]!.code,'POOL_ACQUIRE_TIMEOUT');assert.doesNotMatch(JSON.stringify(d),/private-token-value|SELECT/);assert.equal(d.spans.filter(s=>s.name==='sql.roundtrip').length,0);}
 finally{held.release();await pool.end();}
});
test('event loop intervals reset and expose both server/client overlapping diagnostic times',async()=>{
 const records:any[]=[];const stop=t.startEventLoopMonitor('client',d=>records.push(d),20);await sleep(55);stop();assert.ok(records.length>=2);assert.ok(records.every(r=>r.side==='client'&&r.durationMs>=0&&r.utilization>=0&&r.utilization<=1));assert.ok(records.some(r=>r.delayMaxMs!==null));assert.notEqual(records[0].intervalId,records[1].intervalId);
});
