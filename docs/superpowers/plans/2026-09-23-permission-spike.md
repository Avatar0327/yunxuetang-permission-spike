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

### Task 2: Core PostgreSQL, two-instance HTTP, revocation and measurement milestone

**Scope allocation revision:** The original Task2 was too broad for one bounded implementation/review. This task is the completed core milestone; Tasks3/4 below retain every remaining domain/coverage obligation. No AUTH group or overall gate is passed by this split. Original requirements remain in Git and the ledger workspace's task-2-original-scope.md. Full authority remains04§9.4 and docs/acceptance-manifest.json (24 groups,168 required subcases).

**Files:** authz revision/cache/compiler/bulk-candidate/registry; infrastructure db; organization public/service; report service/exports; training core service; Nest bootstrap; schema/seed; integration/http/race tests; functional/fault/benchmark/explain runners; Vue shell and README.

**Interfaces:** Consume Task1 central semantics without duplicate source/field logic. Real PostgreSQL17 on55432, Redis7 on56379, two Nest/Fastify processes4311/4312. Synthetic database permission_spike/spike/spike only. Node24. Environment and container caps are controller-owned. API contract is README; continuation map is docs/task2-follow-up.md.

- [ ] Real tenant-qualified SQL schema and 50k/500 people,2000departments/20depth,20roles,1m facts fixtures; actual-count assertions,21depth/cycle/invalidparent negative tests.
- [ ] Central authoritative tenant revision+acting account on every protected request, live Redis check even warmL1, versioned snapshots with before/after check; no DB fallback; actual independent Native/Casbin bulk source selection, no per-row engine calls.
- [ ] Six scopes/role-local overrides/action-bound union and row-source field projection in real parameterized list/count/detail/history SQL. Report queries use own projections and OrganizationPublic permitted sets, not organization private joins. ALL avoids50k enumeration but preserves company/state caps.
- [ ] Core project list/detail/roster/save/media/appointments, current person updates and membership revoke; report export create/execute/claim. Every exposed service path central-authorized; writes/revoke lock ordered. Additional training, account, knowledge and delegation paths are Tasks3/4 obligations, not claimed here.
- [ ] Two-instance functional tests both candidates, B oldL1/L2 with PubSub disabled, A commit then B next request/media denial. Real Redis stop/timeout/recovery, DB outage, snapshot race and both high-risk write/revoke orderings. Preserve timelines and initial failures.
- [ ] Benchmark runner separates candidate/cache/scenario/success/denial/infra failures, actual cache states and every sample; includes authority/poolwait/Redis/plan in permission metric, complete list+count and aggregate latency. Controller performs resource-matched full reference runs after Task4.
- [ ] Minimal Vue backend shell reflects central capabilities and safe business errors; browser test remains controller duty after all domain paths stabilize.
- [ ] Typecheck/build and dependency audit; write exact commands, raw paths, limitations, integration ports, and missing subcases in report and continuation map. Do not claim complete Task2 original scope or overall AUTH pass. Do not dispatch subagents.

### Task 3: Public module ports, classification and delegation integration

**Files:** new owning-module services/public ports under knowledge/account/authz/training/organization/report, compatible central contracts/registry/schema/seed/bootstrap extensions; focused tests and functional/fault runner extensions; README and continuation map. Do not edit Docker/controller tools or planning inputs. Keep implementation within this isolated synthetic permission spike.

**Read:** docs/kernel-contract.md, docs/task2-follow-up.md, README.md, docs/acceptance-manifest.json and the full authoritative04. Use every168subcase as an audit checklist, preserve unknowns. Core code is reviewed before this task. Derive literal expectations independently of policy/compiler. Write failing focused behavior tests before each new domain implementation; save actual RED/GREEN. No fabricated historical failures.


- [ ] Introduce explicit OrganizationFacts, TrainingFacts, ReportProjection public ports for current direct foreign-private-table access named in continuation map. authz central strategy may orchestrate these facts ports without circular authorization. Report repository never joins organization private tables. Document/import-check module boundaries and ability to split; source and SQL boundary checks.
- [ ] Implement knowledge persistence: category ancestry and10depth, four independent actions, creator/custom browse under ancestry lock, public same-tenant authenticated, publication/access states, protected downloads without storage bypass, direct API/import/parent-append authorized commands. Add mock classroom SubjectResolver and demonstrate same unchanged resource query handles it. Courses SELF use uploader, project SELF original creator, face-to-face SELF owner; unsupported combinations reject.
- [ ] Implement delegation create/edit with selected managementRoleMembershipId: levels2/3 create, no1; edit equal/higher denied; same selected source action/set/field ceiling and explicitly delegable; no borrowing from other role/appointment. Exact resolved object sets, provenance/cap/version, graph cycles denied. Organization/source changes atomically freeze dependents, explicit recheck active/suspended audit; revoked membership recreated with newID does not revive old override. Test source shrink and populated department move.
- [ ] Focus on AUTH-T07/08/09/20/24 and splitability. Extend real SQL/domain/HTTP tests for both candidates with subcase-to-raw mapping. Other mandatory domains are Task4. Update continuation map and report exact unexecuted paths rather than claiming a full group from pure unit tests.
- [ ] Run covering tests, typecheck/build/audit; commit scoped files; report exact evidence and interfaces for Task4. Stop any own API processes before handoff. No subagents.

