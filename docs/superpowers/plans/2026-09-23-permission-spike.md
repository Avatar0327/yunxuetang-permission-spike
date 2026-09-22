# Permission spike implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. This is an isolated research prototype, not formal B1 development.

**Goal:** Execute the approved permission spike using real Native/Casbin engines, PostgreSQL, Redis and two NestJS/Fastify instances; produce reproducible evidence even if the gate is No-Go.

**Architecture:** Modular monolith with central authz. Organization exposes public facts/scope ports; reports never access organization private tables. All business service paths, including jobs and media segments, require current authorization.

**Tech Stack:** Node 24 LTS, TypeScript, NestJS/Fastify, Vue3/Element Plus for the minimum backend shell, PostgreSQL, Redis, node-casbin. Lock exact dependency versions. Parameterized SQL is explicitly allowed by the design.

**Spec:** `/Users/peng/Library/Mobile Documents/com~apple~CloudDocs/Agent复刻项目/云学堂复刻规划/03_技术方案/04_权限模型与三天预研.md` (read-only); business scope is also bound by the user's v8.3 instruction. This plan does not alter approved semantics.

## Global Constraints

- T-05：各角色/节点内先应用人员覆盖，再合并同节点同动作的有效授权；覆盖仅影响对应角色。字段绑定该对象上实际匹配的授权来源。
- T-06：任命项目负责人后可进入管理后台，仅授予培训中心对应功能和任命项目权限。其他合法角色和任命保留。
- T-07：客户甲/乙/内部三类身份；所有角色并集、六范围和项目任命都与公司上限取交集。共享内容不共享名册/学习数据。
- 每个受保护请求从权威数据库读取当前版本及账号有效性。Redis 故障采用 fail closed，不允许 DB fallback。Pub/Sub 不是撤权保证。
- 撤销事务提交后新发起的下一请求必须失效，包括媒体每个新分片、导出执行和领取；高风险写入必须与撤销事务排序。
- PostgreSQL 4 vCPU/8 GB；两个应用实例各2 vCPU/4 GB；独立Redis；50并发客户端、每页50条、持续10分钟。权限额外耗时p95≤50ms，列表含过滤/count p95≤500ms，复杂历史聚合p95≤2s。授权错误0，无N+1。有效/拒绝/基础设施失败与冷热缓存分别统计，快速拒绝不计正常查询性能。
- 任何越租户/越范围/字段泄漏、撤销后新请求仍成功、故障放行、语义未裁定或性能未达门槛均不放行。未执行就是未完成，不得声称通过。
- Input documents 00/01/02 and handoff are read-only. Work only in this local prototype and 03_技术方案 outputs. No formal feature implementation; no production data, no external sends.
- Record literal expected values derived from the spec, RED/GREEN commands and output. Never manufacture timings, fault injection results or human signatures. Prototype reuse credit remains0.

## File boundaries and task interfaces

Task1 owns `src/authz/{contracts,policy,scope,delegation,candidates}.ts`, semantic fixtures/tests, package/tsconfig, and `docs/kernel-contract.md`. Task2 owns bootstrap/Nest transport, public module ports and database adapters under `src/{organization,training,knowledge,report,account,infrastructure}`, authz revision/cache/SQL adapters, migrations/seed, integration/fault/performance runners, and web shell. It may extend Task1 contracts only compatibly or with explicit controller ruling. Controller owns Docker environment, evidence runs, audit documents and report. Files may be split within their named module to keep each responsibility readable; no catch-all service.

### Task 1: Central authorization semantics and two genuine candidate engines

**Files:** package.json/package-lock.json/tsconfig.json; `src/authz/contracts.ts`, `policy.ts`, `scope.ts`, `delegation.ts`, `candidates.ts`; `test/semantic.test.ts`, `test/fixtures.ts`; `docs/kernel-contract.md`.

**Interfaces:** Produce typed central policy normalization and `NativeCandidate`/`CasbinCandidate` accepting the same effective grants and resource facts. Async candidate match returns the matching source IDs and field capabilities, not just a boolean. Produce scope expressions that Task2 can resolve in bulk through OrganizationPublic and compile to SQL. Document exact exported signatures in kernel-contract.md for the next task; Task2 must not reinvent role/override/scoping rules. All authorization inputs are server facts, never client-provided grant objects.

- [ ] Read the complete 04 spec, then write independent literal fixtures/tests before implementation. The pure kernel tests do not count as real SQL/two-instance/UI evidence.

