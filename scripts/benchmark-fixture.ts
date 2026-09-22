import type {Membership,NodePolicy,DelegationCap} from '../src/authz/contracts.js';
/** Seed-only workload. Kept distinct from the arithmetic observation oracle. */
export function benchmarkMemberships():Membership[]{
 const departments=(lo:number,hi:number)=>Array.from({length:hi-lo+1},(_,n)=>'wide-'+(lo+n));
 const ids=(lo:number,hi:number)=>Array.from({length:49987},(_,n)=>n+1).filter(j=>{const d=1+(j-1)%1977;return d>=lo&&d<=hi&&j%3!==2;}).map(j=>'person-'+String(j).padStart(5,'0'));
 const make=(id:string,role:string,lo:number,hi:number,managed=false):Membership=>{
  const scope=managed?{kind:'managed' as const}:{kind:'departments' as const,departmentIds:departments(lo,hi)};
  const policies:NodePolicy[]=[{nodeId:'personal-learning',navigation:true,actions:['report.personal-learning.view'],scope,rawFields:[],delegableActions:[]},{nodeId:'history',navigation:true,actions:['report.history.view'],scope,rawFields:[],delegableActions:[]}];
  const people=ids(lo,hi),caps:DelegationCap[]=[{nodeId:'personal-learning',action:'report.personal-learning.view',objectIds:people,rawFields:[]},{dimension:'person-company-v1',nodeId:'history',action:'report.history.view',objectIds:people.flatMap(p=>['I','A'].map(company=>JSON.stringify([p,company]))),rawFields:[]}];
  return {id,tenantId:'T1',personId:'person-00003',roleId:role,level:2,active:true,provenance:'system_origin',policies,delegation:{sourceMembershipId:'admin',sourceActorId:'Z',revision:1,caps},...(managed?{jurisdiction:{kind:'departments' as const,departmentIds:departments(1,1200)},overrides:['personal-learning','history'].map(nodeId=>({membershipId:id,nodeId,scope:{kind:'departments' as const,departmentIds:departments(lo,hi)}}))}:{})};
 };
 return [make('bm-managed','role-5',1,900,true),make('bm-extra','role-6',751,1350),{id:'bm-raw',tenantId:'T1',personId:'person-00003',roleId:'role-7',level:3,active:true,provenance:'system_origin',policies:[{nodeId:'personal-learning',navigation:true,actions:['report.personal-learning.view'],scope:{kind:'ownDept'},rawFields:['phone'],delegableActions:[]}]}];
}
