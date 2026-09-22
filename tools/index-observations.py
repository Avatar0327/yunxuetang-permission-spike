"""Index literal observations for human coverage review; never infer a passed case."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
rows = []
for path in sorted((ROOT / 'evidence/raw').rglob('*.jsonl')):
    payload = path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    for line, text in enumerate(payload.decode().splitlines(), 1):
        if not text.strip():
            continue
        observation = json.loads(text)
        if not isinstance(observation, dict) or not {'expected', 'actual'} <= observation.keys():
            continue
        rows.append({
            'path': str(path.relative_to(ROOT)), 'line': line, 'fileSHA256': digest,
            'name': observation.get('name', observation.get('id')),
            'candidate': observation.get('candidate'),
            'literalEqual': observation['expected'] == observation['actual'],
            'expected': observation['expected'], 'actual': observation['actual'],
        })
target = ROOT / 'evidence/raw/controller-observation-index.json'
target.write_text(json.dumps({
    'meaning': 'Search index only. Includes preserved failed attempts; equality is not semantic coverage.',
    'observations': rows,
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'output': str(target), 'observations': len(rows),
                  'literalDifferences': sum(not row['literalEqual'] for row in rows)}, ensure_ascii=False))
