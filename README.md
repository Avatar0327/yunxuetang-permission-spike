> 当前交付结论（2026-09-23）：**No-Go**。24组168点为163通过/5性能失败；四个限配50客户端×600秒窗口完成。最终实测见 `evidence/coverage-matrix.md`、`performance-statistics.md`、`final-verdict.json`；复核入口为 `docs/证据复核与复现.md`。下文各Task的pending/incomplete描述保留当时里程碑语境，不能替代此最终状态。正式B1未启动，折抵0。

# 云学堂 v8.3 权限预研：隔离合成原型

This repository is an isolated synthetic permission spike. This milestone implements central policy consumption, real PostgreSQL queries, NestJS/Fastify HTTP, Redis fail-closed snapshots, two independent candidate paths, and focused revocation/race evidence. It includes the reviewed core/Task3/Task4 and Task5 protected-output/measurement implementation. Final controller audit records163passed/5performancefailed out of168, with real browser and four capped50-client600-second windows complete. OverallNO_GO; formalB1 is not authorized. See evidence/coverage-matrix.md,performance-statistics.md and final-verdict.json. Current contracts are in `docs/task5-ports.md`; the immutable24-group manifest is unchanged.

## Run

Node 24.21.0. On the host prepend `/opt/homebrew/opt/node@24/bin` to PATH. Infrastructure: PostgreSQL17 on127.0.0.1:55432, Redis7 on127.0.0.1:56379. Synthetic database/user/password: permission_spike/spike/spike. Docker infrastructure files belong to the controller.

```
npm ci
npm run seed
npm run build
PORT=4311 INSTANCE_ID=A CANDIDATE=native npm run start
PORT=4312 INSTANCE_ID=B CANDIDATE=native npm run start
```

`seed` drops only this synthetic database's `authz`, `organization`, `training`, `report`, `knowledge`, `account` schemas and rebuilds fixtures. Do not seed during requests or benchmarks. Every reset initializes a unique time-based revision so old Redis/L1 snapshot keys cannot be reused. The seed reports configured counts; integration tests query and assert actual counts independently.

