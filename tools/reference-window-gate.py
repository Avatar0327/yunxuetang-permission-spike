"""Check this reference window's measured thresholds, never the overall permission gate."""
from pathlib import Path
import json
import sys

results = json.loads(Path(sys.argv[1]).read_text())
required = {'list-broad', 'list-constrained', 'history-broad', 'history-constrained'}
checks = []
for result in results:
    reasons = []
    if result.get('audit_errors'):
        reasons.append('raw audit has errors')
    if not result.get('reference_window') or result.get('phase') != 'success':
        reasons.append('not the required reference success window')
    if set(result.get('threshold_observations', {})) != required:
        reasons.append('four required scenarios not all measured')
    if not {'A', 'B'}.issubset(result.get('instances', {})):
        reasons.append('both required instances not observed')
    if any(count for kind, count in result.get('categories', {}).items() if kind != 'success'):
        reasons.append('normal window contains denied, failed or incorrect responses')
    for name, observation in result.get('threshold_observations', {}).items():
        if not observation.get('permission_met'):
            reasons.append(name + ': permission p95 exceeds50ms or missing')
        if not observation.get('success_met'):
            reasons.append(name + ': endpoint p95 exceeds limit or missing')
    checks.append({'candidate': result.get('candidate'), 'cache': result.get('cache'), 'measured_window_pass': not reasons, 'failure_reasons': reasons})
output = {'windows': checks, 'all_measured_windows_pass': bool(checks) and all(check['measured_window_pass'] for check in checks), 'overall_permission_go_inferred': False, 'limitation': 'Only reference window evidence: source semantics, full coverage, no N+1 and other gates require separate review.'}
print(json.dumps(output, ensure_ascii=False, indent=2))
if not output['all_measured_windows_pass']:
    raise SystemExit(1)
