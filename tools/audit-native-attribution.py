"""Read-only independent audit. Does not import controller attribution functions."""
import sys,json,gzip,math,re
from pathlib import Path
from collections import Counter,defaultdict
from datetime import datetime

def audit_transport(r,d,events,location,expected_instance,expected_url):
 """Independently validate the observed cold constrained-history header-timeout shape.

 No response metadata is imputed. This narrow branch accepts only completed SQL
 traces with a matched close event, or the documented server503/client-timeout race.
 It does not establish a lower-level platform clock/scheduling cause.
 """
 errors=[]
 def check(ok,kind,detail=None):
  if not ok:errors.append({'kind':kind,'detail':detail})
 def finite(n):return type(n) in (int,float) and math.isfinite(n)
 rid=r.get('requestId');spans=d.get('spans',[]);ix={s['id']:s for s in spans}
 sql=[s for s in spans if s.get('name')=='sql.roundtrip'];terminal=sql[-1] if sql else {}
 result={'issues':errors,'clientCategory':'CLIENT_TIMEOUT_HEADERS','serverBoundaryCode':terminal.get('error',{}).get('code'),
  'clientQueryCount':None,'observedSqlCount':len(sql),'queryCountComparison':'unavailable_client_metadata',
  'clientMetadataAvailability':'no_response_headers_or_body','identityMatchMethod':'outgoing_header_id_to_unique_trace_and_expected_route',
  'abortEvents':events,'traceLocation':location,'terminalSql':terminal,'activeSpanIdsAtAbort':[],
  'clockMechanism':'unresolved; separate client/server time domains; no latency correction'}
 check(r.get('classification')=='failure' and r.get('failurePhase')=='headers' and r.get('error')=={'name':'TimeoutError','code':'CLIENT_TIMEOUT'},'transport_client_shape')
 check(r.get('scenario')=='history-constrained' and r.get('configuredCache')=='cold','unreviewed_transport_scenario')
 check(all(k not in r for k in ('status','serverRequestId','instance','queryCount','serverRequestAt','serverResponseAt')),'transport_unexpected_response_metadata')
 check(all(k in r and r[k] is None for k in ('bodyMs','parseMs')),'transport_body_or_parse_observed')
 check(finite(r.get('headersMs')) and finite(r.get('elapsedMs')) and 20000<=r['headersMs']<=r['elapsedMs'],'transport_deadline_timing')
 check(rid==d.get('requestId') and bool(rid),'transport_trace_id')
 check(r.get('instanceUrl')==expected_url and d.get('instance')==expected_instance,'transport_expected_route')
 check(Path(location['file']).name==('yxt-api-a.log' if expected_instance=='A' else 'yxt-api-b.log'),'transport_trace_file')
 check(d.get('droppedSpans')==d.get('droppedErrors')==d.get('diagnosticDroppedRecords')==0,'transport_trace_drops')
 check(len(spans)==len(ix) and [s['id'] for s in spans]==list(range(len(spans))),'transport_span_ids')
 root=ix.get(0,{})
 check(root.get('name')=='request' and root.get('parentId') is None and root.get('startMs')==0 and root.get('durationMs')==d.get('elapsedMs'),'transport_root_closure')
 structurally_valid=True
 for s in spans:
  valid=finite(s.get('startMs')) and finite(s.get('durationMs')) and s['startMs']>=0 and s['durationMs']>0
  check(valid,'transport_unfinished_or_invalid_span',s['id']);structurally_valid=structurally_valid and valid
  parent=s.get('parentId');seen={s['id']}
  while parent is not None:
   if parent not in ix or parent in seen:check(False,'transport_invalid_ancestry',s['id']);structurally_valid=False;break
   seen.add(parent);parent=ix[parent].get('parentId')
  if s['parentId'] is not None and s['parentId'] in ix and valid:
   p=ix[s['parentId']]
   if finite(p.get('startMs')) and finite(p.get('durationMs')):
    check(p['startMs']<=s['startMs']+1e-5 and s['startMs']+s['durationMs']<=p['startMs']+p['durationMs']+1e-5,'transport_child_outside_parent',s['id'])
 for s in sql:
  check(bool(re.fullmatch('[0-9a-f]{64}',s.get('sqlFingerprint',''))),'transport_sql_fingerprint',s['id'])
  if not s.get('error'):check(type(s.get('returnedRows')) is int and s['returnedRows']>=0,'transport_sql_completion_rows',s['id'])
 check(len(sql)==15,'transport_observed_query_count',len(sql))
 check(ix.get(terminal.get('parentId'),{}).get('name')=='report.list','transport_terminal_sql_parent')
 serial=[s for s in spans if s['name']=='response.serialize']
 check(len(serial)==1 and bool(terminal) and serial[0]['startMs']>=terminal['startMs']+terminal['durationMs'],'transport_post_sql_serialization')
 if not structurally_valid or not terminal:return result
 failed=[s for s in spans if s.get('error')];server_errors=d.get('errors',[])
 concrete=[e for e in server_errors if e.get('code') not in ('RESPONSE_CLOSED','SERVICE_UNAVAILABLE')]
 code=terminal.get('error',{}).get('code');close=[e for e in server_errors if e.get('code')=='RESPONSE_CLOSED']
 if code is None:
  check(not failed and not concrete and server_errors==[{'phase':'http.transport','name':'AbortError','code':'RESPONSE_CLOSED'}],'transport_successful_sql_error_shape')
  check(d.get('statusCode')==200 and d.get('outcome')=='transport_abort','transport_completed_sql_outcome')
 else:
  check(code=='57014' and len(concrete)==1 and concrete[0].get('phase')=='sql.roundtrip' and concrete[0].get('code')==code,'transport_original_sql_cancel')
  leaves=[s for s in failed if not any(t['parentId']==s['id'] for t in failed)]
  check(len(leaves)==1 and leaves[0]['id']==terminal['id'],'transport_terminal_failed_leaf')
  ancestry=set();p=terminal.get('id')
  while p is not None and p in ix:ancestry.add(p);p=ix[p]['parentId']
  check(all(s['id'] in ancestry and s['error'].get('code') in ('57014','SERVICE_UNAVAILABLE') for s in failed),'transport_cancel_ancestry')
  check(d.get('statusCode')==503,'transport_cancel_server_status')
 if d.get('outcome')=='transport_abort':
  check(len(events)==1,'transport_abort_event_count',len(events))
  check(close==[{'phase':'http.transport','name':'AbortError','code':'RESPONSE_CLOSED'}],'transport_original_close_error')
  if len(events)==1:
   event=events[0];a=event['record'];at=a.get('elapsedMs')
   check(a.get('type')=='request_transport_abort' and a.get('requestId')==rid and a.get('instance')==d.get('instance') and a.get('pid')==d.get('pid'),'transport_abort_identity')
   check(a.get('diagnosticDroppedRecords')==0,'transport_abort_drops')
   check(Path(event['file']).name==Path(location['file']).name and event['line1Based']<location['line'],'transport_abort_log_order')
   in_root=finite(at) and 0<=at<=d.get('elapsedMs',-1);check(in_root,'transport_abort_time')
   if in_root:
    check(bool(terminal) and terminal['startMs']<at<terminal['startMs']+terminal['durationMs'],'transport_sql_pending_at_abort')
    result['activeSpanIdsAtAbort']=[s['id'] for s in spans if s['startMs']<=at<s['startMs']+s['durationMs']]
    result['abortToSqlSettlementServerMs']=terminal['startMs']+terminal['durationMs']-at
  result['reason']='Client20s header deadline expired; server observed close while history SQL roundtrip was pending, then '+('SQL cancellation57014 was recorded.' if code else 'SQL completed successfully; attempted200 was not received.')
 elif d.get('outcome')=='response':
  check(not events and not close and code=='57014','transport_server_response_race_shape')
  result['reason']='Client20s header deadline expired; server recorded terminal SQL cancellation57014 and503 response completion, but client received no headers. Cross-clock delivery order and platform cause unresolved.'
 else:check(False,'unreviewed_transport_outcome',d.get('outcome'))
 return result