Environment: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGPOOL` (default20), `REDIS_HOST`, `REDIS_PORT`, `REDIS_TIMEOUT_MS` (default300), `PORT`, `INSTANCE_ID`, `CANDIDATE=native|casbin`, `CACHE_MODE=hot|cold`. Within the Docker network use `PGHOST=yxt-pg PGPORT=5432 REDIS_HOST=yxt-redis REDIS_PORT=6379`. Bootstrap is `dist/src/bootstrap.js`; build includes source/tests/scripts. No Docker changes were made by this task.

The API binds 0.0.0.0. The synthetic UI is `/` and bundled Vue3/ElementPlus assets are local. Synthetic bearer tokens are `spike-M`, `spike-X`, `spike-Y`, `spike-L`, `spike-Z`, `spike-disabled`, `spike-deleted`, and complex actor `spike-person-00003`. These are fixture credentials, not a production login system. Actor and tenant come from hashed server session records; request query/body tenant IDs, person IDs, grant objects and raw-field claims do not set the acting identity.

## API

- `GET /auth/me`: normalized central management capabilities.
- `GET /report`: authorized person list and matching count; `node=department-report` selects constrained report. Supported narrowing: `fixture=true`, `id`, `search`, `limit=20|50|200`, `offset`.
- `GET /report?history=true`: learning facts, immutable data company and historical department. `state=enabled|disabled|deleted|all` applies current person projection; acting disabled/deleted accounts always deny.
- `GET /history`: history grouped by historical department from the same authorized relation; `groupBy=department,job,status` adds immutable job/status grouping used in reference scenarios.
- `GET /projects`, `/projects/:id`, `/projects/:id/roster`, `/projects/:id/media/:segment`.
- `POST /projects/:id` with `{title?,teamEnabled?}`: whole-project authority with all roster companies required. Team enrollment commands are implemented in Task4 below.
- `POST /appointments` with `{personId,projectId,active}`: exact registered appointment command capability, company cap and transactional revision bump.
- `POST /memberships/:id/revoke`: revoke source and freeze existing dependency descendants. Role creation/edit/recheck are implemented below.
- `POST /people/:id` with `{departmentId?,managerId?,companyId?,enabled?,deleted?}`: central authority and synchronous ReportProjection public-port delivery; historical facts stay immutable. Manager/job can be explicitly cleared; a normal command cannot clear the required main department. NULL-department fixtures are synthetic abnormal data only.
- `POST /exports` with report query options; `POST /exports/:id/execute`; `GET /exports/:id/claim`. Claims accept `?chunk=0` and return at most200 rows plus a protected nextChunk. Project/account job paths and separate limited-worker execution are documented in task5-ports.md. Every chunk and claim reauthorizes; creation revision/source epoch changes invalidate old jobs conservatively. Payload remains in protected domain-owned DB chunks. Requester execution can loop bounded transactions; the service worker performs one chunk per real request. A durable queue/production storage is not claimed.

Responses include synthetic evidence metadata: instance, candidate, request/response time, query count; report data adds revision, sources, actual cache state, permission and data milliseconds. Error responses contain only safe copy and timing/instance metadata. Production observability design is not claimed here.

## Verification and measurements

```
npm run test:semantic
npm run test:integration
node --import tsx --test test/races.test.ts
npm run typecheck
npm run build
EVIDENCE_DIR=evidence/raw/run-name npm run functional
# Exclusive self-managed two-process fault/domain campaign:
npm run functional:task5
npm run explain
```

Functional runner assumes freshly seeded fixtures and two hot-mode processes with the same candidate. Run it once for each candidate and reset fixtures between complete campaigns. `test:http` revokes M's broad membership: reseed afterwards. Integration/race tests restore their own edited memberships/project title; do not run them during performance windows. Faults stop/start only yxt-redis and yxt-pg in `colima-yxt-permission`, and issue real Redis CLIENT PAUSE; they require exclusive use of these synthetic services. `finally` blocks restart stopped services. Pub/Sub is deliberately never subscribed/published and every response reports `pubsub:false`.

```
CANDIDATE=native CACHE_MODE=hot SCENARIO=mixed \
  CONCURRENCY=50 DURATION_SECONDS=600 OUTPUT=evidence/raw/reference-name npm run benchmark
