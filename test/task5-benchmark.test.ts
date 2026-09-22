import test from 'node:test';
import {scenarioTruth,digest} from '../scripts/benchmark-truth.js';
import {start,observe} from './task3-helper.js';
import {pool} from '../src/infrastructure/db.js';
const truth=scenarioTruth();
for(const candidate of ['native','casbin'])test(`${candidate}: independent benchmark complete result oracle`,async t=>{
 const api=await start(candidate);
 try{for(const [name,s] of Object.entries(truth.scenarios))await t.test(name,async()=>{
  const result=await api.request('GET',s.path,undefined,s.actor);await observe(candidate,name+' status',200,result.status);
  await observe(candidate,name+' complete IDs fields groups sums',s.resultDigest,digest({count:result.body.count,rows:result.body.rows}));
 });}finally{await api.close();}
});
test.after(()=>pool.end());
