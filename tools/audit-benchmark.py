"""Independently recompute benchmark statistics from every raw request sample."""
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime
import gzip
import hashlib
import json
import math
import sys


def quantiles(values):
    values = sorted(values)
    return {'count': len(values), **{k: values[min(len(values)-1, math.ceil(len(values)*p)-1)] if values else None
        for k,p in [('p50',.5),('p95',.95),('p99',.99)]}}


def canonical(value, key=None):
    if isinstance(value,dict):
        return {name:canonical(value[name],name) for name in sorted(value)}
    if isinstance(value,list):
        result=[canonical(item) for item in value]
        return sorted(result) if key=='source_ids' else result
    return value


def result_digest(count, rows):
    payload=json.dumps(canonical({'count':count,'rows':rows}),ensure_ascii=False,separators=(',',':'))
    return hashlib.sha256(payload.encode()).hexdigest()


def audit(folder):
    summary=json.loads((folder/'summary.json').read_text())
    groups=defaultdict(lambda:defaultdict(list))
    categories=Counter(); instances=Counter(); caches=Counter(); issues=[]
    scenario_counts=Counter(); query_counts=defaultdict(Counter); clients=Counter()
    request_times=[]; truth={}; correctness_mismatches=Counter()
    if summary.get('truthFile'):
        truth_document=json.loads((folder/summary['truthFile']).read_text())
        if truth_document.get('formatVersion')!=1:
            issues.append('unsupported scenario truth version')
        truth=truth_document.get('scenarios',{})
        for name,expected in truth.items():
            if expected.get('rowCount')!=len(expected.get('expectedRows',[])):
                issues.append(f'{name}: expected row count contradicts truth rows')
            if result_digest(expected.get('expectedCount'),expected.get('expectedRows'))!=expected.get('resultDigest'):
                issues.append(f'{name}: expected digest contradicts independently serialized truth')
    elif summary.get('configuredSeconds')==600 and summary.get('concurrency')==50 and summary.get('phase')=='success':
        issues.append('reference success window lacks independent scenario truth')
    with gzip.open(folder/'samples.jsonl.gz','rt') as f:
        for line_no,line in enumerate(f,1):
            sample=json.loads(line)
            scenario=sample.get('scenario','unknown')
            classification=sample.get('classification')
            categories[classification]+=1
            clients[sample.get('clientId')]+=1
            if classification not in {'success','denial','failure','authorization_error'}:
                issues.append(f'line {line_no}: unknown classification')
            try:
                request_times.append(datetime.fromisoformat(sample['requestAt'].replace('Z','+00:00')))
            except (KeyError, ValueError, AttributeError):
                issues.append(f'line {line_no}: invalid request timestamp')
            scenario_counts[scenario]+=1
            query_counts[scenario][str(sample.get('queryCount'))]+=1
            instances[sample.get('instance')]+=1
            caches[sample.get('cache')]+=1
            if sample.get('candidate')!=summary['candidate']:
                issues.append(f'line {line_no}: candidate label mismatch')
            if sample.get('phase')!=summary.get('phase'):
                issues.append(f'line {line_no}: phase label mismatch')
            if sample.get('status')==200 and truth:
                expected=truth.get(scenario)
                incorrect=not expected or any(sample.get(key)!=expected[expected_key] for key,expected_key in
                    [('actualCount','expectedCount'),('rowCount','rowCount'),('resultDigest','resultDigest')])
                if incorrect:
                    correctness_mismatches[scenario]+=1
                    if classification=='success':
                        issues.append(f'line {line_no}: successful sample disagrees with scenario truth')
            metrics={'elapsedMs':classification}
            if classification=='success':
                metrics.update(permissionMs='permission',dataMs='data')
                if sample.get('status')!=200 or sample.get('phase')!='success':
                    issues.append(f'line {line_no}: success with wrong HTTP status/phase')
                if summary['cache']=='cold' and sample.get('cache')!='cold':
                    issues.append(f'line {line_no}: cold snapshot cache hit')
                if summary['cache']=='hot' and sample.get('cache') not in {'L1','L2'}:
                    issues.append(f'line {line_no}: hot snapshot was not a measured L1/L2 hit')
                if (summary.get('configuredSeconds')==600 and summary.get('concurrency')==50 or 'actualCandidate' in sample) and sample.get('actualCandidate')!=summary['candidate']:
                    issues.append(f'line {line_no}: actual server candidate mismatch')
            for key,bucket in metrics.items():
                value=sample.get(key)
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0:
                    issues.append(f'line {line_no}: missing/invalid {key}')
                    continue
                groups[scenario][bucket].append(value)
                groups['_all'][bucket].append(value)
    computed={scenario:{key:quantiles(values) for key,values in buckets.items()} for scenario,buckets in groups.items()}
    if sum(categories.values())!=summary['total']:
        issues.append('total sample count mismatch')
    # Check top-level metric summaries when present, independently of published gates.
    for key,actual in computed.get('_all',{}).items():
        published=summary.get(key)
        if isinstance(published,dict) and all(k in published for k in actual):
            for metric,value in actual.items():
                if published[metric]!=value:
                    issues.append(f'published {key}.{metric} does not match raw samples')
    thresholds={}
    for scenario,statistics in computed.items():
        if scenario=='_all':
            continue
        permission=statistics.get('permission',{}).get('p95')
        success=statistics.get('success',{}).get('p95')
        limit=2000 if scenario.startswith('history-') else 500
        thresholds[scenario]={
            'permission_p95_ms':permission,'permission_limit_ms':50,
            'permission_met':permission is not None and permission<=50,
            'success_p95_ms':success,'success_limit_ms':limit,
            'success_met':success is not None and success<=limit,
        }
    reference=summary.get('configuredSeconds')==600 and summary.get('concurrency')==50
    try:
        start=datetime.fromisoformat(summary['startAt'].replace('Z','+00:00'))
        end=datetime.fromisoformat(summary['endAt'].replace('Z','+00:00'))
        wall_ms=(end-start).total_seconds()*1000
    except (KeyError, ValueError, AttributeError):
        wall_ms=None
        issues.append('invalid actual window timestamps')
    if reference:
        if wall_ms is None or wall_ms<600000 or summary.get('durationMs',0)<600000:
            issues.append('configured reference window did not last 600 seconds')
        if set(clients)!=set(range(50)):
            issues.append('reference window does not contain all 50 configured client IDs')
    return {'directory':str(folder),'candidate':summary['candidate'],'cache':summary['cache'],
        'configured_seconds':summary.get('configuredSeconds'),'concurrency':summary.get('concurrency'),
        'reference_window':reference,
        'phase':summary.get('phase'),'sample_count':sum(categories.values()),'categories':dict(categories),
        'instances':dict(instances),'cache_states':dict(caches),'scenario_counts':dict(scenario_counts),
        'actual_wall_ms':wall_ms,'observed_client_count':len(clients),
        'request_start_span_ms':(max(request_times)-min(request_times)).total_seconds()*1000 if request_times else None,
        'query_counts_by_scenario':{k:dict(v) for k,v in query_counts.items()},
        'statistics':computed,'threshold_observations':thresholds,'audit_errors':issues,
        'truth_scenarios':list(truth),'raw_correctness_mismatches':dict(correctness_mismatches),
        'limitation':'Threshold observations alone do not establish full acceptance, result truth, no N+1, resource limits or sufficient workload.'}


if __name__=='__main__':
    results=[audit(Path(arg)) for arg in sys.argv[1:]]
    print(json.dumps(results,ensure_ascii=False,indent=2))
    if any(r['audit_errors'] for r in results):raise SystemExit(1)
