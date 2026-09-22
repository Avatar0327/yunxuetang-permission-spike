#!/usr/bin/env bash
set -euo pipefail
spike_docker() { docker --context colima-yxt-permission "$@"; }

# Synthetic spike services only. Does not modify any planning input.
if ! spike_docker network inspect yxt-permission >/dev/null 2>&1; then
  spike_docker network create yxt-permission
fi
spike_docker volume create yxt-permission-pgdata >/dev/null

if spike_docker container inspect yxt-pg >/dev/null 2>&1; then
  spike_docker start yxt-pg
else
  spike_docker run -d --name yxt-pg --network yxt-permission \
    --cpus 4 --memory 8g --memory-swap 8g --shm-size 1g \
    -p 127.0.0.1:55432:5432 \
    --mount source=yxt-permission-pgdata,target=/var/lib/postgresql/data \
    -e POSTGRES_USER=spike -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=permission_spike \
    postgres@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652 \
    -c shared_buffers=2GB -c work_mem=16MB -c max_connections=160 \
    -c shared_preload_libraries=pg_stat_statements -c track_io_timing=on
fi

if spike_docker container inspect yxt-redis >/dev/null 2>&1; then
  spike_docker start yxt-redis
else
  spike_docker run -d --name yxt-redis --network yxt-permission \
    --cpus 1 --memory 1g --memory-swap 1g -p 127.0.0.1:56379:6379 \
    redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f \
    redis-server --maxmemory 512mb --maxmemory-policy noeviction --appendonly no
fi

spike_docker exec yxt-pg pg_isready -U spike -d permission_spike
spike_docker exec yxt-redis redis-cli PING
