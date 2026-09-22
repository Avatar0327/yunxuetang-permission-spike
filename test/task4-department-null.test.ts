import test from 'node:test';
import {pool} from '../src/infrastructure/db.js';
import {start,observe} from './task3-helper.js';
for(const candidate of ['native','casbin'])test(`${candidate}: ordinary person command retains required main department`,async()=>{const api=await start(candidate);try{const r=await api.request('POST','/people/B',{departmentId:null});await observe(candidate,'normal command rejects missing required main department',403,r.status);}finally{await api.request('POST','/people/B',{departmentId:'D2',managerId:'M'});await api.close();}});
test.after(()=>pool.end());
