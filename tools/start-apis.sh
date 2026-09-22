#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
spike_candidate="${1:-native}"
spike_cache_mode="${2:-hot}"
case "$spike_candidate" in native|casbin) ;; *) exit 2 ;; esac
case "$spike_cache_mode" in hot|cold) ;; *) exit 2 ;; esac
spike_docker() { docker --context colima-yxt-permission "$@"; }
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo 'Commit the reviewed source before building a commit-labelled evidence image.' >&2
  exit 1
fi

# Explicitly refuse accidental replacement during a running evidence window.
for spike_name in yxt-api-a yxt-api-b; do
  if spike_docker container inspect "$spike_name" >/dev/null 2>&1; then
    echo "Container $spike_name exists; preserve its evidence and stop/remove it before a new window." >&2
    exit 1
  fi
done

spike_full_commit="$(git rev-parse HEAD)"
spike_commit="$(git rev-parse --short=12 HEAD)"
spike_image="yxt-permission:spike-$spike_commit"
if spike_docker image inspect "$spike_image" >/dev/null 2>&1; then
  spike_built_commit="$(spike_docker image inspect "$spike_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  if [ "$spike_built_commit" != "$spike_full_commit" ]; then
    echo 'Existing image has a different or missing source revision label.' >&2
    exit 1
  fi
else
  spike_docker build --tag "$spike_image" \
    --label "org.opencontainers.image.revision=$spike_full_commit" \
    --build-arg HTTP_PROXY=http://192.168.5.2:7890 \
    --build-arg HTTPS_PROXY=http://192.168.5.2:7890 \
    --build-arg NO_PROXY=localhost,127.0.0.1,yxt-pg,yxt-redis .
fi

for spike_instance in A B; do
  if [ "$spike_instance" = A ]; then
    spike_name=yxt-api-a
    spike_port=4311
  else
    spike_name=yxt-api-b
    spike_port=4312
  fi
  spike_docker run -d --name "$spike_name" --network yxt-permission \
    --cpus 2 --memory 4g --memory-swap 4g \
    -p "127.0.0.1:$spike_port:$spike_port" \
    -e "PORT=$spike_port" -e "INSTANCE_ID=$spike_instance" \
    -e "CANDIDATE=$spike_candidate" -e "CACHE_MODE=$spike_cache_mode" \
    -e PGHOST=yxt-pg -e PGPORT=5432 -e PGDATABASE=permission_spike \
    -e PGUSER=spike -e PGPASSWORD=spike \
    -e REDIS_HOST=yxt-redis -e REDIS_PORT=6379 "$spike_image"
done

spike_docker inspect yxt-api-a yxt-api-b \
  --format '{{.Name}} CPU={{.HostConfig.NanoCpus}} memory={{.HostConfig.Memory}} image={{.Image}}'
