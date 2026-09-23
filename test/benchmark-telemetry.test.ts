import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {observedFetch} from '../scripts/benchmark-telemetry.js';
test('client retains correlation and response phase durations on success and abort',async()=>{
 const server=createServer((req,res)=>{if(req.url==='/slow'){setTimeout(()=>res.end('{}'),80);return;}res.setHeader('x-request-id',req.headers['x-request-id']!);res.end('{"ok":true}');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+(server.address() as any).port;
 try {const success=await observedFetch(url,{signal:AbortSignal.timeout(1000)},'client-success');assert.equal(success.body.ok,true);assert.equal(success.telemetry.requestId,'client-success');assert.equal(success.telemetry.serverRequestId,'client-success');for(const key of ['headersMs','bodyMs','parseMs'])assert.ok(success.telemetry[key]>=0);
 const failed=await observedFetch(url+'/slow',{signal:AbortSignal.timeout(5)},'client-abort');assert.equal(failed.telemetry.requestId,'client-abort');assert.equal(failed.telemetry.failurePhase,'headers');assert.equal(failed.telemetry.error.name,'TimeoutError');assert.equal(failed.telemetry.error.code,'CLIENT_TIMEOUT');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