def main():
 import argparse
 parser=argparse.ArgumentParser()
 parser.add_argument('window',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--supplement',type=Path)
 args=parser.parse_args();F=args.window;OUT=args.output;issues=[];notices=[]
 def issue(kind,identity=None,detail=None):issues.append({'kind':kind,'id':identity,'detail':detail})
 def ck(condition,kind,identity=None,detail=None):
  if not condition:issue(kind,identity,detail)
 def near(a,b):return math.isfinite(a) and math.isfinite(b) and abs(a-b)<=max(1e-5,abs(b)*1e-9)
 def load(p):return json.loads(p.read_text())
 def stamp(x):return datetime.fromisoformat(x.replace('Z','+00:00')).timestamp()
 def percentile(a,p):return sorted(a)[math.ceil(len(a)*p)-1] if a else None
 def stats(a):return {'n':len(a),'min':min(a) if a else None,'p50':percentile(a,.5),'p95':percentile(a,.95),'p99':percentile(a,.99),'max':max(a) if a else None}
 def finite(x):return isinstance(x,(int,float)) and math.isfinite(x)
 summary=load(F/'measurement/summary.json'); attr=load(F/'attribution.json'); supp=load(args.supplement or F/'supplement.json'); revised=load(F/'server-clock-attribution.json');truth=load(F/'measurement/scenario-truth.json')
 with gzip.open(F/'measurement/samples.jsonl.gz','rt') as h:samples=[json.loads(line) for line in h]
 prewarm=load(F/'measurement/prewarm.json') if (F/'measurement/prewarm.json').exists() else []
 ds={}; locations={}; serverloops=[]; aborts=[]; abort_locations=defaultdict(list); transport_inventory=[]; counters=defaultdict(list); nonjson=Counter(); unknown=[]; processes=defaultdict(set)
 for fn in ['yxt-api-a.log','yxt-api-b.log']:
  with (F/fn).open() as h:
   for lineno,line in enumerate(h,1):
    if not line.lstrip().startswith('{'):nonjson[fn]+=1;continue
    try:r=json.loads(line)
    except ValueError:issue('malformed_json',fn,lineno);continue
    key=(r.get('instance'),r.get('pid'));processes[fn].add(key)
    counters[str(key)].append(r.get('diagnosticDroppedRecords',0))
    if r.get('type')=='request_diagnostic':
     rid=r['requestId'];ck(rid not in ds,'duplicate_server_id',rid);ds[rid]=r;locations[rid]={'file':str(F/fn),'line':lineno}
    elif r.get('type')=='event_loop_interval':serverloops.append(r)
    elif r.get('type')=='request_transport_abort':
     aborts.append(r);abort_locations[r['requestId']].append({'file':str(F/fn),'line1Based':lineno,'record':r})
    elif r.get('ready') is True:ck(r.get('candidate')=='native','startup_candidate',fn)
    else:unknown.append({'file':fn,'line':lineno,'type':r.get('type')})
 clientloops=[json.loads(x) for x in (F/'measurement/event-loop.jsonl').read_text().splitlines()]
 for key,a in counters.items():ck(max(a,default=0)==0,'server_diagnostic_drops',key,max(a,default=0));ck(a==sorted(a),'nonmonotonic_drop_counter',key)
 ids=[r['requestId'] for r in samples];indexes=[r['requestIndex'] for r in samples]
 ck(len(ids)==len(set(ids)),'duplicate_client_id');ck(sorted(indexes)==list(range(len(samples))),'client_index_sequence');ck(summary['total']==len(samples),'sample_count_summary')
 ck(summary['configuredSeconds']>=600 and summary['concurrency']==50 and summary['durationMs']>=600000,'reference_window_config')
 ck(summary['candidate']=='native' and summary['phase']=='success' and summary['scenario']=='mixed','normal_native_config')
 ck(set(r['clientId'] for r in samples)==set(range(50)),'client_ids')
 ck(summary['clientLoopDroppedIntervals']==0,'client_loop_summary_drops')
 ck(all(r.get('droppedIntervals',0)==0 for r in clientloops),'client_loop_drops')
 ck(len(set(p['requestId'] for p in prewarm))==len(prewarm),'duplicate_prewarm_id')
 measured=set(ids); preids={r['requestId'] for r in prewarm}; extras=set(ds)-measured-preids
 extra_details=[{'id':rid,'status':ds[rid]['statusCode'],'spans':[s['name'] for s in ds[rid]['spans']],'at':ds[rid]['requestAt']} for rid in sorted(extras)]
 ck(not(measured&preids),'measured_prewarm_overlap')
 # Extras are retained readiness requests; disclose, do not silently discard.
 for p in prewarm:
  d=ds.get(p['requestId']);ck(d is not None,'missing_prewarm_trace',p['requestId'])
  if d:ck(d['statusCode']==p['status']==200 and p['classification']=='success','prewarm_status',p['requestId'])
 ck(not attr['missing_diagnostics'] and not attr['duplicate_diagnostics'],'controller_identity_flags')
 for flag in attr['invalid_spans_or_duration_relations']:ck(isinstance(flag,dict) and 'negative_client_server_duration_residual_ms' in flag,'controller_structural_invalid_flag',None,flag)
 ck(attr['dropped_diagnostics_counter']==0 and not supp['invalid'],'controller_drop_or_supplement_flags')
 ck(attr['matched_requests']==attr['total_requests']==len(samples),'controller_match_count')
 spancount=0;sqlcount=0;rowscount=0;maxsumerr=0.;maxpermissionerr=0.;maxcontainerr=0.;failure_inventory=[];causes=Counter();failure_shapes=Counter();grouped=defaultdict(list);queries=defaultdict(Counter);partsbyid={};permbyid={};difference=[];sqlfingerprints=Counter();origins=defaultdict(list);clockrows=[];inclusive=defaultdict(list)
 # Independent boundary-midpoint integration, with full ancestor exclusion rather than production event sweep.
 def partition(d,subset=None):
  spans=d['spans'];ix={s['id']:s for s in spans}
  if subset is not None:spans=[s for s in spans if s['id'] in subset]
  boundaries=sorted({v for s in spans for v in (s['startMs'],s['startMs']+s['durationMs'])});out=Counter()
  for a,b in zip(boundaries,boundaries[1:]):
   if b<=a:continue
   mid=(a+b)/2;active={s['id']:s for s in spans if s['startMs']<=mid<s['startMs']+s['durationMs']}
   if not active:continue
   ancestorids=set()
   for s in active.values():
    p=s['parentId']
    while p is not None:ancestorids.add(p);p=ix[p]['parentId']
   labels=[]
   for sid in active.keys()-ancestorids:
    s=active[sid];name=s['name']+('['+s['sqlFingerprint'][:12]+']' if s.get('sqlFingerprint') else '')
    if s['name'] in ('sql.roundtrip','pool.acquire') and s['parentId'] is not None and ix[s['parentId']]['name']!='request':name+='@'+ix[s['parentId']]['name']
    labels.append(name)
   labels=sorted(set(labels));name=labels[0] if len(labels)==1 else 'parallel_overlap['+'|'.join(labels)+']';out[name]+=b-a
  return dict(out)
 for r in samples:
  rid=r['requestId'];d=ds.get(rid)
  if d is None:issue('missing_measured_trace',rid);continue
  transport=None
  if r.get('error',{}).get('code')=='CLIENT_TIMEOUT' and r.get('failurePhase')=='headers':
   expected_instance='A' if (r['requestIndex']//4)%2==0 else 'B'
   transport=audit_transport(r,d,abort_locations[rid],locations[rid],expected_instance,summary['urls'][0 if expected_instance=='A' else 1])
   for finding in transport['issues']:issue(finding['kind'],rid,finding['detail'])
   if transport['issues']:transport=None
  if transport is None:
   ck(r.get('serverRequestId')==rid,'response_id_mismatch_or_missing',rid)
   ck(r.get('status')==d['statusCode'],'client_server_status_mismatch',rid)
   ck(r.get('instance')==d['instance'],'instance_mismatch',rid)
   ck(d['outcome']=='response','unexpected_server_outcome',rid,d['outcome'])
  ck(r['candidate']=='native' and r['configuredCache']==summary['cache'] and r['phase']=='success','sample_config',rid)
  ck(d.get('droppedSpans')==d.get('droppedErrors')==d.get('diagnosticDroppedRecords')==0,'trace_drops',rid)
  ck(finite(r['elapsedMs']) and r['elapsedMs']>=0 and finite(d['elapsedMs']) and d['elapsedMs']>=0,'invalid_elapsed',rid)
  spans=d['spans'];spancount+=len(spans);ix={s['id']:s for s in spans}
  phases=Counter()
  for sp in spans:phases[sp['name']]+=sp['durationMs']
  for name,value in phases.items():inclusive[(r['scenario'],r['classification'],name)].append(value)
  expectedscenes=list(truth['scenarios']);ck(r['scenario']==expectedscenes[r['requestIndex']%4],'scenario_rotation',rid);ck((d['instance'] if transport else r.get('instance'))==('A' if (r['requestIndex']//4)%2==0 else 'B'),'instance_rotation',rid)
  ck(len(ix)==len(spans),'duplicate_span_id',rid);ck(len([s for s in spans if s['parentId'] is None])==1 and 0 in ix and ix[0]['parentId'] is None and ix[0]['name']=='request','invalid_root',rid)
  ck(near(ix[0]['durationMs'],d['elapsedMs']) and ix[0]['startMs']==0,'root_elapsed_mismatch',rid)
  ck([s['id'] for s in spans]==list(range(len(spans))),'span_creation_order',rid)
  valid=True
  for s in spans:
   sid=s['id'];ck(finite(s['startMs']) and finite(s['durationMs']) and s['startMs']>=0 and s['durationMs']>=0,'invalid_span_duration',rid,sid)
   p=s['parentId'];seen={sid}
   while p is not None:
    if p not in ix or p in seen:issue('invalid_ancestry',rid,sid);valid=False;break
    seen.add(p);p=ix[p]['parentId']
   if s['parentId'] is not None and s['parentId'] in ix:
    p=ix[s['parentId']];err=max(p['startMs']-s['startMs'],s['startMs']+s['durationMs']-p['startMs']-p['durationMs'],0);maxcontainerr=max(maxcontainerr,err);ck(err<1e-5,'child_outside_parent',rid,{'span':sid,'ms':err})
   if s['name']=='sql.roundtrip':
    sqlcount+=1;ck(bool(re.fullmatch('[0-9a-f]{64}',s.get('sqlFingerprint',''))),'missing_sql_fingerprint',rid,sid)
    if not s.get('error'):rowscount+=1;ck(isinstance(s.get('returnedRows'),int) and s['returnedRows']>=0,'missing_returned_rows',rid,sid)
  if transport is None:
   ck(len([s for s in spans if s['name']=='sql.roundtrip'])+len([s for s in spans if s['name']=='pool.acquire' and s.get('error')])==r.get('queryCount'),'sql_count_meta_mismatch',rid)
  queries[r['scenario']][(r['classification'],r.get('queryCount'))]+=1
  serverwall=(stamp(d['responseAt'])-stamp(d['requestAt']))*1000;clientwall=(stamp(r['responseAt'])-stamp(r['requestAt']))*1000;serial=[s for s in spans if s['name']=='response.serialize'];post=d['elapsedMs']-max((s['startMs']+s['durationMs'] for s in serial),default=d['elapsedMs']);clockrows.append({'requestId':rid,'instance':d['instance'],'classification':r['classification'],'clientMs':r['elapsedMs'],'serverMs':d['elapsedMs'],'clientWallMs':clientwall,'serverWallMs':serverwall,'signedClientMinusServerMs':r['elapsedMs']-d['elapsedMs'],'serverMonoMinusWallMs':d['elapsedMs']-serverwall,'clientMonoMinusWallMs':r['elapsedMs']-clientwall,'serverMonoToWallRatio':d['elapsedMs']/serverwall if serverwall>0 else None,'clientMonoToWallRatio':r['elapsedMs']/clientwall if clientwall>0 else None,'postSerializeServerMs':post})
  if not valid:continue
  fp=partition(d);err=abs(sum(fp.values())-d['elapsedMs']);maxsumerr=max(maxsumerr,err);ck(near(sum(fp.values()),d['elapsedMs']),'server_partition_sum',rid,err)
  if r['classification']!='success' and transport:
   causes['CLIENT_TIMEOUT_HEADERS']+=1
   boundary=transport['serverBoundaryCode'];leaf=transport['terminalSql']
   transport_inventory.append({'requestId':rid,**transport})
   origins['CLIENT_TIMEOUT_HEADERS'].append(leaf['durationMs'])
   failure_shapes[str((r['scenario'],'CLIENT_TIMEOUT_HEADERS',boundary,leaf.get('sqlFingerprint')))]+=1
   if boundary=='57014':sqlfingerprints[leaf['sqlFingerprint']]+=1
   failure_inventory.append({'requestIndex':r['requestIndex'],'requestId':rid,'scenario':r['scenario'],'clientStatus':None,'serverStatus':d['statusCode'],'outcome':d['outcome'],'classification':'CLIENT_TIMEOUT_HEADERS','serverBoundaryCode':boundary,'originalErrors':d['errors'],'serverSpans':spans,'clientRecord':r,'transport':transport,'clientElapsedMs':r['elapsedMs'],'serverElapsedMs':d['elapsedMs']})
  elif r['classification']!='success':
   failed=[s for s in spans if s.get('error')];concrete=[e for e in d['errors'] if e.get('code') not in (None,'UNKNOWN','SERVICE_UNAVAILABLE','AUTHZ_DENIED','RESPONSE_CLOSED')]
   leaves=[s for s in failed if not any(t['parentId']==s['id'] for t in failed)]
   ck(r['classification']=='failure' and r.get('status')==503,'unclassified_non503_failure',rid,r['classification'])
   ck(len(concrete)==1 and len(leaves)==1,'ambiguous_failure_chain',rid,{'errors':concrete,'leaves':leaves})
   cause=concrete[0]['code'] if len(concrete)==1 else 'UNRESOLVED';leaf=leaves[0] if len(leaves)==1 else {};codes=[s['error']['code'] for s in failed]
   ck(leaf.get('error',{}).get('code')==cause and leaf.get('name')==concrete[0].get('phase') if concrete else False,'original_error_leaf_mismatch',rid)
   ck(all(c in (cause,'SERVICE_UNAVAILABLE') for c in codes),'conflicting_wrapper_error',rid,codes)
   for s in failed:
    walk=leaf.get('id');ances=[]
    while walk is not None and walk in ix:ances.append(walk);walk=ix[walk]['parentId']
    ck(s['id'] in ances,'failed_span_not_on_terminal_ancestry',rid,s['id'])
   if cause=='57014':ck(leaf.get('name')=='sql.roundtrip' and bool(leaf.get('sqlFingerprint')),'sql_cancel_boundary',rid);sqlfingerprints[leaf.get('sqlFingerprint')]+=1
   elif cause=='POOL_ACQUIRE_TIMEOUT':ck(leaf.get('name')=='pool.acquire','pool_timeout_boundary',rid)
   else:issue('unreviewed_cause',rid,cause)
   causes[cause]+=1;origins[cause].append(leaf.get('durationMs',0));shape=(r['scenario'],cause,leaf.get('sqlFingerprint'),ix[leaf['parentId']]['name'] if leaf.get('parentId') is not None else None);failure_shapes[str(shape)]+=1
   failure_inventory.append({'requestIndex':r['requestIndex'],'requestId':rid,'scenario':r['scenario'],'clientStatus':r.get('status'),'serverStatus':d['statusCode'],'outcome':d['outcome'],'classification':cause,'serverBoundaryCode':cause,'originalErrors':d['errors'],'terminalFailedSpan':leaf,'propagatedErrorSpans':[{'id':s['id'],'parentId':s['parentId'],'name':s['name'],'error':s['error']} for s in failed],'clientElapsedMs':r['elapsedMs'],'serverElapsedMs':d['elapsedMs']})
  else:
   ck(r.get('status')==200 and not d['errors'] and not any(s.get('error') for s in spans),'success_status_or_errors',rid)
   residual=r['elapsedMs']-d['elapsedMs'] # Signed cross-domain difference retained separately, never assigned to a server component.
   roots=[s for s in spans if s['name'] in ('authority.token','authority.plan','report.compile')];ck(Counter(s['name'] for s in roots)==Counter({'authority.token':1,'authority.plan':1,'report.compile':1}),'permission_roots',rid)
   for a in roots:
    for b in roots:
     if a['id']<b['id']:ck(min(a['startMs']+a['durationMs'],b['startMs']+b['durationMs'])-max(a['startMs'],b['startMs'])<=1e-5,'overlapping_permission_roots',rid)
   pparts=Counter();observed=sum(s['durationMs'] for s in roots)
   for root in roots:
    subset=set()
    for s in spans:
     p=s['id']
     while p is not None:
      if p==root['id']:subset.add(s['id']);break
      p=ix[p]['parentId']
    pparts.update(partition(d,subset))
   ck(near(sum(pparts.values()),observed),'permission_partition_sum',rid);maxpermissionerr=max(maxpermissionerr,abs(sum(pparts.values())-observed))
   partsbyid[rid]=fp;permbyid[rid]={'parts':dict(pparts),'observed':observed,'difference':r['permissionMs']-observed};difference.append(r['permissionMs']-observed);grouped[r['scenario']].append(r)
 print(json.dumps({'phase':'raw_integrity','issues':len(issues),'samples':len(samples),'success':sum(map(len,grouped.values())),'failures':len(failure_inventory),'causes':dict(causes)}),flush=True)

 def compareparts(actual,reported,identity):
  rd={r['component']:r['ms'] for r in reported if r['component']!='client_transport_parse_and_unobserved_residual'};ck(set(actual)==set(rd),'component_label_set',identity,{'actualOnly':list(set(actual)-set(rd)),'reportedOnly':list(set(rd)-set(actual))})
  for k,v in actual.items():ck(k in rd and near(v,rd[k]),'component_value',identity,{'label':k,'actual':v,'reported':rd.get(k)})
 def share(parts,total):
  rows=[];cum=0;prefix=[]
  for k,v in sorted(parts.items(),key=lambda kv:-kv[1]):
   cum+=v;row={'component':k,'ms':v,'percent':v/total*100,'cumulativePercent':cum/total*100};rows.append(row)
   if not prefix or prefix[-1]['cumulativePercent']<80:prefix.append(row)
  return {'parts':rows,'minimum80percentPrefix':prefix}
 scenarios={};allclass=Counter(r['classification'] for r in samples)
 for name,rows in grouped.items():
  allscene=[r for r in samples if r['scenario']==name];counts=Counter(r['classification'] for r in allscene);a=attr['scenarios'][name];s=supp['permission'][name];ck(a['successful_matched_requests']==len(rows),'attribution_success_population',name)
  entry={'total':len(allscene),'classifications':dict(counts),'nonSuccessRatePercent':(len(allscene)-len(rows))/len(allscene)*100,'httpP95Ms':percentile([r['elapsedMs'] for r in rows],.95),'permissionP95Ms':percentile([r['permissionMs'] for r in rows],.95)}
  for mode,metric,partmap in [('http','elapsedMs',partsbyid),('permission','permissionMs',permbyid)]:
   ordered=sorted(rows,key=lambda r:r[metric]);idx=math.ceil(len(rows)*.95)-1;rep=ordered[idx];rid=rep['requestId'];lo=math.ceil(len(rows)*.90)-1;hi=math.ceil(len(rows)*.99);tail=ordered[lo:hi];agg=Counter()
   for r in tail:agg.update(partmap[r['requestId']] if mode=='http' else partmap[r['requestId']]['parts'])
   parts=partmap[rid] if mode=='http' else partmap[rid]['parts'];total=ds[rid]['elapsedMs'] if mode=='http' else partmap[rid]['observed'];tailtotal=sum(ds[r['requestId']]['elapsedMs'] for r in tail) if mode=='http' else sum(partmap[r['requestId']]['observed'] for r in tail)
   block={'population':len(rows),'rank1Based':idx+1,'requestId':rid,'metricMs':rep[metric],'partitionTotalMs':total,**share(parts,total),'tailRankBounds1Based':[lo+1,hi],'tailCount':len(tail),'tailPartitionTotalMs':tailtotal,'tail':share(agg,tailtotal)}
   if mode=='http':
    block['clockScope']='Server monotonic time of client HTTP latency selected population; not exact client-end-to-end decomposition';block['signedClientMinusServerMs']=rep[metric]-total;block['tailClientTotalMs']=sum(r[metric] for r in tail);block['tailSignedClientMinusServerMs']=block['tailClientTotalMs']-tailtotal
    ck(a['representative_p95_requestId']==rid and near(a['http_p95_ms'],rep[metric]),'http_representative',name);compareparts(parts,a['p95_request_parts'],name+':http');compareparts(agg,a['tail_cohort_parts'],name+':http-tail');ck(a['tail_cohort_size']==len(tail) and near(a['tail_cohort_total_client_ms'] if 'tail_cohort_total_client_ms' in a else a['tail_cohort_total_ms'],sum(r[metric] for r in tail)),'http_tail_population',name)
   else:
    ck(s['representative']['requestId']==rid and near(s['representative']['permissionMs'],rep[metric]),'permission_representative',name);compareparts(parts,s['representative']['parts'],name+':permission');compareparts(agg,s['tailParts'],name+':permission-tail');ck(s['tailCount']==len(tail),'permission_tail_population',name)
    block['metricDifferenceMs']=partmap[rid]['difference'];block['tailMetricTotalMs']=sum(r[metric] for r in tail);block['tailMetricDifferenceMs']=block['tailMetricTotalMs']-tailtotal
   entry[mode]=block
  for label,metric in [('success','elapsedMs'),('permission','permissionMs')]:
   for p in (.5,.95,.99):ck(near(percentile([r[metric] for r in rows],p),summary['perScenario'][name][label]['p'+str(round(p*100))]),'summary_percentile',name+':'+label+':'+str(p))
  entry['successQueryCounts']={str(k[1]):v for k,v in queries[name].items() if k[0]=='success'};scenarios[name]=entry
 # Verify corrected server-clock report against independent raw integration, including every cumulative share.
 for name,entry in scenarios.items():
  rr=revised['scenarios'][name];actual=entry['http']
  ck(rr['successful_matched_requests']==actual['population'],'revised_success_population',name)
  ck(rr['representative_p95_requestId']==actual['requestId'] and near(rr['http_p95_ms'],actual['metricMs']),'revised_representative',name)
  ck(near(rr['selected_request_server_elapsed_ms'],actual['partitionTotalMs']) and near(rr['selected_request_signed_client_minus_server_ms'],actual['signedClientMinusServerMs']),'revised_clock_scope',name)
  for want,got,kind in [(actual['parts'],rr['p95_request_parts'],'representative'),(actual['tail']['parts'],rr['tail_cohort_parts'],'tail'),(actual['minimum80percentPrefix'],rr['contributors_reaching_80percent'],'minimum80')]:
   ck([x['component'] for x in want]==[x['component'] for x in got],'revised_part_order',name+':'+kind)
   for a,b in zip(want,got):
    for field in ('ms','percent','cumulativePercent'):ck(near(a[field],b[field]),'revised_part_value',name+':'+kind+':'+a['component']+':'+field)
  ck(rr['tail_cohort_size']==actual['tailCount'] and near(rr['tail_cohort_total_server_ms'],actual['tailPartitionTotalMs']) and near(rr['tail_cohort_total_client_ms'],actual['tailClientTotalMs']),'revised_tail_totals',name)
  ck(sum(x['percent'] for x in rr['p95_request_parts'])>99.999999 and sum(x['percent'] for x in rr['p95_request_parts'])<100.000001,'revised_representative_share_sum',name)
 ck(revised['matched_requests']==revised['total_requests']==len(samples) and not revised['missing_diagnostics'] and not revised['duplicate_diagnostics'] and not revised['invalid_spans_or_duration_relations'] and revised['dropped_diagnostics_counter']==0,'revised_integrity')
 phaseRows=supp.get('inclusivePhaseDurations',[]);ck(len(phaseRows)==len(inclusive),'inclusive_phase_group_count')
 for row in phaseRows:
  key=(row['scenario'],row['classification'],row['phase']);values=inclusive.get(key,[]);calc=stats(values)
  for field in ('n','p50','p95','p99','max'):ck(calc[field]==row['durationMs'][field] or near(calc[field],row['durationMs'][field]),'inclusive_phase_stat',str(key)+':'+field)
 for k,v in allclass.items():ck(summary[k]['count']==v,'summary_classification_count',k)
 ck(len(attr['failures'])==len(supp['failures'])==len(failure_inventory),'reported_failure_population');ck(set(r['requestId'] for r in supp['failures'])==set(r['requestId'] for r in failure_inventory),'reported_failure_id_set')
 for f in supp['failures']:
  actual=next((r for r in failure_inventory if r['requestId']==f['requestId']),None)
  ck(actual is not None and actual['classification']==f['cause'],'reported_failure_cause',f['requestId'])
  if actual and actual['classification']=='CLIENT_TIMEOUT_HEADERS':
   ck(f.get('serverBoundaryCode')==actual['serverBoundaryCode'],'reported_transport_server_boundary',f['requestId'])
   ck(f.get('clientMetadataAvailability')=='no_response_headers_or_body' and f.get('observedSqlCount')==actual['transport']['observedSqlCount'],'reported_transport_metadata',f['requestId'])
 server_boundaries=Counter(('client_timeout:' if f['classification']=='CLIENT_TIMEOUT_HEADERS' else 'received_http_503:')+(f.get('serverBoundaryCode') or 'none') for f in failure_inventory)
 if supp.get('analysisVersion',0)>=3:ck(dict(server_boundaries)==supp.get('serverBoundaryCounts'),'reported_server_boundary_counts')
 ck(supp['sqlMissingReturnedRows']==0,'reported_missing_rows')
 loopstats={};begin=stamp(summary['startAt']);end=stamp(summary['endAt']);loopsbyprocess=defaultdict(list)
 for side,records in [('server',serverloops),('client',clientloops)]:
  for r in records:loopsbyprocess[(side,r['instance'],r['pid'])].append(r)
 for (side,inst,pid),records in loopsbyprocess.items():
  seq=[r['intervalId'] for r in records];ck(seq==list(range(seq[0],seq[-1]+1)),'loop_interval_sequence',str((side,inst,pid)))
  selected=[r for r in records if stamp(r['to'])>=begin and stamp(r['from'])<=end];key=side+':'+inst;ck(supp['eventLoops'][key]['intervals']==len(selected),'loop_window_count',key)
  for before,after in zip(records,records[1:]):ck(before['to']==after['from'],'loop_wall_continuity',key)
  loopstats[key]={'pid':pid,'rawIntervals':len(records),'intersectingIntervals':len(selected),'firstFrom':selected[0]['from'],'lastTo':selected[-1]['to'],'firstIntervalId':seq[0],'lastIntervalId':seq[-1],'selectedMonotonicTotalMs':sum(r['durationMs'] for r in selected),'selectedWallTotalMs':sum((stamp(r['to'])-stamp(r['from']))*1000 for r in selected),'intervalMonotonicMinusWallMs':stats([r['durationMs']-(stamp(r['to'])-stamp(r['from']))*1000 for r in selected]),'delayP95MsAcrossIntervals':stats([r['delayP95Ms'] for r in selected if r['delayP95Ms'] is not None]),'delayMaxMsAcrossIntervals':stats([r['delayMaxMs'] for r in selected if r['delayMaxMs'] is not None]),'utilizationAcrossIntervals':stats([r['utilization'] for r in selected])}
  for k in ('intervalP95DelayMsDistribution','intervalMaxDelayMsDistribution','utilizationDistribution'):
   field={'intervalP95DelayMsDistribution':'delayP95Ms','intervalMaxDelayMsDistribution':'delayMaxMs','utilizationDistribution':'utilization'}[k];values=[r[field] for r in selected if r[field] is not None]
   for p in (.5,.95,.99):ck(near(percentile(values,p),supp['eventLoops'][key][k]['p'+str(round(p*100))]),'loop_percentile',key+':'+k+':'+str(p))
  for d in ds.values():
   if d['instance']==inst and d['pid']==pid and side=='server':ck(seq[0]-1<=d['eventLoopIntervalStart']<=d['eventLoopIntervalEnd']<=seq[-1],'request_loop_interval_coverage',d['requestId'])
 containers=load(F/'runtime/containers.json');resources={};caps={'/yxt-pg':(4,8),'/yxt-redis':(1,1),'/yxt-api-a':(2,4),'/yxt-api-b':(2,4)};source=(F/'source-commit.txt').read_text().strip()
 for c in containers:
  name=c['Name'];resources[name]={'cpu':c['HostConfig']['NanoCpus']/1e9,'gib':c['HostConfig']['Memory']/1024**3,'restartCount':c['RestartCount'],'image':c['Config']['Image']}
  if name in caps:ck((resources[name]['cpu'],resources[name]['gib'])==caps[name],'resource_cap',name)
  if 'api-' in name:
   env=dict(x.split('=',1) for x in c['Config']['Env']);ck(env.get('OBSERVE')=='1' and env.get('CANDIDATE')=='native' and env.get('CACHE_MODE')==summary['cache'],'api_environment',name);ck(env.get('PGPOOL','20')=='20','pool_max',name);ck(c['Config']['Labels']['org.opencontainers.image.revision']==source,'api_frozen_revision',name)
 counts=load(F/'runtime/actual-data-counts.json')
 for k,v in {'main_people':50000,'second_people':500,'departments':2000,'roles':20,'load_facts':1000000}.items():ck(counts[k]==v,'fixture_count',k)
 accounted_aborts=[e['record'] for row in transport_inventory for e in row['abortEvents']]
 ck(Counter(json.dumps(r,sort_keys=True) for r in aborts)==Counter(json.dumps(r,sort_keys=True) for r in accounted_aborts),'unaccounted_transport_abort_events')
 ck(not unknown,'unknown_json_record_types',None,unknown)
 result={'auditVersion':3,'verdictScope':'Window request/trace/attribution integrity under separate client/server clock domains; not a performance-gate PASS or exact client-end-to-end decomposition.','window':str(F),'method':'Independent raw parse, ancestry validation and midpoint boundary integration; no production attribution code imported.','completeEvidence':not issues,'issueCount':len(issues),'issues':issues,'summary':{'total':len(samples),'classifications':dict(allclass),'nonSuccessRatePercent':sum(r['classification']!='success' for r in samples)/len(samples)*100,'matchedMeasured':len(measured&set(ds)),'allServerDiagnostics':len(ds),'prewarmRequests':len(prewarm),'otherServerRequests':extra_details,'serverDropMaxByProcess':{k:max(v) for k,v in counters.items()},'nonJsonLinesByFile':dict(nonjson),'lateAbortEvents':len(aborts),'spanCount':spancount,'sqlCount':sqlcount,'successfulSqlReturnedRowsCount':rowscount,'maxServerPartitionErrorMs':maxsumerr,'maxPermissionPartitionErrorMs':maxpermissionerr,'maxChildContainmentErrorMs':maxcontainerr,'permissionMetricDifferenceMs':stats(difference)},'config':{'sourceCommit':source,'summaryStartAt':summary['startAt'],'summaryEndAt':summary['endAt'],'durationMs':summary['durationMs'],'concurrency':summary['concurrency'],'resources':resources,'dataCounts':counts},'scenarios':scenarios,'revisedAttributionCheck':{'artifact':str(F/'server-clock-attribution.json'),'allScenarioRepresentativeTailAndMinimum80Checked':True},'inclusivePhaseCheck':{'artifact':str(args.supplement or F/'supplement.json'),'groups':len(inclusive),'statisticsChecked':['n','p50','p95','p99','max'],'scope':'Per-request sum of occurrences of a named inclusive span, on requests where present; not additive across phases or independent percentiles.'},'eventLoops':loopstats,'clockAudit':{'byInstance':{inst:{field:stats([r[field] for r in clockrows if r['instance']==inst and r[field] is not None]) for field in ('signedClientMinusServerMs','serverMonoMinusWallMs','clientMonoMinusWallMs','serverMonoToWallRatio','clientMonoToWallRatio','postSerializeServerMs')} for inst in sorted(set(r['instance'] for r in clockrows))},'negativeDifferenceAll':sum(r['signedClientMinusServerMs']<0 for r in clockrows),'negativeDifferenceSuccess':sum(r['signedClientMinusServerMs']<0 and r['classification']=='success' for r in clockrows),'clockBracket':load(F/'runtime/clock-bracket.json'),'worstNegativeExamples':sorted(clockrows,key=lambda r:r['signedClientMinusServerMs'])[:10]},'failureCauses':dict(causes),'serverBoundaryCounts':dict(server_boundaries),'transportAudits':transport_inventory,'failureLeafDurationMs':{k:stats(v) for k,v in origins.items()},'failureShapeCounts':dict(failure_shapes),'failureSqlFingerprints':dict(sqlfingerprints),'failures':failure_inventory,'limitations':['No isolated server SQL CPU attribution: SQL spans include driver/wire/execution/decoding/scheduling.','57014 is direct cancellation evidence; fixed 10s client-session statement_timeout and duration support timeout interpretation, not underlying CPU cause.','Permission metric remainder covers work outside selected roots and boundary overhead; retained explicitly.','Interval event-loop distributions are not pooled p95s and boundary intervals may partly include prewarm or drain.','Historical failure causes remain unrecoverable; no historical causal backfill.','Client header deadlines and server terminal errors are separate axes. No received body or client queryCount is imputed on transport failures. Lower-level clock/scheduling mechanisms remain unresolved.']}
 OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'output':str(OUT),'completeEvidence':not issues,'issueCount':len(issues),'firstIssues':issues[:10],'failureCauses':dict(causes),'scenarios':{k:{x:v[x] for x in ('total','classifications','nonSuccessRatePercent','httpP95Ms','permissionP95Ms')} for k,v in scenarios.items()}}),flush=True)

if __name__=='__main__':main()
