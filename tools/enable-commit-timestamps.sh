#!/usr/bin/env bash
# Run only between exclusive synthetic campaigns; does not touch planning inputs.
set -euo pipefail
cd "$(dirname "$0")/.."
spike_output="${1:-evidence/raw/commit-timestamp-enablement}"
if [ -e "$spike_output" ]; then
  echo 'Refuse to overwrite an existing environment transition record.' >&2
  exit 2
fi
if lsof -nP -iTCP:4311 -iTCP:4312 -sTCP:LISTEN >/dev/null 2>&1; then
  echo 'Stop the synthetic API campaign before restarting PostgreSQL.' >&2
  exit 2
fi
spike_docker() { docker --context colima-yxt-permission "$@"; }
mkdir -p "$spike_output"
spike_docker exec yxt-pg psql -U spike -d permission_spike -X -A -t -c "SELECT json_build_object('at',clock_timestamp(),'track_commit_timestamp',current_setting('track_commit_timestamp'))" > "$spike_output/before.json"
spike_docker exec yxt-pg psql -U spike -d permission_spike -X -c 'ALTER SYSTEM SET track_commit_timestamp = on' > "$spike_output/alter.txt"
spike_docker restart yxt-pg > "$spike_output/restart.txt"
for spike_attempt in $(seq 1 60); do
  if spike_docker exec yxt-pg pg_isready -U spike -d permission_spike >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
spike_docker exec yxt-pg psql -U spike -d permission_spike -X -A -t -c "SELECT json_build_object('at',clock_timestamp(),'track_commit_timestamp',current_setting('track_commit_timestamp'))" > "$spike_output/after.json"
python3 - "$spike_output/after.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
if r['track_commit_timestamp']!='on':raise SystemExit('Commit timestamps not enabled')
print(json.dumps(r))
PY
