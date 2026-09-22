"""Independently recompute benchmark statistics from every raw request sample."""
from pathlib import Path
from collections import defaultdict, Counter
import gzip
import json
import math
import sys


def quantiles(values):
    values = sorted(values)
    return {'count': len(values), **{k: values[min(len(values)-1, math.ceil(len(values)*p)-1)] if values else None
        for k,p in [('p50',.5),('p95',.95),('p99',.99)]}}


def audit(folder):
    summary=json.loads((folder/'summary.json').read_text())
    groups=defaultdict(lambda:defaultdict(list))
    categories=Counter(); instances=Counter(); caches=Counter(); issues=[]
    with gzip.open(folder/'samples.jsonl.gz','rt') as f:
        for line_no,line in enumerate(f,1):
            sample=json.loads(line)
            scenario=sample.get('scenario','unknown')
            classification=sample.get('classification')
            categories[classification]+=1
            instances[sample.get('instance')]+=1
            caches[sample.get('cache')]+=1
            if sample.get('candidate')!=summary['candidate']:
                issues.append(f'line {line_no}: candidate label mismatch')
            metrics={'elapsedMs':classification}
            if classification=='success':
                metrics.update(permissionMs='permission',dataMs='data')
                if sample.get('status')!=200 or sample.get('phase')!='success':
                    issues.append(f'line {line_no}: success with wrong HTTP status/phase')
                if summary['cache']=='cold' and sample.get('cache')!='cold':
                    issues.append(f'line {line_no}: cold snapshot cache hit')
            for key,bucket in metrics.items():
                value=sample.get(key)
                if not isinstance(value,(int,float)) or not math.isfinite(value) or value<0:
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
    return {'directory':str(folder),'candidate':summary['candidate'],'cache':summary['cache'],
        'configured_seconds':summary.get('configuredSeconds'),'concurrency':summary.get('concurrency'),
        'reference_window':summary.get('configuredSeconds')==600 and summary.get('concurrency')==50,
        'phase':summary.get('phase'),'sample_count':sum(categories.values()),'categories':dict(categories),
        'instances':dict(instances),'cache_states':dict(caches),'statistics':computed,'audit_errors':issues}


if __name__=='__main__':
    results=[audit(Path(arg)) for arg in sys.argv[1:]]
    print(json.dumps(results,ensure_ascii=False,indent=2))
    if any(r['audit_errors'] for r in results):raise SystemExit(1)
