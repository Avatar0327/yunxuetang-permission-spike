"""Supplement disjoint stage1 attribution; permission timeline is observed spans, not sum of percentiles."""
from pathlib import Path
from collections import Counter,defaultdict
import importlib.util,json,sys,math
from datetime import datetime
spec=importlib.util.spec_from_file_location('attr',Path('tools/native-attribution.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
q=mod.quantile

def stats(a):return {'n':len(a),'p50':q(a,.5),'p95':q(a,.95),'p99':q(a,.99),'max':max(a) if a else None}
def window(folder):
 ds,loops,samples,dups,loss,late=mod.read_window(folder);groups=defaultdict(list);sql=defaultdict(list);pools=defaultdict(list);failures=[];bad=[];missingrows=0;phaseDurations=defaultdict(list)
 def permission(d):
  spans=d['spans'];roots=[s for s in spans if s['name'] in ['authority.token','authority.plan','report.compile']];parts=Counter();observed=0
  for root in roots:
   ids={root['id']}
   for s in spans:
    if s['parentId'] in ids:ids.add(s['id'])
   remap={x:i for i,x in enumerate(sorted(ids))};sub=[]
   for s in spans:
    if s['id'] in ids:sub.append({**s,'id':remap[s['id']],'parentId':None if s['id']==root['id'] else remap[s['parentId']],'startMs':s['startMs']-root['startMs']})
   sub[0]['startMs']=0
   p,overlap=mod.partition({'spans':sub});parts.update(p);observed+=root['durationMs']
  return dict(parts),observed
 for r in samples:
  d=ds.get(r['requestId'])
  if d is None:bad.append({'id':r['requestId'],'reason':'missing'});continue
  if d['droppedSpans'] or d['droppedErrors'] or d.get('diagnosticDroppedRecords'):bad.append({'id':r['requestId'],'reason':'dropped'})
  if r.get('serverRequestId') and r['serverRequestId']!=r['requestId']:bad.append({'id':r['requestId'],'reason':'echo_mismatch'})
  index={s['id']:s for s in d['spans']}
  perRequestPhases=Counter()
  for sp in d['spans']:perRequestPhases[sp['name']]+=sp['durationMs']
  for phaseName,duration in perRequestPhases.items():phaseDurations[(r['scenario'],r['classification'],phaseName)].append(duration)
  for s in d['spans']:
   if s['name']=='sql.roundtrip':
    phase=index.get(s['parentId'],{}).get('name');key=(r['scenario'],phase,s.get('sqlFingerprint'),s.get('error',{}).get('code','success'));sql[key].append(s)
    if not s.get('error') and 'returnedRows' not in s:missingrows+=1
   elif s['name']=='pool.acquire':pools[r['scenario']].append(s)
  if r['classification']!='success':
   concrete=[e for e in d['errors'] if e.get('code') not in [None,'UNKNOWN','SERVICE_UNAVAILABLE','RESPONSE_CLOSED','AUTHZ_DENIED']]
   cause=concrete[0]['code'] if concrete else None
   failures.append({'requestId':r['requestId'],'requestIndex':r['requestIndex'],'scenario':r['scenario'],'status':r.get('status'),'clientFailure':r.get('error'),'cause':cause,'originalErrors':d['errors'],'failingSpans':[s for s in d['spans'] if s.get('error')],'outcome':d['outcome'],'serverElapsedMs':d['elapsedMs']});continue
  parts,observed=permission(d);groups[r['scenario']].append({'requestId':r['requestId'],'permissionMs':r['permissionMs'],'observedPermissionMs':observed,'metricDifferenceMs':r['permissionMs']-observed,'parts':parts})
 results={}
 for name,rows in groups.items():
  rows.sort(key=lambda r:r['permissionMs']);n=len(rows);p95=rows[min(n-1,math.ceil(n*.95)-1)];tail=rows[max(0,math.ceil(.90*n)-1):max(1,math.ceil(.99*n))];total=sum(x['observedPermissionMs'] for x in tail);agg=Counter()
  for x in tail:agg.update(x['parts'])
  def shares(p,total):
   out=[];cum=0
   for k,v in sorted(p.items(),key=lambda kv:-kv[1]):cum+=v;out.append({'component':k,'ms':v,'percent':v/total*100,'cumulativePercent':cum/total*100})
   return out
  results[name]={'representative':{**p95,'parts':shares(p95['parts'],p95['observedPermissionMs'])},'tailCount':len(tail),'tailParts':shares(agg,total),'metricVsObservedDifference':stats([x['metricDifferenceMs'] for x in rows])}
 sqlrows=[{'scenario':k[0],'parent':k[1],'fingerprint':k[2],'outcome':k[3],'roundtripMs':stats([s['durationMs'] for s in spans]),'returnedRows':dict(Counter(s.get('returnedRows') for s in spans))} for k,spans in sql.items()]
 poolrows={k:{'waitMs':stats([s['durationMs'] for s in spans]),'saturationSnapshotCount':sum(s.get('poolWaiting',0)>0 or s.get('poolIdle',0)==0 and s.get('poolTotal',0)>=20 for s in spans),'maxQueue':max(s.get('poolWaiting',0) for s in spans),'errors':dict(Counter(s.get('error',{}).get('code') for s in spans if s.get('error')))} for k,spans in pools.items()}
 clientloops=[json.loads(x) for x in (folder/'measurement/event-loop.jsonl').read_text().splitlines()];looprows={}
 summary=json.loads((folder/'measurement/summary.json').read_text());begin=datetime.fromisoformat(summary['startAt'].replace('Z','+00:00'));end=datetime.fromisoformat(summary['endAt'].replace('Z','+00:00'))
 def intersects(r):return datetime.fromisoformat(r['to'].replace('Z','+00:00'))>=begin and datetime.fromisoformat(r['from'].replace('Z','+00:00'))<=end
 loops=[r for r in loops if intersects(r)];clientloops=[r for r in clientloops if intersects(r)]
 for side,rr in [('server',loops),('client',clientloops)]:
  for inst in sorted(set(r['instance'] for r in rr)):
   lr=[r for r in rr if r['instance']==inst];looprows[side+':'+inst]={'intervals':len(lr),'intervalP95DelayMsDistribution':stats([r['delayP95Ms'] for r in lr if r.get('delayP95Ms') is not None]),'intervalMaxDelayMsDistribution':stats([r['delayMaxMs'] for r in lr if r.get('delayMaxMs') is not None]),'utilizationDistribution':stats([r['utilization'] for r in lr]),'dropped':max(r.get('droppedIntervals',r.get('diagnosticDroppedRecords',0)) for r in lr)}
 return {'window':str(folder),'permission':results,'inclusivePhaseDurations':[{'scenario':k[0],'classification':k[1],'phase':k[2],'durationMs':stats(v)} for k,v in phaseDurations.items()],'sql':sqlrows,'pool':poolrows,'eventLoops':looprows,'failureCauses':dict(Counter(r['cause'] for r in failures)),'failures':failures,'invalid':bad,'sqlMissingReturnedRows':missingrows,'notes':['Permission shares use observed authority.token+authority.plan+report.compile spans, disjoint within each root; gate retains original permissionMs. Difference explicitly reported. inclusivePhaseDurations is each request summed occurrences of a named span, inclusive of children; never sum across phases or sum independent phase p95s.','Event-loop percentile distribution is across intervals intersecting measured client start/end window; boundary intervals can partially include prewarm/drain, not pooled per-request event-loop percentile. pool saturation count is a snapshot indicator; acquire duration includes queue/connect/scheduling.','Failure cause names denote actual terminal boundary/error, not an unsupported deeper CPU diagnosis.']}
if __name__=='__main__':
 out=window(Path(sys.argv[1]));Path(sys.argv[2]).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'window':out['window'],'invalid':len(out['invalid']),'failureCauses':out['failureCauses'],'sqlMissingReturnedRows':out['sqlMissingReturnedRows']},ensure_ascii=False))
