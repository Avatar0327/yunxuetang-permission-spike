#!/usr/bin/env bash
# Controller-only orchestration. Run after reviewed implementation and all functional campaigns.
set -u -o pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
spike_campaign="${1:-evidence/raw/reference-$(date +%Y%m%dT%H%M%S)}"
if [ -e "$spike_campaign" ]; then
  echo 'Refuse to overwrite an existing evidence campaign.' >&2
  exit 2
fi
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo 'Require clean reviewed source before reference campaign.' >&2
  exit 2
fi
spike_docker() { docker --context colima-yxt-permission "$@"; }
for spike_name in yxt-api-a yxt-api-b; do
  if spike_docker container inspect "$spike_name" >/dev/null 2>&1; then
    echo "Existing $spike_name must be stopped and its evidence preserved first." >&2
    exit 2
  fi
done
if lsof -nP -iTCP:4311 -iTCP:4312 -sTCP:LISTEN >/dev/null 2>&1; then
  echo 'API ports in use; refuse overlapping campaign.' >&2
  exit 2
fi
mkdir -p "$spike_campaign"
git rev-parse HEAD > "$spike_campaign/source-commit.txt"
spike_failed=0
spike_current=''
spike_finish_window() {
  [ -n "$spike_current" ] || return 0
  for spike_name in yxt-api-a yxt-api-b; do
    if spike_docker container inspect "$spike_name" >/dev/null 2>&1; then
      spike_docker logs "$spike_name" > "$spike_current/$spike_name.log" 2>&1
      spike_docker inspect "$spike_name" > "$spike_current/$spike_name-final-inspect.json"
      spike_docker stop --time 15 "$spike_name" >/dev/null
      spike_docker rm "$spike_name" >/dev/null
    fi
  done
  spike_current=''
}
trap 'spike_finish_window; exit 130' INT TERM
trap spike_finish_window EXIT
for spike_candidate in native casbin; do
  for spike_temperature in hot cold; do
    spike_current="$spike_campaign/$spike_candidate-$spike_temperature"
    mkdir -p "$spike_current"
    echo "WINDOW_START $spike_candidate $spike_temperature $(date -u +%FT%TZ)"
    if ! npm run seed > "$spike_current/seed.txt" 2>&1; then
      echo 'seed_failed' > "$spike_current/incomplete.txt"
      spike_failed=1
      spike_finish_window
      continue
    fi
    if ! bash tools/start-apis.sh "$spike_candidate" "$spike_temperature" > "$spike_current/start-apis.txt" 2>&1; then
      echo 'startup_failed' > "$spike_current/incomplete.txt"
      spike_failed=1
      spike_finish_window
      continue
    fi
    spike_ready=0
    for spike_attempt in $(seq 1 60); do
      if curl -fsS -H 'Authorization: Bearer spike-Z' http://127.0.0.1:4311/auth/me > "$spike_current/ready-A.json" 2>/dev/null && curl -fsS -H 'Authorization: Bearer spike-Z' http://127.0.0.1:4312/auth/me > "$spike_current/ready-B.json" 2>/dev/null; then
        spike_ready=1
        break
      fi
      sleep 1
    done
    if [ "$spike_ready" -ne 1 ] || ! bash tools/capture-runtime.sh "$spike_current/runtime" > "$spike_current/runtime-check.json" 2>&1; then
      echo 'runtime_gate_failed' > "$spike_current/incomplete.txt"
      spike_failed=1
      spike_finish_window
      continue
    fi
    CANDIDATE="$spike_candidate" CACHE_MODE="$spike_temperature" SCENARIO=mixed PHASE=success CONCURRENCY=50 DURATION_SECONDS=600 OUTPUT="$spike_current/measurement" npm run benchmark > "$spike_current/runner.txt" 2>&1
    spike_code=$?
    printf '%s\n' "$spike_code" > "$spike_current/runner-exit.txt"
    [ "$spike_code" -eq 0 ] || spike_failed=1
    if [ -f "$spike_current/measurement/summary.json" ]; then
      python3 tools/audit-benchmark.py "$spike_current/measurement" > "$spike_current/independent-audit.json" 2>&1
      spike_code=$?
      printf '%s\n' "$spike_code" > "$spike_current/audit-exit.txt"
      [ "$spike_code" -eq 0 ] || spike_failed=1
      python3 tools/reference-window-gate.py "$spike_current/independent-audit.json" > "$spike_current/measured-window-gate.json" 2>&1
      spike_code=$?
      [ "$spike_code" -eq 0 ] || spike_failed=1
    else
      echo 'summary_missing' > "$spike_current/incomplete.txt"
      spike_failed=1
    fi
    echo "WINDOW_END $spike_candidate $spike_temperature $(date -u +%FT%TZ)"
    spike_finish_window
  done
done
printf '%s\n' "$spike_failed" > "$spike_campaign/campaign-exit.txt"
echo "CAMPAIGN_COMPLETE execution_or_threshold_failures=$spike_failed output=$spike_campaign"
exit "$spike_failed"
