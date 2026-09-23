import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash, randomUUID} from 'node:crypto';
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
import type pg from 'pg';

export interface SafeError {name: string; code?: string; causeCode?: string}
interface Span {id: number; parentId: number | null; name: string; startMs: number; durationMs: number; exclusiveMs: number; sqlFingerprint?: string; rowCount?: number; returnedRows?: number; error?: SafeError; poolTotal?: number; poolIdle?: number; poolWaiting?: number}
export interface RequestTrace {requestId: string; requestAt: string; start: number; spans: Span[]; errors: (SafeError & {phase: string})[]; droppedSpans: number; droppedErrors: number; sink: (record: unknown) => void; finished: boolean; intervalStart: number; seenErrors: WeakSet<object>; transportAborted?: boolean; handlerSettled?: boolean}
const context = new AsyncLocalStorage<{request: RequestTrace; parentId: number}>();
const MAX_SPANS=512, MAX_ERRORS=64;
let intervalId=0, droppedRecords=0;
const instance=process.env.INSTANCE_ID??String(process.pid);
/** Bound the stdout queue. Loss is explicit; any loss invalidates attribution completeness. */
export function diagnosticSink(record: unknown) {
 if(process.stdout.writableLength>4*1024*1024){droppedRecords++;return;}
 try {process.stdout.write(JSON.stringify({...record as object,diagnosticDroppedRecords:droppedRecords})+'\n');}catch{droppedRecords++;}
}
export const observing=()=>process.env.OBSERVE==='1';
export function requestId(value: unknown): string {return typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)?value:randomUUID();}
export function beginRequest(id: unknown, options: {enabled?: boolean; sink?: (record: any)=>void}={}): RequestTrace | undefined {
 if(!(options.enabled??observing()))return;
 return {requestId:requestId(id),requestAt:new Date().toISOString(),start:performance.now(),spans:[{id:0,parentId:null,name:'request',startMs:0,durationMs:0,exclusiveMs:0}],errors:[],droppedSpans:0,droppedErrors:0,sink:options.sink??diagnosticSink,finished:false,intervalStart:intervalId,seenErrors:new WeakSet()};
}
export function withRequest<T>(request: RequestTrace | undefined, fn: ()=>T): T {return request?context.run({request,parentId:0},fn):fn();}
const allowedNames=new Set(['error','DatabaseError','Error','TypeError','RangeError','SyntaxError','AbortError','TimeoutError','AggregateError','SocketClosedUnexpectedlyError','ConnectionTimeoutError','ClientClosedError','ClientOfflineError','RootNodesUnavailableError']);
function code(value: unknown): string | undefined {return typeof value==='string'&&(/^[0-9A-Z]{5}$/.test(value)||/^(?:E[A-Z0-9_]{2,35}|UND_ERR_[A-Z_]{1,40}|ERR_[A-Z_]{1,40}|ABORT_ERR|RESPONSE_CLOSED|AUTHZ_[A-Z_]{1,40}|REDIS_TIMEOUT|REDIS_NOT_READY|POOL_ACQUIRE_TIMEOUT|PG_CONNECTION_TIMEOUT|CONNECTION_TERMINATED)$/.test(value))?value:undefined;}
export function safeError(error: unknown): SafeError {
 const e=error as any;let c=code(e?.code);
 if(!c&&e?.constructor?.name==='Denied')c='AUTHZ_DENIED';
 if(!c&&e?.constructor?.name==='Unavailable')c='SERVICE_UNAVAILABLE';
 // pg-pool and application timeout errors have no code. Match known library text internally; never emit it.
 if(!c&&e?.message==='timeout exceeded when trying to connect')c='POOL_ACQUIRE_TIMEOUT';
 if(!c&&e?.message==='Connection terminated due to connection timeout')c='PG_CONNECTION_TIMEOUT';
 if(!c&&e?.message==='Connection terminated unexpectedly')c='CONNECTION_TERMINATED';
 return {name:allowedNames.has(e?.name)?e.name:'UnknownError',code:c??'UNKNOWN',...(code(e?.cause?.code)?{causeCode:code(e.cause.code)}:{})};
}
export function recordError(phase: string, error: unknown) {
 const r=context.getStore()?.request;if(!r||r.finished)return;
 if(typeof error==='object'&&error!==null){if(r.seenErrors.has(error))return;r.seenErrors.add(error);}
 if(r.errors.length>=MAX_ERRORS){r.droppedErrors++;return;}r.errors.push({phase,...safeError(error)});
}
function openSpan(name: string, attributes: Partial<Pick<Span,'sqlFingerprint'|'poolTotal'|'poolIdle'|'poolWaiting'>>={}) {
 const current=context.getStore();if(!current||current.request.finished)return;
 const r=current.request;if(r.spans.length>=MAX_SPANS){r.droppedSpans++;return;}
 const s:Span={id:r.spans.length,parentId:current.parentId,name,startMs:performance.now()-r.start,durationMs:0,exclusiveMs:0,...attributes};r.spans.push(s);
 let done=false;
 return {run:<T>(fn:()=>T)=>context.run({request:r,parentId:s.id},fn),end:(error?: unknown,result?: any)=>{if(done)return;done=true;s.durationMs=performance.now()-r.start-s.startMs;if(error){s.error=safeError(error);context.run(current,()=>recordError(name,error));}if(typeof result?.rowCount==='number')s.rowCount=result.rowCount;if(Array.isArray(result?.rows))s.returnedRows=result.rows.length;}};
}
export function span<T>(name: string, fn: ()=>Promise<T>): Promise<T> {
 const s=openSpan(name);if(!s)return fn();
 try{return s.run(fn).then(v=>{s.end();return v;},e=>{s.end(e);throw e;});}catch(e){s.end(e);throw e;}
}
export function spanSync<T>(name: string, fn: ()=>T): T {const s=openSpan(name);if(!s)return fn();try{const value=s.run(fn);s.end();return value;}catch(e){s.end(e);throw e;}}
export function instrumentMethods<T extends object>(target:T, methods:(keyof T)[], prefix:string) {
 if(!observing())return;
 for(const name of methods){const original=target[name];if(typeof original!=='function')continue;(target as any)[name]=function(this:T,...args:unknown[]){return span(prefix+'.'+String(name),()=>original.apply(this,args));};}
}
export function markTransportAbort(r: RequestTrace | undefined, statusCode=0) {
 if(!r||r.finished||r.transportAborted)return;r.transportAborted=true;
 withRequest(r,()=>recordError('http.transport',{name:'AbortError',code:'RESPONSE_CLOSED'}));
 try{r.sink({type:'request_transport_abort',schemaVersion:1,requestId:r.requestId,instance,pid:process.pid,at:new Date().toISOString(),elapsedMs:performance.now()-r.start});}catch{}
 if(r.handlerSettled)finishRequest(r,statusCode,'transport_abort');
}
export function settleRequest(r: RequestTrace | undefined,statusCode:number) {
 if(!r)return;r.handlerSettled=true;if(r.transportAborted)finishRequest(r,statusCode,'transport_abort');
}
export function finishRequest(r: RequestTrace | undefined,statusCode: number,outcome='response') {
 if(!r||r.finished)return;r.finished=true;const elapsedMs=performance.now()-r.start;r.spans[0]!.durationMs=elapsedMs;
 for(const s of r.spans){const end=s.startMs+s.durationMs;const intervals=r.spans.filter(c=>c.parentId===s.id).map(c=>[Math.max(s.startMs,c.startMs),Math.min(end,c.startMs+c.durationMs)] as const).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);let covered=0,last=s.startMs;for(const[a,b]of intervals){covered+=Math.max(0,b-Math.max(last,a));last=Math.max(last,b);}s.exclusiveMs=Math.max(0,s.durationMs-covered);}
 const record={type:'request_diagnostic',schemaVersion:1,requestId:r.requestId,instance,pid:process.pid,requestAt:r.requestAt,responseAt:new Date().toISOString(),statusCode,outcome,elapsedMs,spans:r.spans,errors:r.errors,droppedSpans:r.droppedSpans,droppedErrors:r.droppedErrors,eventLoopIntervalStart:r.intervalStart,eventLoopIntervalEnd:intervalId};
 try{r.sink(record);}catch{/* Diagnostics must not alter the business result. */}return record;
}
export function sqlFingerprint(sql:string):string {
 // Fingerprint only; normalized SQL itself never leaves this module. No parameters are accepted.
 const normalized=sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g,' ').replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g,'?').replace(/'(?:''|[^'])*'/g,'?').replace(/\$\d+/g,'?').replace(/\b\d+(?:\.\d+)?\b/g,'?').replace(/\s+/g,' ').trim().toLowerCase();
 return createHash('sha256').update(normalized).digest('hex');
}
/** Delegate to the original pg methods. Never replace Pool.query or its release(err) path. */
export function observePool(pool:pg.Pool) {
 const hooked=new WeakSet<object>();const connect=pool.connect;
 function hook(client:pg.PoolClient){if(hooked.has(client))return;hooked.add(client);const query=client.query;
  client.query=function(this:pg.PoolClient,...args:any[]):any{
   const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
   const s=openSpan('sql.roundtrip',typeof sql==='string'?{sqlFingerprint:sqlFingerprint(sql)}:{});if(!s)return (query as any).apply(this,args);
   const last=args.length-1;
   if(typeof args[last]==='function'){const cb=args[last];args[last]=function(this:unknown,error:unknown,result:any){s.end(error,result);return cb.call(this,error,result);};try{return s.run(()=>(query as any).apply(this,args));}catch(e){s.end(e);throw e;}}
   try{const result=s.run(()=>(query as any).apply(this,args));if(result?.then)return result.then((v:any)=>{s.end(undefined,v);return v;},(e:unknown)=>{s.end(e);throw e;});s.end();return result;}catch(e){s.end(e);throw e;}
  } as typeof client.query;
 }
 pool.connect=function(this:pg.Pool,...args:any[]):any{
  const current=context.getStore();const s=openSpan('pool.acquire',{poolTotal:pool.totalCount,poolIdle:pool.idleCount,poolWaiting:pool.waitingCount});const callback=args[0];
  if(typeof callback==='function')return (connect as any).call(this,function(this:unknown,error:unknown,client:pg.PoolClient,release:unknown){if(client)hook(client);s?.end(error);const invoke=()=>callback.call(this,error,client,release);return current?context.run(current,invoke):invoke();});
  const result=(connect as any).apply(this,args);return result.then((client:pg.PoolClient)=>{hook(client);s?.end();return client;},(error:unknown)=>{s?.end(error);throw error;});
 } as typeof pool.connect;
}
export function startEventLoopMonitor(side:'server'|'client',sink:(record:any)=>void=diagnosticSink,intervalMs=1000) {
 const histogram=monitorEventLoopDelay({resolution:10});histogram.enable();let previous=performance.eventLoopUtilization(),from=new Date().toISOString(),at=performance.now();
 function sample(){const now=performance.now(),to=new Date().toISOString(),current=performance.eventLoopUtilization(),delta=performance.eventLoopUtilization(current,previous);const record={type:'event_loop_interval',schemaVersion:1,side,instance,pid:process.pid,intervalId:++intervalId,from,to,durationMs:now-at,delayMeanMs:Number.isFinite(histogram.mean)?histogram.mean/1e6:null,delayP95Ms:histogram.count?histogram.percentile(95)/1e6:null,delayP99Ms:histogram.count?histogram.percentile(99)/1e6:null,delayMaxMs:histogram.count?histogram.max/1e6:null,utilization:delta.utilization,activeMs:delta.active,idleMs:delta.idle};try{sink(record);}catch{}histogram.reset();previous=current;from=to;at=now;}
 const timer=setInterval(sample,intervalMs);timer.unref();return ()=>{clearInterval(timer);sample();histogram.disable();};
}
