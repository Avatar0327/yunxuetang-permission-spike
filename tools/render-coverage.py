"""Render all frozen acceptance rows without inferring missing results or Go."""
from collections import Counter
from pathlib import Path
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--mapping', type=Path, default=ROOT / 'evidence/coverage-map.json')
parser.add_argument('--output', type=Path, default=ROOT / 'evidence/coverage-matrix.md')
args = parser.parse_args()
manifest = json.loads((ROOT / 'docs/acceptance-manifest.json').read_text())
document = json.loads(args.mapping.read_text())
items = document['items']
ids = Counter(item.get('id') for item in items)
required = {case['id'] for group in manifest['groups'] for case in group['required_subcases']}
if set(ids) != required or any(count != 1 for count in ids.values()):
    raise SystemExit('Require exactly the frozen168 IDs once each; run audit-coverage.py.')
by_id = {item['id']: item for item in items}
status_labels = {'pass': '实测通过（待核证据充分性）', 'fail': '未通过', 'incomplete': '未完成'}

def cell(value):
    return str(value).replace('|', '\\|').replace('\n', '<br>')

def reference(ref):
    path = ref['path']
    suffix = ':' + str(ref['line']) if 'line' in ref else ''
    return cell(f"{ref['candidate']}/{ref['kind']}：{path}{suffix}")

lines = [
    '# 权限预研逐项实测矩阵', '',
    f"映射版本：{document.get('sourceCommit', '未记录')}；更新：{document.get('updatedAt', '未记录')}。",
    '',
    '24组、168核对点全部逐项保留。下列状态来自实测映射，不由测试总数推算；机械引用检查及本矩阵都不能单独作Go结论。路径相对交付的原型源码，raw文件另随实测原始记录归档。',
    '',
    '| 组别 | 通过行 | 失败行 | 未完成行 |', '|---|---:|---:|---:|',
]
for group in manifest['groups']:
    counts = Counter(by_id[case['id']]['status'] for case in group['required_subcases'])
    lines.append(f"| {group['id']} | {counts['pass']} | {counts['fail']} | {counts['incomplete']} |")
for group in manifest['groups']:
    lines += ['', f"## {group['id']}", '', '| 子项 | 冻结要求 | 实测状态 | 实际结果与边界 | 证据 |', '|---|---|---|---|---|']
    for case in group['required_subcases']:
        item = by_id[case['id']]
        if item['status'] not in status_labels:
            raise SystemExit('Invalid status: ' + case['id'])
        refs = '<br>'.join(reference(ref) for ref in item.get('evidence', [])) or '无运行证据'
        lines.append('| ' + ' | '.join([cell(case['id']), cell(case['requirement']), status_labels[item['status']], cell(item['actualResult']), refs]) + ' |')
lines += ['', '五项永久缺口G-01/G-02/G-04/G-05/G-06保留；目标原型实测不补证原站。D-42/T-10由我方定义。正式B1权限开发是否可开始，以报告门禁和真实签字为准；原型折抵保持0。', '']
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text('\n'.join(lines))
print(json.dumps({'output': str(args.output), 'groups': len(manifest['groups']), 'rows': len(items), 'statuses': dict(Counter(item['status'] for item in items)), 'go_inferred': False}, ensure_ascii=False))
