import test from 'node:test';
import assert from 'node:assert/strict';
import {checkObservation} from '../scripts/benchmark-observation.js';
import {digest} from '../scripts/benchmark-truth.js';
const expected={expectedCount:1,rowCount:1,resultDigest:digest({count:1,rows:[{id:'expected',phone:null}]})};
function body(){return {count:1,rows:[{id:'expected',phone:null}],meta:{candidate:'native',instance:'A',elapsedMs:2,queryCount:14},evidence:{permissionMs:1,dataMs:1,cache:'L1',revision:2}};}
test('measurement rejects complete-result corruption including extra fields and group sums',()=>{
 for(const modify of [(b:any)=>b.rows[0].id='wrong',(b:any)=>b.rows[0].phone='private',(b:any)=>b.rows[0].extra='unrequested',(b:any)=>b.rows[0].points=99,(b:any)=>b.count=2]){const b=body();modify(b);assert.equal(checkObservation(b,200,expected,'native','hot','success').classification,'authorization_error');}
});
test('measurement rejects nonfinite/missing timings candidate and cache labels',()=>{
 for(const modify of [(b:any)=>delete b.evidence.permissionMs,(b:any)=>b.evidence.dataMs=NaN,(b:any)=>b.meta.queryCount=Infinity,(b:any)=>b.meta.candidate='casbin',(b:any)=>b.evidence.cache='cold']){const b=body();modify(b);assert.equal(checkObservation(b,200,expected,'native','hot','success').classification,'measurement_error');}
 const good=checkObservation(body(),200,expected,'native','hot','success');assert.equal(good.classification,'success');assert.equal(good.actualCount,1);assert.equal(good.rowCount,1);assert.equal(good.resultDigest,expected.resultDigest);
});
