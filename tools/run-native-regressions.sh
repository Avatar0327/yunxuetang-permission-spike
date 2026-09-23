#!/usr/bin/env bash
# Controller-owned isolated source snapshot. Native-only regression; not a performance window.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
spike_dest="${1:?new output path}";spike_repo="$PWD"
[ ! -e "$spike_dest" ] || { echo refuse_overwrite;exit 2; }
[ -z "$(git status --porcelain --untracked-files=normal)" ] || { echo require_clean_source;exit 2; }
if lsof -nP -iTCP:4311 -iTCP:4312 -sTCP:LISTEN >/dev/null 2>&1;then echo port_in_use;exit 2;fi
mkdir -p "$spike_dest/workspace"
spike_dest="$(cd "$spike_dest" && pwd)";spike_source="$(git rev-parse HEAD)"
git archive HEAD | tar -xf - -C "$spike_dest/workspace"
ln -s "$spike_repo/node_modules" "$spike_dest/workspace/node_modules"
printf '%s\n' "$spike_source" > "$spike_dest/source-commit.txt"
cd "$spike_dest/workspace"
mkdir -p evidence/raw
OBSERVE=0 node --import tsx --input-type=module -e "import {pool} from './src/infrastructure/db.ts';pool.options.statement_timeout=60000;await import('./scripts/seed.ts');" > "$spike_dest/seed.txt" 2>&1
export TASK3_OBSERVATIONS="$PWD/evidence/raw/observations.jsonl" HTTP_OBSERVATIONS="$PWD/evidence/raw/http-observations.jsonl" TASK5_TIMELINE="$PWD/evidence/raw/commit-timeline.jsonl" FINAL_FIX_SOURCE="$spike_source" FINAL_FIX_HTTP="$PWD/evidence/raw/final-fix-http.jsonl"
# Each selected file declares candidate-prefixed tests. Semantic.test.ts deliberately excluded because shared tests run both engines.
set +e
node --import tsx --test --test-concurrency=1 --test-name-pattern='^native:' \
 test/task3-entry.test.ts test/task3-company-cap.test.ts test/task3-role-company.test.ts test/task3-populated-delegation.test.ts test/task3-delivery.test.ts \
 test/task4-current-history.test.ts test/task4-history-caps.test.ts test/task4-source-boundary.test.ts test/task4-company.test.ts test/task4-delivery.test.ts \
 test/task5-navigation.test.ts test/task5-enrollment-conflict.test.ts test/task5-transfer.test.ts test/task5-runtime.test.ts test/task5-races.test.ts test/task5-faults.test.ts test/task5-nplus1.test.ts test/task5-ticket.test.ts test/task5-node-independence.test.ts test/final-fix-regressions.test.ts \
 > "$spike_dest/tests.tap" 2>&1
spike_code=$?
set -e
printf '%s\n' "$spike_code" > "$spike_dest/test-exit.txt"
python3 - "$spike_dest" <<'PY'
from pathlib import Path
import json,sys,hashlib
p=Path(sys.argv[1]);raw=p/'workspace/evidence/raw';rows=[json.loads(x) for x in (raw/'observations.jsonl').read_text().splitlines()];http=[json.loads(x) for x in (raw/'http-observations.jsonl').read_text().splitlines()];bad=[x for x in rows if x.get('candidate')!='native' or x['expected']!=x['actual']];assert not any(x.get('candidate')!='native' for x in http)
result={'sourceCommit':(p/'source-commit.txt').read_text().strip(),'testExit':int((p/'test-exit.txt').read_text()),'observations':len(rows),'httpObservations':len(http),'bad':bad,'nativeOnly':all(r['candidate']=='native' for r in rows),'scope':'Two real host API processes for functional/fault proof, not resource-capped performance gate.','rawFiles':[{'path':str(x.relative_to(p)),'sha256':hashlib.sha256(x.read_bytes()).hexdigest()} for x in sorted(raw.rglob('*')) if x.is_file()]};(p/'audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='rawFiles'},ensure_ascii=False));assert not bad and not result['testExit']
PY
exit "$spike_code"
