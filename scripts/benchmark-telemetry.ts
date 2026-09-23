import {safeError} from '../src/infrastructure/telemetry.js';
/** Keep the client-created ID even when no response headers ever arrive. */
export async function observedFetch(url:string,init:RequestInit,id:string):Promise<{res?:Response;body?:any;telemetry:any;error?:unknown}> {
 const telemetry:any={requestId:id,headersMs:null,bodyMs:null,parseMs:null};let phase='headers',at=performance.now();
 try {
  const headers=new Headers(init.headers);headers.set('x-request-id',id);
  const res=await fetch(url,{...init,headers});telemetry.headersMs=performance.now()-at;telemetry.serverRequestId=res.headers.get('x-request-id');telemetry.status=res.status;
  phase='body';at=performance.now();const text=await res.text();telemetry.bodyMs=performance.now()-at;
  phase='parse';at=performance.now();const body=JSON.parse(text);telemetry.parseMs=performance.now()-at;
  return {res,body,telemetry};
 }catch(error){telemetry[phase+'Ms']=performance.now()-at;telemetry.failurePhase=phase;telemetry.error=safeError(error);if(init.signal?.aborted)telemetry.error={...telemetry.error,code:init.signal.reason?.name==='TimeoutError'?'CLIENT_TIMEOUT':'CLIENT_ABORT'};return {telemetry,error};}
}