### Task 4: Company-qualified fixtures, team, account and current/history integration

**Execution boundary:** Deliver the company/team/account contracts first. All previous Task4 acceptance obligations remain in Tasks4/5; the controller audit becomes Task6. This is a bounded implementation/review split, not permission gate reduction.

**Files:** new owning-module services/public ports under knowledge/account/authz/training/organization/report, compatible central contracts/registry/schema/seed/bootstrap extensions; focused tests and functional/fault runner extensions; README and continuation map. Do not edit Docker/controller tools or planning inputs. Keep implementation within this isolated synthetic permission spike.

**Read:** docs/kernel-contract.md, docs/task2-follow-up.md, README.md, docs/acceptance-manifest.json and the full authoritative04. Use every168subcase as an audit checklist, preserve unknowns. Core code is reviewed before this task. Derive literal expectations independently of policy/compiler. Write failing focused behavior tests before each new domain implementation; save actual RED/GREEN. No fabricated historical failures.


**Interfaces:** Consume reviewed Task3 public ports, catalog/delegation services, and selected-source contracts. Do not reimplement them; read its report and continuation map.

- [ ] Implement team add/remove: M directA/B only (crossdepartmentB allowed; C/D/E denied), switch gates only team path, appointments independent, current-state/company cap, batch atomic validation and high-risk transaction order.

- [ ] Align synthetic company/organization invariants with approved02§4/5: departments carry company_id and parent belongs to samecompany; people with a nonempty department must belong to thatcompany. Rebuild valid mixedcompany bulk fixtures within50000people/2000departments; retain explicit NULL/invalid negative cases. Core seed placed threecompanies in companylesswide departments, which cannot substantiate the approved company hierarchy contract. Preserve department20depth/cycle and current/history tests and add crosscompany parent/person-department negatives. Internal company cap is owncompany plus explicitgrants (Task3 repair), external remains owncompany only.

- [ ] Implement T07 mixed-company project personal progress/search/attachments (project exports are Task5), customerA/B appointed managers, ordinary customer learner, internal non-super with only explicitcompany grants. Shared course access follows content grants; whole-project changes cover all affected companies. Grant/revokecompany immediate, other grants retained; transferred person history company remains immutable and newcompany SELF report cannot accessoldcompany.

- [ ] Implement minimal own account and management account paths with separate company balances/debts, B reward cannot offset A debt, own narrow wallet exception only, deny crosscompany source references/exports. Include a samecompany/samecurrency positive offset control as well as the forbidden crosscompany offset, so a blanket no-offset implementation cannot pass. Synthetic account operations test isolation, do not build full formal credit engine.

- [ ] Complete current enabled/disabled/deleted/restored and dept/manager/transfer null boundary tests with immutable historical department/job/state/company and current projection freshness. Derived history caps must use current authorized person plus immutable fact-company combinations rather than fixed historical fact IDs; new samecompany facts for an authorized person must remain accessible, including authorization before firstfact. Preserve source/field caps and source-change freeze/recheck; never turn this into crosscompany historical access. Same-name cross-tenant interference, unsupported/emptyscope, same-row field source and raw list/detail/error checks (export/cache/log scans are Task5); randomID and invalidresource fail closed.

- [ ] Run covering semantic/integration/domain/HTTP/fault suites where changed; typecheck/build/audit; commit scoped files; report exact evidence and residual risks. Stop own API processes before handoff. No subagents.

### Task 5: Protected exports, remaining fault/acceptance paths, browser shell and benchmark runner

**Execution boundary:** Consume reviewed Task4 company/team/account contracts and fixtures, as well as reviewed Task3 public ports. Complete all remaining168-subcase runtime paths, measurement runner and minimal UI; controller runs browser and long measurements in Task6. No domain may be marked passed from source or test counts alone.

**Files:** new owning-module services/public ports under knowledge/account/authz/training/organization/report, compatible central contracts/registry/schema/seed/bootstrap extensions; focused tests and functional/fault runner extensions; README and continuation map. Do not edit Docker/controller tools or planning inputs. Keep implementation within this isolated synthetic permission spike.

