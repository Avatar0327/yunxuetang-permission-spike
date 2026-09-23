"""Native-only qualification gate; successful latency excludes all failed requests."""
from pathlib import Path
import json,sys
KINDS=('success','denial','failure','authorization_error','measurement_error')
REQUIRED={'list-broad','list-constrained','history-broad','history-constrained'}
def evaluate(a):
 reasons=[];rows=[]
 if a['candidate']!='native':reasons.append('OnlyNativeAuthorized')
 if a.get('audit_errors'):reasons.append('RawAuditErrors')
 if not a.get('reference_window') or a.get('phase')!='success' or a.get('actual_wall_ms',0)<600000 or a.get('observed_client_count')!=50:reasons.append('ReferenceWindowIncomplete')
 if not {'A','B'}.issubset(a.get('instances',{})):reasons.append('BothInstancesRequired')
 if set(a.get('threshold_observations',{}))!=REQUIRED:reasons.append('FourScenariosRequired')
 if a['categories'].get('authorization_error',0) or a.get('raw_correctness_mismatches'):reasons.append('AuthorizationError')
 if a['categories'].get('measurement_error',0):reasons.append('MeasurementError')
 for name in [*sorted(REQUIRED),'_all']:
  stats=a.get('statistics',{}).get(name,{})
  counts={k:stats.get(k,{}).get('count',0) for k in KINDS};total=sum(counts.values());bad=total-counts['success'];rate=bad/total if total else None
  ok=rate is not None and rate<=0.001
  if not ok:reasons.append(name+': nonSuccessRate>0.1%OrNoSamples')
  t=a.get('threshold_observations',{}).get(name)
  if t:
   if not t['permission_met']:reasons.append(name+': permissionP95>50msOrMissing')
   if not t['success_met']:reasons.append(name+': endpointP95>'+str(t['success_limit_ms'])+'msOrMissing')
  rows.append({'scenario':name,'counts':counts,'total':total,'non_success':bad,'non_success_rate':rate,'limit':0.001,'rate_pass':ok,'latency':t})
 return {'candidate':a['candidate'],'cache':a['cache'],'pass':not reasons,'reasons':reasons,'scenarios':rows,'scope':'Measured reference gate only. Full error-cause join, revocation/fault/semantic/noN+1 and observer validity required separately; never overallGo.'}
if __name__=='__main__':
 raw=json.loads(Path(sys.argv[1]).read_text());out=[evaluate(a) for a in raw];print(json.dumps(out,ensure_ascii=False,indent=2));raise SystemExit(0 if all(r['pass'] for r in out) else 1)
