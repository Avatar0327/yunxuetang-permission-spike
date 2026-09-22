import {createHash} from 'node:crypto';
/** Independent arithmetic oracle. No policy, compiler, repository or observed query inputs. */
export function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,k==='source_ids'&&Array.isArray(v)?[...v].sort():canonical(v)]));
 return value;
}
export function digest(value:unknown){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
const person=(j:number)=>'person-'+String(j).padStart(5,'0');
const dept=(j:number)=>1+(j-1)%1977;
const inCap=(j:number)=>j%3!==2;
function row(j:number,complex:boolean){
 const id=person(j),d=dept(j),sources:string[]=[];
 if(complex){if(d<=900)sources.push('role:bm-managed:personal-learning:report.personal-learning.view');if(d>=751&&d<=1350)sources.push('role:bm-extra:personal-learning:report.personal-learning.view');if(d===3)sources.push('role:bm-raw:personal-learning:report.personal-learning.view');}
 else sources.push('role:m-broad:personal-learning:report.personal-learning.view');
 return {id,person_id:id,phone:complex&&d===3?'phone-'+id:null,email:null,id_card:null,source_ids:sources.sort()};
}
export function scenarioTruth(){
 const fixed=['A','B','C','D','E','L','M','N','X','Y','Z'].map(id=>({id,person_id:id,phone:['A','C','M'].includes(id)?'phone-'+id:null,email:['A','C','M'].includes(id)?'email-'+id:null,id_card:['A','C','M'].includes(id)?'card-'+id:null,source_ids:['role:m-broad:personal-learning:report.personal-learning.view',...(['A','C','M'].includes(id)?['role:m-dept:personal-learning:report.personal-learning.view']:[])].sort()}));
 const complexPeople:number[]=[];for(let j=1;j<=49987;j++)if(dept(j)<=1350&&inCap(j))complexPeople.push(j);
 const broad=fixed.filter(r=>!['X','Y','Z'].includes(r.id)).concat(Array.from({length:42},(_,n)=>row(n+1,false))),constrained=complexPeople.slice(0,50).map(j=>row(j,true));
 const groups=[new Map<string,any>(),new Map<string,any>()];
 for(let n=1;n<=1000000;n++){
  const j=1+(n-1)%49987,d='old-dept-'+n%20,job='old-job-'+n%5,status=n%7===0?'disabled':'enabled',key=JSON.stringify([d,job,status]);
  for(let g=0;g<2;g++){if(g===1&&!(dept(j)<=1350&&inCap(j)))continue;const map=groups[g]!,v=map.get(key)??{historical_department_id:d,historical_job_id:job,historical_status:status,count:0,points:'0'};v.count++;v.points=String(Number(v.points)+1);map.set(key,v);}
 }
 for(const [d,p] of [['old-A',10],['old-B',20]] as const)groups[0]!.set(d,{historical_department_id:d,historical_job_id:null,historical_status:'enabled',count:1,points:String(p)});
 const ordered=(g:number)=>[...groups[g]!.values()].sort((a,b)=>{for(const k of ['historical_department_id','historical_job_id','historical_status']){const av=a[k],bv=b[k];if(av!==bv)return av===null?1:bv===null?-1:av<bv?-1:1;}return 0;});
 const definitions={
  'list-broad':{path:'/report?limit=50',actor:'M',history:false,count:49998,rows:broad},
  'list-constrained':{path:'/report?limit=50',actor:'person-00003',history:false,count:complexPeople.length,rows:constrained},
  'history-broad':{path:'/history?groupBy=department,job,status',actor:'M',history:true,count:1000002,rows:ordered(0)},
  'history-constrained':{path:'/history?groupBy=department,job,status',actor:'person-00003',history:true,count:ordered(1).reduce((n,r)=>n+r.count,0),rows:ordered(1)}
 };
 return {formatVersion:1,algorithm:'Independent loops over j=1..49987 and n=1..1000000; department=1+(j-1)%1977; company=[I,A,B][j%3]. Complex source union departments1..1350 intersect companies I/A; role1<=900, role2=751..1350, phone only own wide-3. Historical department/job/status=n%20,n%5,n%7. Fixed11 current people and2 history facts are literal seed constants; database en_US ordering puts person-* between N and X, so firstpage has A,B,C,D,E,L,M,N plus bulk1..42.',canonicalization:'Object keys sorted recursively; array order retained except source_ids lexically sorted, duplicates retained; SHA-256 over complete {count,rows}, no field stripping.',scenarios:Object.fromEntries(Object.entries(definitions).map(([name,s])=>[name,{path:s.path,actor:s.actor,history:s.history,expectedCount:s.count,rowCount:s.rows.length,expectedRows:s.rows,resultDigest:digest({count:s.count,rows:s.rows})}]))};
}
