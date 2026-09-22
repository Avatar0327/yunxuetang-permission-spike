# 云学堂 v8.3 权限预研：核心通路里程碑

This repository is an isolated synthetic permission spike. This milestone implements central policy consumption, real PostgreSQL queries, NestJS/Fastify HTTP, Redis fail-closed snapshots, two independent candidate paths, and focused revocation/race evidence. It does **not** complete Task 2 or authorize formal B1. Missing acceptance paths are tracked in `docs/task2-follow-up.md`; the immutable 24-group manifest is unchanged.

## Run

Node 24.21.0. On the host prepend `/opt/homebrew/opt/node@24/bin` to PATH. Infrastructure: PostgreSQL17 on127.0.0.1:55432, Redis7 on127.0.0.1:56379. Synthetic database/user/password: permission_spike/spike/spike. Docker infrastructure files belong to the controller.

```
npm ci
npm run seed
npm run build
PORT=4311 INSTANCE_ID=A CANDIDATE=native npm run start
PORT=4312 INSTANCE_ID=B CANDIDATE=native npm run start
```

`seed` drops only this synthetic database's `authz`, `organization`, `training`, `report`, `knowledge` schemas and rebuilds fixtures. Do not seed during requests or benchmarks. Every reset initializes a unique time-based revision so old Redis/L1 snapshot keys cannot be reused. The seed reports configured counts; integration tests query and assert actual counts independently.

Environment: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGPOOL` (default20), `REDIS_HOST`, `REDIS_PORT`, `REDIS_TIMEOUT_MS` (default300), `PORT`, `INSTANCE_ID`, `CANDIDATE=native|casbin`, `CACHE_MODE=hot|cold`. Within the Docker network use `PGHOST=yxt-pg PGPORT=5432 REDIS_HOST=yxt-redis REDIS_PORT=6379`. Bootstrap is `dist/src/bootstrap.js`; build includes source/tests/scripts. No Docker changes were made by this task.

The API binds 0.0.0.0. The synthetic UI is `/` and bundled Vue3/ElementPlus assets are local. Synthetic bearer tokens are `spike-M`, `spike-X`, `spike-Y`, `spike-L`, `spike-Z`, `spike-disabled`, `spike-deleted`. These are fixture credentials, not a production login system. Actor and tenant come from hashed server session records; request query/body tenant IDs, person IDs, grant objects and raw-field claims do not set the acting identity.

## API

- `GET /auth/me`: normalized central management capabilities.
- `GET /report`: authorized person list and matching count; `node=department-report` selects constrained report. Supported narrowing: `fixture=true`, `id`, `search`, `limit=20|50|200`, `offset`.
- `GET /report?history=true`: learning facts, immutable data company and historical department. `state=enabled|disabled|deleted|all` applies current person projection; acting disabled/deleted accounts always deny.
- `GET /history`: history grouped by historical department from the same authorized relation.
- `GET /projects`, `/projects/:id`, `/projects/:id/roster`, `/projects/:id/media/:segment`.
- `POST /projects/:id` with `{title?,teamEnabled?}`: whole-project authority with all roster companies required. Team toggle persistence is present; actual team enrollment mutation is not.
- `POST /appointments` with `{personId,projectId,active}`: exact registered appointment command capability, company cap and transactional revision bump.
- `POST /memberships/:id/revoke`: revoke source and freeze existing dependency descendants. Creating/delegating/rechecking those dependencies is not implemented.
- `POST /people/:id` with `{departmentId?,managerId?,companyId?,enabled?,deleted?}`: central authority and synchronous current report projection delivery; historical facts stay immutable. Clearing nullable relationships is not implemented.
- `POST /exports` with report query options; `POST /exports/:id/execute`; `GET /exports/:id/claim`. Exports are report exports, not project exports. Every phase reauthorizes; any tenant revision change invalidates an old job conservatively. Payload remains in the protected database. The runner is a synthetic inline execution route, not a durable queue.

Responses include synthetic evidence metadata: instance, candidate, request/response time, query count; report data adds revision, sources, actual cache state, permission and data milliseconds. Error responses contain only safe copy and timing/instance metadata. Production observability design is not claimed here.

## Verification and measurements

```
npm run test:semantic
npm run test:integration
node --import tsx --test test/races.test.ts
npm run typecheck
npm run build
EVIDENCE_DIR=evidence/raw/run-name npm run functional
EVIDENCE_DIR=evidence/raw/run-name npm run faults
npm run explain
```

Functional runner assumes freshly seeded fixtures and two hot-mode processes with the same candidate. Run it once for each candidate and reset fixtures between complete campaigns. `test:http` revokes M's broad membership: reseed afterwards. Integration/race tests restore their own edited memberships/project title; do not run them during performance windows. Faults stop/start only yxt-redis and yxt-pg in `colima-yxt-permission`, and issue real Redis CLIENT PAUSE; they require exclusive use of these synthetic services. `finally` blocks restart stopped services. Pub/Sub is deliberately never subscribed/published and every response reports `pubsub:false`.

```
CANDIDATE=native CACHE_MODE=hot SCENARIO=list-broad \
  CONCURRENCY=50 DURATION_SECONDS=600 OUTPUT=evidence/raw/reference-name npm run benchmark
```

Set matching candidate/cache environment on **both API processes** before the run; runner variables do not reconfigure a running server. `API_A`/`API_B` default to ports4311/4312. Run each `SCENARIO=list-broad|list-constrained|history-broad|history-constrained` separately. Broad actorM expects49998 current valid people or1000002 valid facts; constrained person reportM expects3 people; constrained customer historyX expects1 fact. These literal independent aggregate expectations are checked for every200 response. Field checks also reject raw values outside the literal A/C/M fixture set. This is not a replacement for the full correctness matrix.

`PHASE=success|denial|redisfault` separates distributions. Denial usesL. `redisfault` does **not** inject a fault; the controller must maintain a real fault for the chosen window and recover afterwards. Each output directory contains every sample in `samples.jsonl.gz` (sampling ratio1), exact category counts, p50/p95/p99, permission/data timing, start/end, actual cache states, instance counts, query-count distribution and configuration. A short duration is a smoke test, never reference evidence. Hot successful runs prewarm each instance before the clock; cold report/history requests always skip cache reads after deleting the versioned key, while still reading authority, checking live Redis, reconstructing and revalidating. `CACHE_MODE` affects measured report/history paths; other UI/project paths continue normal caching. Cold does not mean PostgreSQL page cache or process cache is cold.

The API permission metric includes token lookup plus authoritative account/revision reads, live Redis operation, policy cache load/build, candidate source selection, bulk scope resolution and plan validation/compilation up to the repository boundary. SQL compile time is included separately by the service. List data time includes count and list SQL; transport and JSON serialization appear in end-to-end latency. The seed fixture and common semantics are shared. Casbin independently selects genuine static tenant/actor/node/action/revision/source policy rows, then common SQL handles each source's row scope and fields. No Native allow result is supplied to Casbin, and no engine is called per returned row.

Raw evidence is intentionally gitignored and stays under `evidence/raw`; task report links exact runs. Browser QA, capped long windows, full matrix completion and final Go/No-Go remain controller work after follow-up implementation.
