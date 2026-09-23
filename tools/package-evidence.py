"""Publish this synthetic spike's committed source and measured files to 03 outputs.

Run after tests/reviews and the final source commit. Does not edit business inputs.
"""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import shutil
import subprocess

LOCAL = Path(__file__).resolve().parents[1]
PLANNING = Path('/Users/peng/Library/Mobile Documents/com~apple~CloudDocs/Agent复刻项目/云学堂复刻规划')
TECH = PLANNING / '03_技术方案'
DEST = TECH / '预研证据/权限_v8.3_20260923'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

baseline = TECH / '核验记录/输入文件指纹.json'
fingerprints = json.loads(baseline.read_text())
actual = {str(p.relative_to(PLANNING)): sha(p) for p in PLANNING.rglob('*')
          if p.is_file() and p.name != '.DS_Store' and TECH not in p.parents}
expected = {f['path']: f['sha256'] for f in fingerprints['files']}
if len(actual) != 65 or actual != expected:
    raise SystemExit('Input gate failed: refuse evidence packaging; report unexpected differences.')

git = lambda *args: subprocess.check_output(['git', '-C', str(LOCAL), *args], text=True).strip()
if git('diff', '--name-only') or git('diff', '--cached', '--name-only'):
    raise SystemExit('Tracked source is dirty. Commit reviewed source before packaging.')
if git('ls-files', '--others', '--exclude-standard'):
    raise SystemExit('Untracked source remains. Review/commit or explicitly classify it before packaging.')
commit = git('rev-parse', 'HEAD')
DEST.mkdir(parents=True, exist_ok=True)
archive = DEST / f'权限预研源码_{commit[:7]}.tar.gz'
subprocess.run(['git', '-C', str(LOCAL), 'archive', '--format=tar.gz', f'--output={archive}', commit], check=True)
bundle = DEST / f'权限预研提交历史_{commit[:7]}.bundle'
subprocess.run(['git', '-C', str(LOCAL), 'bundle', 'create', str(bundle), git('branch', '--show-current')], check=True)

copied = []
roots = [
    (LOCAL / 'evidence/raw', DEST / '实测原始记录'),
    (LOCAL / 'docs', DEST / '复现文档'),
    (LOCAL / '.superpowers/sdd/2026-09-23-permission-spike', DEST / '实施审查过程'),
    (LOCAL / 'output/playwright', DEST / '浏览器验证'),
]
for source, target in roots:
    if not source.exists():
        continue
    for p in sorted(source.rglob('*')):
        if not p.is_file() or p.name == '.DS_Store':
            continue
        dest = target / p.relative_to(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)
        copied.append({'path': str(dest.relative_to(DEST)), 'bytes': dest.stat().st_size, 'sha256': sha(dest)})

# Coverage is a first-class deliverable, not just a runner output below raw/.
for p in sorted((LOCAL / 'evidence').glob('*')):
    if not p.is_file() or p.name == '.DS_Store':
        continue
    dest = DEST / '矩阵与摘要' / p.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)
    copied.append({'path': str(dest.relative_to(DEST)), 'bytes': dest.stat().st_size, 'sha256': sha(dest)})

manifest = {
    'packaged_at': datetime.now().astimezone().isoformat(timespec='seconds'),
    'source_commit': commit, 'source_branch': git('branch', '--show-current'),
    'source_archive': {'path': archive.name, 'bytes': archive.stat().st_size, 'sha256': sha(archive)},
    'history_bundle': {'path': bundle.name, 'bytes': bundle.stat().st_size, 'sha256': sha(bundle)},
    'input_baseline_version': fingerprints['baseline_version'],
    'input_fingerprint_manifest_sha256': sha(baseline), 'input_count': 65,
    'planning_input_modified': False,
    'copied_file_count': len(copied), 'files': copied,
    'meaning': 'File integrity manifest only. It does not assert permission or performance gates passed.',
}
(DEST / '交付证据指纹.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'source_commit': commit, 'source_archive': str(archive), 'copied_files': len(copied), 'source_archive_bytes': archive.stat().st_size}, ensure_ascii=False, indent=2))
