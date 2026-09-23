"""Same-server-clock disjoint attribution for client-p95-selected requests. Never subtract incompatible duration clocks to manufacture wire time."""
from pathlib import Path
from collections import Counter,defaultdict
import gzip,json,math,sys

def quantile(values,p):
 values=sorted(values);return values[min(len(values)-1,math.ceil(len(values)*p)-1)] if values else None

def partition(trace):
 spans={s['id']:s for s in trace['spans']};root=spans[0];duration=root['durationMs'];ends=[];depth={}
 def dep(i):
  if i not in depth:depth[i]=0 if spans[i]['parentId'] is None else 1+dep(spans[i]['parentId'])
  return depth[i]
 def label(i):
  s=spans[i];names=[s['name']+('['+s['sqlFingerprint'][:12]+']' if s.get('sqlFingerprint') else '')];parent=s['parentId']
  if s['name'] in ['sql.roundtrip','pool.acquire']:
   while parent is not None:
    a=spans[parent]
    if a['name']!='request':names.append(a['name']);break
    parent=a['parentId']
  return '@'.join(names)
 for i,s in spans.items():
  dep(i);a=max(0,s['startMs']);b=min(duration,s['startMs']+s['durationMs'])
  if b>a:ends.extend([(a,1,i),(b,-1,i)])
 ends.sort();active=set();last=0;totals=Counter();parallel=0
 for at,kind,i in ends:
  if at>last:
   if active:
    # Pick terminal active spans; unrelated concurrent leaves are explicit overlap, counted once.
    parents={spans[x]['parentId'] for x in active};leaves=active-parents
    names=sorted(set(label(x) for x in leaves));name=names[0] if len(names)==1 else 'parallel_overlap['+'|'.join(names)+']'
    if len(names)>1:parallel+=at-last
   else:name='unobserved_server'
   totals[name]+=at-last
  if kind==1:active.add(i)
  else:active.discard(i)
  last=at
 if last<duration:totals['unobserved_server']+=duration-last
 assert abs(sum(totals.values())-duration)<max(.05,duration*1e-6)
 return dict(totals),parallel

def read_window(folder):
 diagnostics={};loops=[];duplicates=[];loss=0;late=[]
 for file in [folder/'yxt-api-a.log',folder/'yxt-api-b.log']:
  for line in file.read_text().splitlines():
   if not line.startswith('{'):continue
   try:r=json.loads(line)
   except ValueError:continue
   loss=max(loss,r.get('diagnosticDroppedRecords',0))
   if r.get('type')=='request_diagnostic':
    if r['requestId'] in diagnostics:duplicates.append(r['requestId'])
    diagnostics[r['requestId']]=r
   elif r.get('type')=='event_loop_interval':loops.append(r)
   elif 'late' in r.get('type','') or r.get('type')=='request_transport_abort':late.append(r)
 with gzip.open(folder/'measurement/samples.jsonl.gz','rt') as f:samples=[json.loads(x) for x in f]
 return diagnostics,loops,samples,duplicates,loss,late

def analyze(folder):
 diagnostics,loops,samples,duplicates,loss,late=read_window(folder);groups=defaultdict(list);failures=[];missing=[];invalid=[]
 for r in samples:
  d=diagnostics.get(r.get('requestId'))
  if d is None:missing.append(r.get('requestId',r['requestIndex']))
  if r['classification']!='success':
   errors=d.get('errors',[]) if d else []
   specific=[e for e in errors if e.get('code') not in [None,'UNKNOWN','SERVICE_UNAVAILABLE','AUTHZ_DENIED','RESPONSE_CLOSED','CLIENT_TIMEOUT','CLIENT_ABORT']]
   failures.append({'requestIndex':r['requestIndex'],'requestId':r.get('requestId'),'scenario':r['scenario'],'status':r.get('status'),'clientError':r.get('error'),'clientTelemetry':{k:r.get(k) for k in ['failurePhase','failureCode','headersMs','bodyMs','parseMs','serverRequestId']},'serverErrors':errors,'specificSignals':specific,'hasServerDiagnosis':bool(specific),'diagnosis_requires_review':True,'serverOutcome':d.get('outcome') if d else None})
   continue
  if not d:continue
  if d.get('droppedSpans',0) or d.get('droppedErrors',0):invalid.append(r['requestId'])
  try:parts,overlap=partition(d)
  except (ValueError,KeyError,RecursionError,AssertionError) as e:invalid.append({'id':r.get('requestId'),'error':type(e).__name__});continue
  groups[r['scenario']].append({'sample':r,'trace':d,'parts':parts,'overlapMs':overlap})
 results={}
 for name,items in groups.items():
  items.sort(key=lambda x:x['sample']['elapsedMs']);n=len(items);at=min(n-1,math.ceil(.95*n)-1);near=items[at];lo=max(0,math.ceil(.9*n)-1);hi=max(lo+1,math.ceil(.99*n));cohort=items[lo:hi];sums=Counter()
  for x in cohort:sums.update(x['parts'])
  cohort_total=sum(x['trace']['elapsedMs'] for x in cohort)
  def shares(parts,total):
   cumulative=0;rows=[]
   for k,v in sorted(parts.items(),key=lambda x:-x[1]):
    cumulative+=v;rows.append({'component':k,'ms':v,'percent':v/total*100 if total else 0,'cumulativePercent':cumulative/total*100 if total else 0})
   return rows
  rows=shares(near['parts'],near['trace']['elapsedMs']);cover=[]
  for row in rows:
   cover.append(row)
   if row['cumulativePercent']>=80:break
  results[name]={'successful_matched_requests':n,'http_p95_ms':near['sample']['elapsedMs'],'selected_request_server_elapsed_ms':near['trace']['elapsedMs'],'selected_request_signed_client_minus_server_ms':near['sample']['elapsedMs']-near['trace']['elapsedMs'],'share_denominator':'same-server-clock elapsedMs, NOT cross-clock client HTTP elapsedMs','permission_p95_ms':quantile([x['sample']['permissionMs'] for x in items],.95),'representative_p95_requestId':near['sample']['requestId'],'p95_request_parts':rows,'contributors_reaching_80percent':cover,'tail_cohort':'p90 through p99 ordered by complete successful request HTTP latency','tail_cohort_size':len(cohort),'tail_cohort_total_server_ms':cohort_total,'tail_cohort_total_client_ms':sum(x['sample']['elapsedMs'] for x in cohort),'tail_cohort_parts':shares(dict(sums),cohort_total),'permission_limit_ms':50,'list_limit_ms':500,'history_limit_ms':2000}
 return {'window':str(folder),'matched_requests':len(samples)-len(missing),'total_requests':len(samples),'missing_diagnostics':missing,'duplicate_diagnostics':duplicates,'dropped_diagnostics_counter':loss,'invalid_spans_or_duration_relations':invalid,'scenarios':results,'failures':failures,'server_event_loop_intervals':loops,'late_events':late,'limitations':['sql.roundtrip includes driver parameter encoding/server/wire/result parse, not pure DB CPU','pool.acquire includes queued wait and connection setup','eventloop intervals overlap await/synchronous stages and are not added to criticalpath totals','Host and Colima monotonic durations differ; raw signed differences are retained only as diagnostics. Percentages use same-server-clock totals for the actual client-p95-ranked request, not a claimed exact decomposition of client HTTP latency','historical missing rootcauses cannot be retroactively assigned from this experiment']}
if __name__=='__main__':
 result=analyze(Path(sys.argv[1]));Path(sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['window','matched_requests','total_requests','dropped_diagnostics_counter']},ensure_ascii=False))