```

Set matching candidate/cache environment on **both API processes** before the run; runner variables do not reconfigure a running server. `API_A`/`API_B` default to ports4311/4312. `SCENARIO=mixed` rotates list-broad/list-constrained/history-broad/history-constrained equally across50 total clients and both instances. Single-scenario mode remains available. Broad actorM expects49998 current people/1000002 facts; complex actorperson-00003 has3 memberships, managed/local overrides, overlapping sources, partialI/A cap and large person/company caps, producing22875 people/457673 facts. Every HTTP200 checks complete first-page IDs, fields and historical department/job/status groups/counts/sums against independent seed arithmetic. Every200 response stores actualCandidate/count/rowCount/resultDigest; this is not one-in200 sampling. See task5-benchmark-fixture.md and each window's scenario-truth.json.

`PHASE=success|denial|fault` separates distributions. Denial usesL. `fault` does **not** inject a fault; the controller must maintain a real fault for the chosen window and recover afterwards. Each output directory contains every sample in `samples.jsonl.gz` (sampling ratio1), exact category counts, p50/p95/p99, permission/data timing, start/end, actual cache states, instance counts, query-count distribution and configuration. A short duration is a smoke test, never reference evidence. Hot successful runs prewarm each instance before the clock; cold report/history requests always skip cache reads after deleting the versioned key, while still reading authority, checking live Redis, reconstructing and revalidating. `CACHE_MODE` affects measured report/history paths; other UI/project paths continue normal caching. Cold does not mean PostgreSQL page cache or process cache is cold.

The API permission metric includes token lookup plus authoritative account/revision reads, live Redis operation, policy cache load/build, candidate source selection, bulk scope resolution and plan validation/compilation up to the repository boundary. SQL compile time is included separately by the service. List data time includes count and list SQL; transport and JSON serialization appear in end-to-end latency. The seed fixture and common semantics are shared. Casbin independently selects genuine static tenant/actor/node/action/revision/source policy rows, then common SQL handles each source's row scope and fields. No Native allow result is supplied to Casbin, and no engine is called per returned row.

`npm run test:task3`, `npm run test:task4`, and `npm run test:task5` must run serially with fresh seeds between domain campaigns. Exact command/evidence history lives in the task report.

Raw evidence is intentionally gitignored and stays under `evidence/raw`; task report links exact runs. Browser QA, capped long windows, full matrix completion and final Go/No-Go remain controller work after follow-up implementation.


## Task 3: persisted knowledge and selected-source delegation

This adds a bounded domain milestone, not formal B1 or an overall Go. `docs/task3-coverage.json` maps focused observations; the 168-point acceptance manifest remains unchanged; browser and full performance gates remain pending. `docs/task3-ports.md` describes public boundaries and remaining split/deployment work.

New commands (synthetic authenticated session still required):

- `POST /roles` accepts `{id?,level:2|3,managementRoleMembershipId,policies,memberPersonIds?}`. Every policy uses registered `nodeId,navigation,actions,rawFields,scope,delegableActions`; grants are resolved from the single selected source. Same/higher restriction applies to editing only.
- `POST /roles/:id` updates canonical policy and all memberships, preserving local overrides and lifecycle status. `POST /roles/:id/members` grants a new membership ID; old overrides never attach. `POST /memberships/:id/recheck` takes the acting `managementRoleMembershipId`, rechecks the stored original source, then audits `active` or `suspended`.
- `POST /departments/:id/move` takes `{parentId:string|null}` and validates the entire subtree's depth, then freezes dependent configurations in the same transaction. Company-qualified parent and person constraints are implemented in Task4; movement uses its own registered department action.
- `POST /categories` accepts `{id,parentId?,inheritParent?,forceChildren?,grants,managementRoleMembershipId}`. Each grant has an exact course action and a subject `{type,id}`. Supported subjects are same-tenant authenticated `public` (browse only), user, role, and the synthetic `classroom_member` relation.
- `POST /categories/:id` replaces local policy; `/categories/import` takes `{updates:[{id,...}]}` atomically. Locked descendants and creators cannot change local policies. `POST /categories/:id/append-preview` returns exact retained/additional grants and a revision; `/append` requires that revision plus the additions and selected source. It changes only that named parent.
- `GET /courses` and `/courses/:id` accept registered `action`, default browse, with narrowing `prefix,limit,offset`. Four independent actions are `knowledge.course.browse|maintain|distribute|download`. These actions share one authorized SQL relation; no resource-row candidate calls.
- `POST /courses/:id` maintains title/current publication/access/status, `/distribute` requires distribution, `/browse-policy` replaces browse only with selected-source ceiling and ancestry lock checks. `GET /courses/:id/download` returns protected synthetic bytes and reauthorizes every new request; no storage URL is exposed. Course and face-to-face object creation remain synthetic fixtures rather than product authoring flows.
- `GET /face-to-face` and `/face-to-face/:id` demonstrate the registered owner SELF anchor. Course SELF is uploader; project SELF is original creator.

New domain fixtures are created inside tests. `prepareAdmin` explicitly grants the system-origin administrator delegable actions for these fixture campaigns; level 1 alone never grants delegability. Every derived membership carries source, revision and exact object/field caps. Category/custom policies also persist source cap snapshots. Source/organization/object-set changes freeze dependent policies before commit; successful explicit configuration writes revalidate the chosen source. Conservative freezing can affect unrelated derived policies in the same tenant. Membership recheck is explicit. `POST /categories/:id/recheck` and `POST /courses/:id/recheck` revalidate the stored original source, persist active/suspended, and append knowledge-owned audit rows; ordinary authorized policy saves also revalidate the chosen source.

Run serially against the synthetic database (these mutate shared fixtures):

```
npm run seed
npm run test:task3
npm run functional:task3
```

The functional extension starts both API processes itself, verifies warm B download → real Redis CLIENT PAUSE timeout with no bytes → recovery → A membership revoke → B next request denied, with Pub/Sub unused, then stops both processes. It does not stop Docker services. The download fixture is a protected database payload, not a production OSS/CDN deployment.


## Task4: company, team, account, current/history

This is still a synthetic permission spike. See [seed formulas](docs/task4-seed-contract.md), [public contracts and continuation](docs/task4-ports.md), and [focused evidence map](docs/task4-coverage.json). No 168-point gate or overall Go is inferred.

- `POST /projects/:id/enrollments` accepts `{operation:"add"|"remove",personIds:[...]}`;1..200 unique targets, atomic batch. Direct team is strict manager equality. Project role/appointment add/remove permissions are independent of the team switch.
- `/projects/:id/roster?search=...` applies company/current-person constraints before list/count/search. `GET /projects/:id/people/:personId/progress|attachment` protects personal data; shared course browse stays under content grants.
- `POST /company-grants` accepts `{personId,companyId,active,managementRoleMembershipId}` with exact selected-source delegability and target/company caps. Only internal people receive cross-company grants.
- `GET /account/own` returns the actor's balances/debts by company/currency. `GET /account/entries`, `/account/entries/:id`, `/account/entries/:id/source`, `/account/export` are separate management actions, still company-bound. Legacy account export is now a reauthorized live page of at most200 rows with nextOffset; protected complete export jobs live under `/account/exports`, including source epoch/revocation/limited-worker checks.
- `POST /account/offset` takes `{debtId,rewardId}` and performs a real atomic same-person/company/currency offset under its registered action. It is not a formal reward/credit engine.
- `POST /departments/:id/move` now uses the department node and `organization.department.move`; all affected descendants and the destination parent must be covered. `organization.person.update` alone cannot move departments.
- Normal `POST /people/:id` consumes actual same-action person caps and both companies on transfer. `managerId:null` and `jobId:null` clear those nullable fields; `departmentId:null` denies per approved02. Tests inject missing departments through an explicit abnormal-fixture helper and synchronize projections; nullable storage remains a documented prototype exception.

History and management account delegation now use a tagged person/company cap instead of generated fact/entry IDs, so newly generated same-company rows are readable without treating row creation as a permission change. Existing source/organization/company changes retain freeze/recheck. Old or unknown cap dimensions fail closed until original-source recheck. See task4-ports.md for migration and scalability boundaries.

```
npm run seed
TASK3_OBSERVATIONS=evidence/raw/my-task4-run.jsonl npm run test:task4
npm run functional:task4
```

The observer environment name is retained for compatibility. Always choose fresh evidence filenames; RED evidence is immutable. Task4's delivery suite starts and stops bothAPI processes, uses real revision lock waits, and injects Redis CLIENT PAUSE. Data-mutating suites run serially, with a fresh seed before scale assertions. Task3 role/dept test fixtures can persist past their suite, so reseed before Task4 or benchmarking.

Task5 adds protected200-row report/project/account export jobs and limited worker execution, enrollment name snapshots, signed synthetic media tickets, real business hash routes, and mixed benchmarks with an independent full-result oracle. See [Task5 ports](docs/task5-ports.md) and [complex fixture](docs/task5-benchmark-fixture.md). Run `npm run test:task5`; `npm run benchmark:smoke` is a short correctness smoke. Reference: start both APIs with matching `CANDIDATE`/`CACHE_MODE`, then `SCENARIO=mixed CONCURRENCY=50 DURATION_SECONDS=600 npm run benchmark`. `PHASE=denial|fault` must run separately. Actual browser, four capped reference windows and independent168 audit are complete; five performance requirements failed and formalB1 remains prohibited.
