#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
spike_output="${1:-evidence/raw/runtime}"
mkdir -p "$spike_output"
spike_docker() { docker --context colima-yxt-permission "$@"; }
# Captures synthetic container configuration only. Never reads unrelated host env.
spike_docker inspect yxt-pg yxt-redis yxt-api-a yxt-api-b > "$spike_output/containers.json"
spike_docker exec yxt-pg psql -U spike -d permission_spike -X -A -t -c "SELECT json_build_object('version',version(),'database_collation',(SELECT datcollate FROM pg_database WHERE datname=current_database()),'database_ctype',(SELECT datctype FROM pg_database WHERE datname=current_database()),'shared_buffers',current_setting('shared_buffers'),'work_mem',current_setting('work_mem'),'max_connections',current_setting('max_connections'),'track_io_timing',current_setting('track_io_timing'),'track_commit_timestamp',current_setting('track_commit_timestamp'),'statement_timeout',current_setting('statement_timeout'))" > "$spike_output/postgresql-settings.json"
spike_docker exec yxt-pg psql -U spike -d permission_spike -X -A -t -c "SELECT json_build_object('main_people',(SELECT count(*) FROM organization.person WHERE tenant_id='T1'),'second_people',(SELECT count(*) FROM organization.person WHERE tenant_id='T2'),'departments',(SELECT count(*) FROM organization.department WHERE tenant_id='T1'),'roles',(SELECT count(*) FROM authz.role WHERE tenant_id='T1'),'load_facts',(SELECT count(*) FROM report.learning_fact WHERE fixture=false),'actual_facts',(SELECT count(*) FROM report.learning_fact),'at',clock_timestamp())" > "$spike_output/actual-data-counts.json"
spike_docker exec yxt-redis redis-server --version > "$spike_output/redis-version.txt"
spike_docker exec yxt-api-a node --version > "$spike_output/api-node-version.txt"
git rev-parse HEAD > "$spike_output/source-commit.txt"
python3 - "$spike_output" <<'PY'
from pathlib import Path
import json,sys
p=Path(sys.argv[1]); rows=json.loads((p/'containers.json').read_text())
expected={'yxt-pg':(4_000_000_000,8*1024**3),'yxt-redis':(1_000_000_000,1024**3),'yxt-api-a':(2_000_000_000,4*1024**3),'yxt-api-b':(2_000_000_000,4*1024**3)}
source=(p/'source-commit.txt').read_text().strip()
for row in rows:
 name=row['Name'].lstrip('/');actual=(row['HostConfig']['NanoCpus'],row['HostConfig']['Memory'])
 if expected[name]!=actual or not row['State']['Running']:raise SystemExit('Resource/runtime gate failed: '+name)
 if name.startswith('yxt-api') and row['Config']['Labels'].get('org.opencontainers.image.revision')!=source:raise SystemExit('Source label mismatch: '+name)
counts=json.loads((p/'actual-data-counts.json').read_text())
if not (counts['main_people']==50000 and counts['second_people']>=500 and counts['departments']==2000 and counts['roles']>=20 and counts['load_facts']>=1000000):raise SystemExit('Data scale gate failed')
print(json.dumps({'resource_gate':True,'data_scale_gate':True,'source_commit':source,'counts':counts},ensure_ascii=False))
PY