**Read:** docs/kernel-contract.md, docs/task2-follow-up.md, README.md, docs/acceptance-manifest.json and the full authoritative04. Use every168subcase as an audit checklist, preserve unknowns. Core code is reviewed before this task. Derive literal expectations independently of policy/compiler. Write failing focused behavior tests before each new domain implementation; save actual RED/GREEN. No fabricated historical failures.


**Interfaces:** Consume reviewed Task4 and Task3 public ports, catalog/delegation services, and selected-source contracts. Do not reimplement them; read its report and continuation map.

- [ ] Add project export create/execute/claim using reviewed Task4 roster/company/field predicates, and raw export/cache/log scans for all protected paths. Real limited service job identity with current requester authorization at create/execute/claim; chunked protected export output without unbounded in-memory allrows. Direct domain/job bypass of Guard denies. Include all export/media download fault/revoke paths, batchdelegation/download races, explicit DBcommit/request/revision times; do not relabel HTTP response time as exact commit.

- [ ] Extend real two-process candidate campaigns for every applicable required subcase; write machine-readable mapping to test IDs/raw actual/expected/commands. Do not fill whole groups from unit-only proof. Preserve holes as incomplete and investigate addressable ones; controller audits and runs long benchmark/browser.

- [ ] Use docs/coverage-map-contract.md for evidence/coverage-map.json: all168frozenIDs with actualResult/status and candidate/file/JSONL-line references. Leave controller browser/longbenchmark entries incomplete until real execution. Mechanical citation validation does not replace semantic review; do not auto-pass groups by matching IDs or test counts.

- [ ] Complete minimal Vue business navigation for T06 real-backend browser acceptance (including allowed project deep link and safe denied project/module route), preserve lawful other-role navigation, and label newly registered knowledge/role nodes accurately. Use docs/controller-acceptance-audit-notes.md browser campaign as the handoff checklist; controller executes the actual browser campaign. Do not build full formal role/course product UI.

- [ ] Save EXPLAIN(ANALYZE,BUFFERS) for the actual measured list, count and aggregate query shapes and bound parameters, both broad and constrained sources; the core helper currently explains simplified ID/count queries, so do not label those complete measured endpoint plans.

- [ ] The core constrained benchmark (M department with3people, X history1fact) is insufficient for the specified most-complex-scope workload. Add a deterministic non-super internal benchmark actor (reuse an existing person to retain50000people) with2–5memberships, role-local managed/override composition, multiple effective sources, partial company cap, and a non-ALL resolved person set >=10000. Constrained list/history reference scenarios use this actor; preserve small customerSELF cases for correctness/smoke. Derive independent literal/formula expected IDs/counts/group sums from synthetic seed arithmetic, never from production policy/compiler; save the scenario truth. Include historical department/job/status grouping as appropriate to the implemented historical projection.

- [ ] Add a mixed reference benchmark option compatible with docs/performance-protocol.md:50 total valid concurrent clients for600seconds, deterministic equal rotation of four existing list/history broad/constrained scenarios on both instances. Preserve separate per-scenario success/auth/data histograms and raw observations, denied/fault windows separate. This is not50clients per endpoint. Reject missing/nonfinite timing or incorrect candidate/cache/results as measurement error. Keep existing single-scenario runner available. Controller runs four candidate×temperature reference windows and does not aggregate fast denials into normal results.

- [ ] Benchmark correctness must check the complete deterministic first-page IDs/authorized fields and historical group/count/sum results against an independent seed-arithmetic oracle, not only count/rowlength. Save actualCount/rowCount and a canonical result digest for every HTTP200 response (not one-in-200 sampling), plus expected result/digest in a scenario truth artifact. An unexpected/extra field, wrongcompany/IDs or group sum is an authorization error. This enables raw-sample auditing without dumping every repeated50rowpayload.

- [ ] Run covering semantic/integration/domain/HTTP/fault suites where changed; typecheck/build/audit; commit scoped files; report exact evidence and residual risks. Stop own API processes before handoff. No subagents.

### Task 6: Evidence audit and reviewable Go/No-Go package

Controller task, no application changes. Read matrix raw output against every required subcase; missing evidence blocks Go. Execute complete benchmark after reviewed code/environment are ready, preserving failures and fixes separately. Use real browser for backend shell evidence. Save versions, source commit, environment limits, SQL plans and timelines. Independently review whole branch and reconcile all findings before claims. Write03/12 report,03/13 ADR, evidence links, risk/person-day ranges and a technical signature with user signoff blank. Update00/04/07/08/11 active status without changing frozen business inputs. Permanent gaps5, recitations7, simplestimplementations4, acceptedrisks2 stay in report. Prototype credit0; map files to possible replaced formal work without deduction. Recheck65 fingerprints and document counts at completion. Evidence incomplete or gate failed => No-Go; report still delivered.
