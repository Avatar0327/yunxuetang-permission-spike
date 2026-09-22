"""Capture host/DB clock uncertainty without modifying or synchronizing clocks."""
from datetime import datetime, timezone
from pathlib import Path
import json
import subprocess
import sys
import time

output = Path(sys.argv[1])
command = ['docker', '--context', 'colima-yxt-permission', 'exec', 'yxt-pg',
           'psql', '-U', 'spike', '-d', 'permission_spike', '-X', '-A', '-t',
           '-c', "SELECT json_build_object('db_at',clock_timestamp())"]
samples = []
for _ in range(3):
    before = datetime.now(timezone.utc)
    start = time.perf_counter()
    raw = subprocess.check_output(command, text=True)
    elapsed = (time.perf_counter() - start) * 1000
    after = datetime.now(timezone.utc)
    db_text = json.loads(raw)['db_at']
    db_at = datetime.fromisoformat(db_text.replace('Z', '+00:00'))
    samples.append({
        'host_before_utc': before.isoformat(), 'host_after_utc': after.isoformat(),
        'db_clock_utc': db_text, 'roundtrip_monotonic_ms': elapsed,
        'db_minus_host_lower_ms': (db_at - after).total_seconds() * 1000,
        'db_minus_host_upper_ms': (db_at - before).total_seconds() * 1000,
    })
result = {
    'samples': samples,
    'minimum_roundtrip_sample': min(samples, key=lambda r: r['roundtrip_monotonic_ms']),
    'meaning': 'Host-before/after bracket around a DB clock_timestamp read. This estimates clock offset uncertainty; it does not synchronize clocks or justify comparing raw cross-clock timestamps as exact order.',
    'revocation_order': 'Use matching DB commit/revision and authoritative read on the DB clock plus host request-after-ack causal ordering. Preserve both clocks.',
    'system_clocks_modified': False,
}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'output': str(output), 'samples': len(samples), 'system_clocks_modified': False}))