Required fixture truth table (add distinct source IDs, tenant/company/node/action and role memberships so matching can be audited):
* Main tenant T1 and T2 same-name objects. Internal I, customer A, customer B. Actor M in dept D1; A in D1 managed by M, B in D2 managed by M, C in D1 managed by N, D in child D11 managed by N, E in D2 managed by A. Team(M)=[A,B], ownDept(M) includes A,C but not B,D,E; subtree includes A,C,D, excludes B,E. Use exact literal expected arrays for fixture IDs.
* Node personal-learning view ALL and node department-report view ownDept remain independent. An edit-ownDept role plus view-all role grants view-all but edits only ownDept. Override first membership to SELF preserves view-all from the other membership. Empty override yields zero grants for that source; deleting restores inheritance. Override cannot create actions/nav/fields. Jurisdiction belongs to membership, no config=>empty. Specified departments descendants default false.
* Source A grants raw phone on dept D1 and source B grants masked viewing D2. D2 raw phone must be absent. Tenant/company/disabled/deleted/unknown node/unknown subject hard failures apply before source union. View grant cannot enlarge edit or download scope.
* Ordinary learner has no backend; P appointment derives shell/training registered capabilities and P only. P+Q then revokeP retainsQ; revoke last removes shell; lawful role preserves its rights. Appointment grants do not confer organization/roles or automatic raw fields/delegation. Company cap still applies; whole-project mutation requires all affected companies.
* Each six-scope parameter boundary has explicit allowed/denied cases. SELF anchors: person-learning/account personId, course uploaderId, project createdBy, face-to-face ownerId. Unsupported node/scope must deny; no universal createdBy shortcut.
* Delegate with selected membership A cannot borrow B's larger powers. Levels2/3 cannot edit equal/higher, ordinary create cannot createlevel1, level1 ordinary edit denied. Proposed actions, actual resolved sets and raw field caps must be subsets of A and explicitly delegable. Appointments not delegable. Provenance inactive/recheck/suspended sources deny; regrant new membership cannot use old override. Compare sets, not enum ranks.
* Category browse/maintain/distribute/download independent; forced ancestry lock applies to creator and course browse override; unlocked custom replaces browse only. Public means authenticated same tenant. SubjectResolver extension uses common grants (mock classroom member) without changing query/matcher code. Unknown resolver fails closed.
* History facts retain dataCompanyId. Current member set filters history; external customer cannot see previous-company history via SELF; own wallet-only path may show own separate company accounts but no cross-company offset/source references.

Example independently specified expectations:
```ts
assert.deepEqual(actual.teamIds, ['A','B']);
assert.equal(actual.editCFromViewAll, false);
assert.deepEqual(actual.rawPhoneSourcesForB, []);
assert.equal(actual.backendAfterLastAppointmentRevoked, false);
```
Use the actual production contract rather than creating an `actual` object of hardcoded expected booleans. Casbin must run a real model/matcher with policy rows and collect source IDs. Do not call Native then feed its final allow result into Casbin. Common semantic normalization/scope resolution is expected; clearly record what Casbin cannot replace.

- [ ] Run semantic test command RED; save full output and timestamp to evidence/raw/task1-red.txt. Missing module is acceptable first RED; add focused behavior RED for later additions.
- [ ] Implement minimal typed policy, scope and delegation functions, plus genuine engines; add only required module structure.
- [ ] Run semantic tests and typecheck; save GREEN outputs. Independently compare both candidate results against literal expected IDs/fields and report mismatches by case. Capture engine versions and small candidate microtimings, clearly separate from HTTP performance.
- [ ] Write kernel-contract.md with interfaces and consumer example; commit task files; report exact commands/results, files, unresolved requirements and limits. Do not claim AUTH-Txx overall pass based on unit tests. Do not dispatch subagents.

### Task 2: PostgreSQL, two-instance Nest integration and measurable acceptance paths

**Files:** `src/authz/revision.ts`, `cache.ts`, `compiler.ts`; `src/infrastructure/db.ts`; module public/application/infrastructure files under organization/training/knowledge/report/account; `src/bootstrap.ts`; `sql/schema.sql`, `sql/seed.sql`; `test/integration.test.ts`; `scripts/run-functional.ts`, `run-faults.ts`, `benchmark.ts`, `explain.ts`; Vue3 web shell under `web`; README and evidence configuration.

**Interfaces:** Read Task1's `docs/kernel-contract.md`; consume its central grants/candidate/scope contract without duplicate policy rules. Expose two real HTTP processes using NestJS+Fastify on ports4311/4312. Use PostgreSQL host127.0.0.1:55432 database `permission_spike` user/password `spike`; Redis127.0.0.1:56379. Isolated synthetic fixture credentials only. Container service hosts will be injected through environment variables. Node24. Controller will set up containers and resource caps. Docker config is controller-owned.

