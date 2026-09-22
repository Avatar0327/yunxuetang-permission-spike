"""Check frozen coverage IDs and cited raw observations; never infer semantic coverage."""
from collections import Counter
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = {'http_sql', 'domain_sql', 'fault', 'browser', 'benchmark', 'boundary'}
KINDS = RUNTIME | {'unit', 'review'}


def audit(path):
    manifest = json.loads((ROOT / 'docs/acceptance-manifest.json').read_text())
    required = {case['id'] for group in manifest['groups'] for case in group['required_subcases']}
    document = json.loads(path.read_text())
    items = document.get('items', [])
    ids = Counter(item.get('id') for item in items)
    issues = []
    for ident in sorted(required - set(ids)):
        issues.append(f'{ident}: missing row')
    for ident, count in ids.items():
        if ident not in required or count != 1:
            issues.append(f'{ident}: unknown or duplicated row ({count})')
    observations = 0
    files = {}
    for item in items:
        ident, status = item.get('id'), item.get('status')
        if status not in {'pass', 'fail', 'incomplete'}:
            issues.append(f'{ident}: invalid status {status}')
        if not isinstance(item.get('actualResult'), str) or not item['actualResult'].strip():
            issues.append(f'{ident}: missing actual result or explicit incomplete reason')
        refs = item.get('evidence', [])
        if status == 'pass' and not any(ref.get('kind') in RUNTIME for ref in refs):
            issues.append(f'{ident}: pass lacks runtime/boundary evidence')
        for ref in refs:
            if ref.get('kind') not in KINDS or ref.get('candidate') not in {'native', 'casbin', 'shared'}:
                issues.append(f'{ident}: invalid evidence kind/candidate')
            target = ROOT / ref.get('path', '')
            if not target.is_file():
                issues.append(f'{ident}: missing evidence {ref.get("path")}')
                continue
            if 'line' not in ref:
                continue
            line = ref['line']
            if target not in files:
                files[target] = target.read_text().splitlines()
            if not isinstance(line, int) or isinstance(line, bool) or not 1 <= line <= len(files[target]):
                issues.append(f'{ident}: invalid evidence line {line}')
                continue
            if target.suffix != '.jsonl':
                continue
            try:
                record = json.loads(files[target][line - 1])
            except ValueError:
                issues.append(f'{ident}: invalid JSON observation at {target}:{line}')
                continue
            if ref.get('observationName') and record.get('name') != ref['observationName']:
                issues.append(f'{ident}: observation name mismatch at {target}:{line}')
            if ref.get('candidate') != 'shared' and record.get('candidate') != ref['candidate']:
                issues.append(f'{ident}: observation candidate mismatch at {target}:{line}')
            if 'expected' in record and 'actual' in record:
                observations += 1
                if status == 'pass' and record['expected'] != record['actual']:
                    issues.append(f'{ident}: cited pass has unequal expected/actual at {target}:{line}')
    return {
        'mapping': str(path), 'required': len(required), 'rows': len(items),
        'statuses': dict(Counter(item.get('status') for item in items)),
        'literal_comparisons_checked': observations, 'errors': issues,
        'limitation': 'Mechanical citation audit only; semantic coverage and Go require independent review.'
    }


if __name__ == '__main__':
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'evidence/coverage-map.json'
    result = audit(path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result['errors']:
        raise SystemExit(1)
