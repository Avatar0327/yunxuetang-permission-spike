#!/usr/bin/env bash
# One strictly Native-only window. Controller owns DB/API environment during execution.
set -u -o pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
spike_dir="${1:?new evidence directory}"; spike_mode="${2:?baseline or observed or candidate}"; spike_temp="${3:?hot or cold}"
case "$spike_mode" in baseline|observed|candidate) ;; *) exit 2 ;; esac
case "$spike_temp" in hot|cold) ;; *) exit 2 ;; esac
[ ! -e "$spike_dir" ] || { echo 'Refuse overwrite'; exit 2; }
[ -z "$(git status --porcelain --untracked-files=normal)" ] || { echo 'Require clean committed source'; exit 2; }
spike_docker() { docker --context colima-yxt-permission "$@"; }
for spike_name in yxt-api-a yxt-api-b; do
 if spike_docker inspect "$spike_name" >/dev/null 2>&1; then echo 'Existing API, stop and preserve first'; exit 2; fi
done
if lsof -nP -iTCP:4311 -iTCP:4312 -sTCP:LISTEN >/dev/null 2>&1; then echo 'API port in use';exit 2;fi
mkdir -p "$spike_dir"
spike_controller="$(git rev-parse HEAD)"; spike_source="$spike_controller"; spike_observe=1
if [ "$spike_mode" = baseline ]; then spike_source=eb3fb3eae8332eea6acfc31da0696119225933f1; spike_observe=0; fi
spike_image="yxt-permission:spike-${spike_source:0:12}"
printf '%s\n' "$spike_source" > "$spike_dir/source-commit.txt"
printf '%s\n' "$spike_controller" > "$spike_dir/controller-commit.txt"
printf '%s\n' "$spike_mode" > "$spike_dir/window-mode.txt"
spike_cleaned=0
spike_finish() {
 [ "$spike_cleaned" -eq 0 ] || return 0
 for spike_name in yxt-api-a yxt-api-b;do
  if spike_docker inspect "$spike_name" >/dev/null 2>&1;then
   spike_docker logs "$spike_name" > "$spike_dir/$spike_name.log" 2>&1
   spike_docker inspect "$spike_name" > "$spike_dir/$spike_name-final-inspect.json"
   spike_docker stop --time 15 "$spike_name" >/dev/null
   spike_docker rm "$spike_name" >/dev/null
  fi
 done
 spike_cleaned=1
}
trap 'spike_finish; exit 130' INT TERM
trap spike_finish EXIT
if ! spike_docker image inspect "$spike_image" >/dev/null 2>&1;then
 [ "$spike_source" = "$spike_controller" ] || { echo 'Frozen baseline image missing';exit 2; }
 spike_docker build --tag "$spike_image" --label "org.opencontainers.image.revision=$spike_source" --build-arg HTTP_PROXY=http://192.168.5.2:7890 --build-arg HTTPS_PROXY=http://192.168.5.2:7890 --build-arg NO_PROXY=localhost,127.0.0.1,yxt-pg,yxt-redis . > "$spike_dir/build.txt" 2>&1 || exit 2
fi
[ "$(spike_docker image inspect "$spike_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$spike_source" ] || exit 2
# Provisioning budget only. Same SQL, measured API's statement_timeout stays10s.
OBSERVE=0 node --import tsx --input-type=module -e "import {pool} from './src/infrastructure/db.ts'; pool.options.statement_timeout=60000; await import('./scripts/seed.ts');" > "$spike_dir/seed.txt" 2>&1 || { echo seed_failed > "$spike_dir/incomplete.txt";exit 2; }
for spike_instance in A B;do
 if [ "$spike_instance" = A ];then spike_name=yxt-api-a;spike_port=4311;else spike_name=yxt-api-b;spike_port=4312;fi
 spike_docker run -d --name "$spike_name" --network yxt-permission --cpus 2 --memory 4g --memory-swap 4g -p "127.0.0.1:$spike_port:$spike_port" -e "PORT=$spike_port" -e "INSTANCE_ID=$spike_instance" -e CANDIDATE=native -e "CACHE_MODE=$spike_temp" -e "OBSERVE=$spike_observe" -e PGHOST=yxt-pg -e PGPORT=5432 -e PGDATABASE=permission_spike -e PGUSER=spike -e PGPASSWORD=spike -e REDIS_HOST=yxt-redis -e REDIS_PORT=6379 "$spike_image" >> "$spike_dir/start-apis.txt" 2>&1 || exit 2
done
spike_ready=0
for spike_i in $(seq 1 60);do
 if curl -fsS -H 'Authorization: Bearer spike-Z' http://127.0.0.1:4311/auth/me > "$spike_dir/ready-A.json" 2>/dev/null && curl -fsS -H 'Authorization: Bearer spike-Z' http://127.0.0.1:4312/auth/me > "$spike_dir/ready-B.json" 2>/dev/null; then spike_ready=1;break;fi
 sleep 1
done
[ "$spike_ready" -eq 1 ] || { echo readiness_failed > "$spike_dir/incomplete.txt";exit 2; }
SPIKE_EXPECTED_SOURCE="$spike_source" bash tools/capture-runtime.sh "$spike_dir/runtime" > "$spike_dir/runtime-check.json" 2>&1 || exit 2
if [ "$spike_mode" = baseline ];then
 python3 - "$spike_image" <<'CHECK_IMAGE'
import json,subprocess,sys
from pathlib import Path
old=json.loads(Path('evidence/raw/reference-final-eb3fb3e-20260923/native-hot/runtime/containers.json').read_text())
expected={r['Image'] for r in old if r['Name'] in ['/yxt-api-a','/yxt-api-b']};assert len(expected)==1
actual=json.loads(subprocess.check_output(['docker','--context','colima-yxt-permission','image','inspect',sys.argv[1]]))[0]['Id'];assert actual in expected,(actual,expected)
CHECK_IMAGE
 [ "$?" -eq 0 ] || exit 2
fi
spike_bench=scripts/benchmark.ts
if [ "$spike_mode" = baseline ]; then spike_bench=output/native-remediation/frozen-baseline/scripts/benchmark.ts; fi
CANDIDATE=native CACHE_MODE="$spike_temp" OBSERVE="$spike_observe" SCENARIO=mixed PHASE=success CONCURRENCY=50 DURATION_SECONDS=600 OUTPUT="$spike_dir/measurement" node --import tsx "$spike_bench" > "$spike_dir/runner.txt" 2>&1
spike_code=$?;printf '%s\n' "$spike_code" > "$spike_dir/runner-exit.txt"
# Keep final diagnostic records for requests whose clients timed out.
sleep 25
spike_finish
python3 tools/audit-benchmark.py "$spike_dir/measurement" > "$spike_dir/independent-audit.json" 2>&1;spike_audit=$?
python3 tools/native-window-gate.py "$spike_dir/independent-audit.json" > "$spike_dir/window-gate.json" 2>&1;spike_gate=$?
printf '%s\n' "$spike_audit" > "$spike_dir/audit-exit.txt"
printf '%s\n' "$spike_gate" > "$spike_dir/gate-exit.txt"
[ "$spike_audit" -eq 0 ] && [ "$spike_gate" -eq 0 ]
