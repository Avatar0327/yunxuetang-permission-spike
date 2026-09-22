"""Read-only input audit and reproducible mechanical checks of design outputs."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import hashlib
import json
import re

ROOT = Path('/Users/peng/Library/Mobile Documents/com~apple~CloudDocs/Agent复刻项目/云学堂复刻规划')
TECH = ROOT / '03_技术方案'
RECORDS = TECH / '核验记录'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((RECORDS / '输入文件指纹.json').read_text())
actual = {str(p.relative_to(ROOT)): sha(p) for p in ROOT.rglob('*')
          if p.is_file() and p.name != '.DS_Store' and TECH not in p.parents}
expected = {f['path']: f['sha256'] for f in manifest['files']}
differences = sorted(k for k in set(actual) | set(expected) if actual.get(k) != expected.get(k))
if len(actual) != 65 or differences:
    raise SystemExit(json.dumps({'count': len(actual), 'unexpected_differences': differences}, ensure_ascii=False))

filesystem = [p for p in ROOT.rglob('*') if p.is_file()]
filesystem_counts = {
    'all_files': len(filesystem),
    'canonical_inputs': len(actual),
    'technical_outputs_excluding_metadata': sum(TECH in p.parents and p.name != '.DS_Store' for p in filesystem),
    'metadata_all_directories': sum(p.name == '.DS_Store' for p in filesystem),
}
if sum(filesystem_counts[k] for k in ['canonical_inputs', 'technical_outputs_excluding_metadata', 'metadata_all_directories']) != filesystem_counts['all_files']:
    raise SystemExit('Filesystem count partition failed')
execution_path = TECH / '预研证据/权限_v8.3_20260923/执行状态.json'
execution = json.loads(execution_path.read_text()) if execution_path.exists() else {}
permission_gate = execution.get('permission_gate', 'PENDING_EVIDENCE')
if permission_gate not in {'PENDING_EVIDENCE', 'NO_GO', 'GO'}:
    raise SystemExit('Unknown permission gate status; do not infer approval')
docs = sorted(TECH.glob('[0-9][0-9]_*.md'))
trace = (TECH / '07_需求与验收追踪.md').read_text()
req_source = re.findall(r'^## (REQ-[A-Z]+-\d+) (.+)$', (ROOT / '02_规划交付物/交付物4_需求基线.md').read_text(), re.M)
req_trace = re.findall(r'^\| \[(REQ-[A-Z]+-\d+)\]\([^)]+\) (.*?) \|', trace, re.M)
ac_source = re.findall(r'^## (AC-[A-Z]-\d+) (.+)$', (ROOT / '02_规划交付物/交付物8B_验收场景.md').read_text(), re.M)
ac_trace = re.findall(r'^\| (AC-[A-Z]-\d+) (.*?) \|', trace, re.M)
unbalanced, json_errors, missing_links, table_errors = [], [], [], []
json_count = 0

def links(body):
    for match in re.finditer(r'\]\(', body):
        i, depth, start = match.end(), 1, match.end()
        while i < len(body) and depth:
            if body[i] == '(' and (i == 0 or body[i-1] != '\\'):
                depth += 1
            elif body[i] == ')' and (i == 0 or body[i-1] != '\\'):
                depth -= 1
            i += 1
        if depth == 0:
            yield body[start:i-1].strip().strip('<>')

for doc in docs:
    body = doc.read_text()
    fence = False
    table_width = None
    for lineno, line in enumerate(body.splitlines(), 1):
        if line.lstrip().startswith('```'):
            fence = not fence
            table_width = None
            continue
        if fence:
            continue
        if line.startswith('|') and line.endswith('|'):
            width = len(re.split(r'(?<!\\)\|', line))
            if table_width is None:
                table_width = width
            elif table_width != width:
                table_errors.append({'file': doc.name, 'line': lineno, 'expected': table_width, 'actual': width})
        else:
            table_width = None
    if fence:
        unbalanced.append(doc.name)
    for match in re.finditer(r'```json\s*\n(.*?)\n```', body, re.S):
        json_count += 1
        try:
            json.loads(match[1])
        except ValueError as error:
            json_errors.append({'file': doc.name, 'error': str(error)})
    # Fenced examples are not live document links.
    prose = re.sub(r'```.*?```', '', body, flags=re.S)
    for target in links(prose):
        if re.match(r'^[a-zA-Z][\w+.-]*:', target) or target.startswith('#'):
            continue
        target = target.split('#', 1)[0]
        if target and not (doc.parent / target).exists():
            missing_links.append({'file': doc.name, 'target': target})

estimate = json.loads((RECORDS / '范围工期计算底稿.json').read_text())
columns = ['original', 'company_increment', 'other_T_increment', 'engineering_increment', 'revised']
row_ok = all([sum(row[col][i] for col in columns[:-1]) for i in (0, 1)] == row['revised']
             for row in estimate['by_batch'].values())
sum_ok = all([sum(row[col][i] for row in estimate['by_batch'].values()) for i in (0, 1)] == estimate['totals'][col]
             for col in columns)
req_ok = len(req_source) == len(req_trace) == 94 and sorted(req_source) == sorted(req_trace)
ac_ok = len(ac_source) == len(ac_trace) == 53 and len(dict(ac_source)) == 53 and sorted(ac_source) == sorted(ac_trace)
record_path = RECORDS / '文档核验结果.json'
previous = json.loads(record_path.read_text())
result = {
    'checked_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds'),
    'verification_kind': 'documentation_and_v83_input_audit_not_permission_gate',
    'design_version': '1.0', 'input_baseline_version': manifest['baseline_version'],
    'input_rebaseline_complete': True, 'canonical_input_count': len(actual),
    'metadata_entries_removed_from_original_manifest': 3, 'filesystem_current_counts': filesystem_counts, 'unchanged_content_count': 62, 'unchanged_manual_count': 24,
    'unexpected_content_differences': differences, 'canonical_document_count': len(docs),
    'requirements_source': len(req_source), 'requirements_trace': len(req_trace), 'requirements_exact': req_ok,
    'scenario_entries_source': len(ac_source), 'scenario_entries_trace': len(ac_trace), 'scenario_exact': ac_ok,
    'unique_scenario_ids': len(dict(ac_source)), 'B6_D43_execution_basis': estimate['B6_acceptance_basis'],
    'missing_local_links': missing_links, 'unbalanced_fences': unbalanced,
    'json_examples_checked': json_count, 'json_errors': json_errors, 'table_shape_errors': table_errors,
    'estimate_row_and_batch_checks_passed': row_ok and sum_ok, 'estimate_totals': estimate['totals'],
    'permanent_gaps': ['G-01','G-02','G-04','G-05','G-06'],
    'required_recitation_scenarios': ['AC-N-03','AC-E-01','AC-E-02','AC-E-03','AC-E-22','AC-N-11','AC-E-25'],
    'permission_tests_planned': 24, 'supplementary_acceptance_planned': 13,
    'mechanical_document_checks_passed': bool(req_ok and ac_ok and row_ok and sum_ok and not (missing_links or unbalanced or json_errors or table_errors)),
    'business_design_review_complete': True, 'deliverable_A_user_review_complete': True,
    'permission_spike_authorized': True, 'permission_spike_started': True,
    'permission_spike_gate': permission_gate, 'formal_B1_started': False,
    'planning_input_written_by_verifier': False,
    'previous_verification_sha256': sha(record_path), 'previous_verification_date': previous['checked_at'],
    'document_sha256': {p.name: sha(p) for p in docs},
    'input_manifest_sha256': sha(RECORDS / '输入文件指纹.json'),
    'estimate_ledger_sha256': sha(RECORDS / '范围工期计算底稿.json'),
}
record_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['canonical_input_count','requirements_exact','scenario_exact','missing_local_links','json_errors','table_shape_errors','estimate_row_and_batch_checks_passed','mechanical_document_checks_passed']}, ensure_ascii=False, indent=2))
if not result['mechanical_document_checks_passed']:
    raise SystemExit(1)