**Acceptance specification:** Full 04§9.4 AUTH-T01 through AUTH-T24 with subcases. Every assertion records its actual output, expected literal IDs/status/fields, candidate, request/commit/revision timestamps, source IDs, and pass/fail/incomplete. Do not generate expected outcomes using the production policy/compiler. Use scoped synthetic case tables with explicit truth for correctness, then independently asserted aggregate counts for large data. Mark any unimplemented subcase incomplete; do not weaken a test to obtain green.

- [ ] Write failing integration tests against real infrastructure, not mocks. Cover PostgreSQL before adding HTTP wrappers.
- [ ] Implement isolated SQL model with tenant-qualified foreign keys/unique keys. Central revision row is authoritative. Grants, overrides, appointments, customer grants, current org/manager/state and provenance mutations bump revision in the same transaction. Every protected request performs authoritative revision/account read and live Redis availability operation (warm L1 never bypasses faults). Versioned snapshot key includes tenant+person+revision, build before/after revalidation. Unknown nodes/subjects/policy schema fail closed. Pub/Sub optional with off switch and observable evidence.
- [ ] OrganizationPublic resolves permitted people in bulk to version-bound IDs or relation. Reports use own `unnest` CTE or private request relation, never organization private tables. ALL skips 50k enumeration but retains tenant/company/state constraints. Same SQL predicates filter before list/count/search/detail/export/aggregation; server-side field projection depends on row-matching source. No raw personal fields in unauthorized results/logs/cache. Map private module table access statically and document splitability.
- [ ] Build50,000 main-tenant people, >=500 second-tenant people,2,000 departments with20-depth and wide branches; >=20roles,2–5roles for sampleactors; categories10depth; shared mixed-company project;1,000,000history facts. Reject department21/cycle/invalidparent and category11. Seed deterministic synthetic data, include cross-company transfer/history and disabled/deleted/restored cases.
- [ ] Add service paths and minimal HTTP handlers for list+count/search/detail/report aggregate, project save/team toggles/appointments, controlled attachment/download/media fragments, export create/execute/claim, delegation/source freeze/recheck and user changes. Domain methods require central policy even when bypassing Guard. Requests after revoke commit deny old tickets. Writes lock authority revision until commit, while revoke takes conflicting lock; record both orderings (write-before-revoke lawful, revoke-before-write denied). Snapshot construction race retries or rejects, never leaks.
- [ ] Provide a Vue/ElementPlus backend shell calling /auth/me: learner/no appointment, P, P+Q, revokeP, revokeLast, role retained; training only and safe empty/error copy. No blanket global manager role. User-facing routes derive same central capabilities as APIs. Browser validation will be separate evidence, not implied by source.
- [ ] Run independent literal assertions for all AUTH rows on both candidates where applicable. Record exact subcase coverage; put untested paths explicitly in gaps.json. Direct service/job calls, tenant/company/raw-field fuzz negatives, coupled role/field cases and selected membership delegation must be included.
- [ ] Implement fault runner with real Redis stop/disconnect and timeout (e.g. CLIENT PAUSE or proxy), recovery, DB authority failure, Pub/Sub disabled while B retainsoldcache, A revoke/B next request, media segments/export execute/claim. Save JSONL time order. Catch and classify infra failures as503/no payload. No cached allow/DB fallback.
- [ ] Performance runner:50parallel clients sustained600seconds for the main reference run,50page; separate success/denial/failure histograms; hot/cold/redisfault phases; permission overhead measured distinctly from DB list/aggregate. At least ordinarylist and complexhistory endpoints measured on broad and constrained grants, twoinstances and candidateidentity recorded. Save per-request JSONL samples or bounded histogram with exact counts, p50/p95/p99, concurrency/configuration/window timestamps, query counts (20/50/200), EXPLAIN ANALYZE BUFFERS. No microbenchmark substitutes for end-to-end stats.
- [ ] Run functional and focused fault tests; typecheck/build; commit. Controller runs resource-matched long benchmark and independently audits output. Document commands, cleanup and all limitations. Do not dispatch subagents.

### Task 3: Evidence audit and reviewable Go/No-Go package

Controller task, no application changes. Read matrix raw output against every required subcase; missing evidence blocks Go. Execute complete benchmark after reviewed code/environment are ready, preserving failures and fixes separately. Use real browser for backend shell evidence. Save versions, source commit, environment limits, SQL plans and timelines. Independently review whole branch and reconcile all findings before claims. Write03/12 report,03/13 ADR, evidence links, risk/person-day ranges and a technical signature with user signoff blank. Update00/04/07/08/11 active status without changing frozen business inputs. Permanent gaps5, recitations7, simplestimplementations4, acceptedrisks2 stay in report. Prototype credit0; map files to possible replaced formal work without deduction. Recheck65 fingerprints and document counts at completion. Evidence incomplete or gate failed => No-Go; report still delivered.
