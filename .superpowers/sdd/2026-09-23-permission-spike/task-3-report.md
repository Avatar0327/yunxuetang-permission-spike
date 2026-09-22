# Task 3 implementation report

Status: **DONE_WITH_CONCERNS** for the authorized isolated Task3 domain milestone. Full Go, all 168 acceptance points, browser and performance approval remain pending. No formal B1 work or source-site operations were performed. Base core was the reviewed `6f1e75a`; the implementation/report are committed together after the final checks below.

## Implemented

- Extracted trusted OrganizationFacts, TrainingFacts, KnowledgeFacts and ReportProjection public ports, with explicit bootstrap bindings and compatibility defaults. No protected service queries foreign private tables. Report object enumeration joins only report-owned current projection/facts. Central dependency SQL invokes a knowledge-owned transactional freeze function. Source/import and SQL-routine boundary tests cover this seam.
- Preserved `READ COMMITTED`, marked pinned transaction clients, revision-only lock acquisition **before** fresh actor/company facts, and final revision fencing. Original waiting-lock regressions pass after extraction.
- Persisted category hierarchy/10-depth validation, inheritance/forced locks, independent course browse/maintain/distribute/download grants, current publication/access state, custom browse replacement, creator lock enforcement, atomic import, explicit revision preview and nonrecursive parent append. Protected database-backed bytes expose no storage URL and reauthorize each new request. Public is authenticated same-tenant browse; mock classroom/role subjects are normalized centrally into the same course query plan.
- Registered course uploader, project original creator and face-to-face owner SELF anchors; unsupported scope/node saves reject. The SQL object resolver uses actual business object IDs and current owning-module state, not person IDs as a substitute for course/project IDs.
- Added selected-membership role create/edit/new-member/recheck. Create allows levels2/3 even when the selected source is level3; only edit applies equal/higher restrictions. Actions, actual object sets, raw fields and explicit delegability come from that same selected source. Recipient-relative scopes are separately resolved; saved caps remain an intersection during normalization.
- Canonical role policy edits fan out to all members while preserving local override and lifecycle data. Source/cap/version is persisted; dependency cycles reject; source/organization/object-set mutations freeze dependents in the authority transaction. Explicit recheck persists/audits active or suspended. Recreating a revoked membership uses a fresh ID and cannot resurrect old overrides/dependencies.
- Completed the final discovered gap with `POST /categories/:id/recheck` and `POST /courses/:id/recheck`: these follow the **stored original** source membership, persist active/suspended, retain/rebuild cap/version snapshots and write `knowledge.policy_audit`. Ordinary policy save also validates its selected source.
- Corrected internal company cap to own company **union** explicit grants (02 §5, as clarified by controller); external actors stay own-company-only. Role edit/recheck also verify target member company when the delegated business permission is shared content.
- Added a two-process functional extension: B warm download, real Redis `CLIENT PAUSE 650 ALL` timeout→503 without bytes, recovery→200, A revoke commit, B next new download→403. No Docker configuration/service-stop operation was used, and no Pub/Sub subscription/publish exists.

Public interfaces and precise persistence/splitability boundaries are documented in `docs/task3-ports.md`, README and the updated continuation map. The 168-point manifest was not modified. `docs/task3-coverage.json` maps **34 focused subcases**, not full-group passes, to exact JSONL name/candidate/line references and preserves unknowns explicitly.

## Final commands and results

Working directory for every command: `/Users/peng/Agent本地开发/云学堂权限预研`. Node24 executable prefix: `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

| Command (after that PATH prefix) | Exit | Raw output |
|---|---:|---|
| `npm run typecheck` | 0 | `evidence/raw/task3-final-typecheck2.txt` |
| `npm run build` | 0 | `evidence/raw/task3-final-build2.txt` |
| `npm audit --json` | 0 | `evidence/raw/task3-final-audit.json`: zero vulnerabilities |
| `npm run seed` | 0 | `evidence/raw/task3-final-seed4.txt` |
| `RACE_EVIDENCE=evidence/raw/task3-final-races2.jsonl node --import tsx --test --test-concurrency=1 test/semantic.test.ts test/integration.test.ts test/races.test.ts test/review-regressions.test.ts test/cache.test.ts` | 0 | `evidence/raw/task3-core-regression-final2.txt`: **53/53** |
| `TASK3_OBSERVATIONS=evidence/raw/task3-final-observations2.jsonl npm run test:task3` | 0 | `evidence/raw/task3-domains-final2.txt`: **100/100** |
| `lsof -nP -iTCP:4311 -iTCP:4312 -sTCP:LISTEN` | 1 (expected no listener) | `evidence/raw/task3-api-process-check.txt`: empty |

The final domain run includes its two independent-process/Redis-timeout tests. The separate reusable command is `npm run functional:task3`; equivalent test invocation was exercised as `TASK3_OBSERVATIONS=evidence/raw/task3-delivery-observations2.jsonl node --import tsx --test test/task3-delivery.test.ts`, exit0, `task3-delivery-green2.txt` (2/2). Core regression and domain suites are sequential because they mutate one synthetic database. Tests stop both child API processes in `finally`. No benchmark was run. No warnings remain in the final outputs.

Final literal observations: **188 records**, Native93/Casbin93/shared-resolver2, **zero expected/actual mismatches**. SHA256 of `evidence/raw/task3-final-observations2.jsonl`: `3780aadcd97babd6ea7738d767115e2eb3deee05b942bab56e49d94dbd651edf`. These observations are deliberately literal sets/statuses/fields, not outputs from the policy/compiler used as expectations.

### Selected exact evidence references

All following lines are in `evidence/raw/task3-final-observations2.jsonl`:

- Company own-only/no customer grant: Native17–18, Casbin19–20.
- AUTH-T07 selected source ceiling/levels: Native34–49, Casbin60–75; full per-subcase references are in the coverage JSON.
- Role source shrink/suspend/restore/audit/cycle/newID: Native50–58, Casbin76–84.
- Warm B / Redis timeout / recovery / A revoke / B new-request denial: Native86–90, Casbin92–96. The denial records contain no bytes, `pubsub:false` and request time after A response (HTTP completion is an upper bound on the commit, **not** a precise database commit timestamp).
- Four independent course action queries: Native101–104, Casbin116–119; protected bytes / browse-only deny / unpublish deny: Native105–107, Casbin120–122.
- Forced creator lock direct/import/custom: Native108–110, Casbin123–125. Custom replacement preserving maintain/distribute/download: Native22–26, Casbin28–32.
- Append preview/commit/retained allow: Native113–115, Casbin128–130. Classroom uses the unchanged query and is included in browse sets at101/116.
- Canonical fanout/local override: Native132–134, Casbin140–142.
- Final category/custom suspended→active endpoints and audit: Native149–153, Casbin154–158.
- Actual populated department expansion: Native161–165, Casbin168–172: saved cap `[A]` remains `[A]` while frozen after moving the B branch; attempting child recheck before its source returns suspended; explicit source then child recheck yields active cap `[A,B]`.
- Recipient D2 cannot exceed selected source D1: Native175, Casbin180. Target-company recheck/edit denies: Native184–185, Casbin187–188.

## TDD and failed attempts retained

Every file below remains under `evidence/raw`; failed attempts were not overwritten or treated as successes because their filename contained “green”. Commands were `node --import tsx --test <named test file>` with the Node24 PATH above unless otherwise stated.

| Test / change | Actual RED before implementation/fix | GREEN |
|---|---|---|
| Public module boundaries | `task3-ports-red.txt`, exit1: foreign SQL in authz/organization/training | `task3-ports-green.txt`, exit0, boundary +17 lock/export regressions |
| Role/category endpoint persistence | `task3-entry-red.txt` and `task3-entry-category-red.txt`, exit1, HTTP404 vs200 | `task3-entry-green.txt`, exit0 |
| Forced child / selected category source / source freeze | `task3-protection-red.txt`, exit1: protected writes incorrectly200; source remained active | `task3-protection-green2.txt`, exit0,10/10; final suite repeats after own-company fix |
| Role fanout / explicit recheck / populated move routes | `task3-lifecycle-red.txt`, exit1, absent endpoints404 vs requested behavior | `task3-lifecycle-green.txt`, exit0,8/8 |
| Internal own company | `task3-company-red.txt`, exit1: literal `[A,B,C,D,E,M,N]` became `[]` without explicit grants | `task3-company-green2.txt`, exit0, company+protection12/12 |
| Course action/query/locked mutation integration | `task3-knowledge-red.txt`, exit1,20 failing subtests/parents against missing routes | `task3-knowledge-green-attempt1.txt`, exit0,20/20 |
| Valid custom save wrongly froze itself | `task3-custom-red.txt`, exit1: accepted save's new subject received403 vs200 | `task3-custom-green.txt`, exit0,2/2 |
| Face owner resource endpoint | `task3-anchors-red.txt`, exit1: face endpoint404 (course/project/depth already passed) | final anchors10/10; `task3-anchors-green-attempt1.txt` also had a separate boundary failure described below |
| Category source/cap/version persistence | `task3-category-provenance-red.txt`, exit1: missing source/cap/version | `task3-category-provenance-green.txt`, exit0,2/2 |
| Exact history state / empty virtual cap | `task3-object-set-red.txt` and `-red2.txt`, exit1: disabled person's facts still enumerated, empty virtual cap expanded | `task3-object-set-green.txt`, exit0,2/2 |
| SQL owning-module boundaries | `task3-sql-boundary-red.txt`, exit1: central trigger wrote knowledge private tables | `task3-sql-boundary-green.txt`, exit0,2/2 |
| Target company on role edit/recheck | `task3-role-company-red2.txt`, exit1: both paths incorrectly200 vs403 | `task3-role-company-green.txt`, exit0,6/6 |
| Category/custom explicit original-source recheck | `task3-policy-recheck-red.txt`, exit1: absent endpoint404 | `task3-policy-recheck-green.txt`, exit0,2/2; final observations149–158 |

Additional audit matrix tests reuse already implemented kernel validation and are **not** represented as pre-implementation RED for each individual assertion. Initial404 RED proves missing integration, not the later security semantics in isolation. The genuine 200→403, active→recheck_required and allowed custom403→200 regressions above carry that stronger evidence.

Other preserved failed attempts and corrections:

- Initial boundary shell wrapper used zsh readonly variable `status` after the test; the captured Node test output still clearly shows the expected architecture failure. Later wrappers use `rc`.
- `task3-protection-seed.txt`, exit1: SQL trigger name `freeze` is reserved; seed transaction rolled back. `task3-protection-green.txt` is a **failed attempt** against the old schema, not evidence of success. The renamed trigger's reseed and `green2` pass.
- The first recipient-department fixture temporarily added B's own-company grant to make its target set nonempty. Controller identified the deeper 02 §5 bug: own company is implicit. That extra fixture grant was removed; the company RED/GREEN proves the production fix, and the final recipient test runs without it. The earlier empty-set fixture is not claimed to prove a privilege leak.
- `task3-company-green-attempt1.txt`, exit1: the own-company positive passed, but the test initially expected zero count for inaccessible direct ID. Existing ReportService intentionally returns403 for direct ID. The oracle was corrected to403; no production denial behavior was weakened.
- `task3-custom-red.txt` found over-freezing. Course insertion/deletion or updates naming enabled/deleted/published/accessibility/uploader remain object-set freeze triggers; custom-policy-only saves do not trigger them. Positive custom use and negative source/object changes both pass in the final suite.
- `task3-typecheck-attempt1.txt`, exit2: inferred JSON row's grant callback had implicit any; explicit KnowledgeFacts return typing fixed it.
- `task3-anchors-green-attempt1.txt`, exit1: all10 domain tests passed but the boundary checker caught new knowledge imports from central private implementation modules. They now use `authz/public.ts`; boundary rerun passed.
- `task3-core-regression-attempt1.txt`, exit1:51/53; the two snapshot-race waiters still matched old `select data from authz.membership` after the canonical-role join changed SQL shape. Updated only the real `pg_stat_activity` wait fragment to the new membership/role query; existing reject503 assertions remain. Final core53/53.
- `task3-role-company-red.txt` exposed edit but its mutation froze the selected actor before the following recheck; reordered independent checks in `red2` to expose both genuine unauthorized200 paths.
- `task3-delivery-green.txt`, exit1: actual Redis503/recovery200/revoke403 behaved correctly, but denial evidence metadata lacked `pubsub:false`. Added the same safe metadata already used on success; `green2` passes. It is not a historical authorization leak.

## Self-review and remaining scope

The task's implementation paths are present, but this is deliberately **not** full acceptance:

- `docs/task3-coverage.json` is an observation map. Forced inheritance is tested; a separate inherit_parent-only scenario, concurrent ancestry toggles, all malformed DTO combinations, exhaustive batch rollback/parallel delegation/download races and all original168 combinations are still unexecuted. No claim that pure unit coverage passes an entire group.
- The maintain/distribute permissions are independently observed in real SQL/HTTP queries; no full product content-authoring or distribution workflow is built. Course/face object creation remains fixture-owned. `/auth/me` still derives menu hints from role/appointment grants; catalog-only management hints and the complete browser experience remain Task4 UI integration/audit work.
- KnowledgeFacts currently materializes course/category policy references and compiles one source per matched course grant; its large-course cardinality/Casbin policy cost and query-count/performance gate are unmeasured. Delegation enumerates and stores exact object sets; million-row cap storage, transaction lock duration and production-efficient representation require Task4 measurement/design review. No performance or N+1 acceptance claim is made from these small fixtures.
- Freezing is intentionally conservative, including unrelated derived configurations after organization/object changes. SQL updates naming unchanged semantic fields may over-freeze. Independent service/database deployment, DB-role separation/RLS and an outbox protocol are unproved; the shared authority transaction remains required.
- Protected payloads are synthetic database bytes; no production OSS/CDN adapter, resumable stream, durable background identity or signed-ticket lifecycle is claimed. HTTP completion only bounds revoke commit time. Redis timeout is real; this task did not rerun Docker disconnect/DB outage campaigns or cold fault/export faults.
- Task4 owns company-qualified department/person physical constraints and valid50k/2k fixtures, team enrollment, account/wallet, project progress/attachments/export, remaining matrices, browser QA and capped long performance windows. Original planning00/01/02/handoff and controller tools were not changed or staged.

## Owned files / handoff

Source: `src/contracts/ports.ts`; authz `contracts,policy,registry,revision,scope,public,objects,delegation-caps,role-service`; organization `public,service`; training `public,service`; report `public`; knowledge `public,service`; `src/bootstrap.ts`.

Persistence/run: `sql/schema.sql`, `sql/seed.sql`, `scripts/seed.ts`, `package.json` (test/functional scripts only).

Tests: `test/module-boundaries.test.ts`, all `test/task3-*.ts`, and the canonical-query waiter/evidence-path adjustment in `test/races.test.ts`.

Docs: README, `docs/kernel-contract.md`, `docs/task2-follow-up.md`, `docs/task3-ports.md`, `docs/task3-coverage.json`, and this report. Raw files intentionally stay ignored in `evidence/raw`.

Do not include controller-owned modified plan, `docs/controller-acceptance-audit-notes.md`, `docs/coverage-map-contract.md`, `tools/capture-runtime.sh`, or `tools/audit-coverage.py` in this implementation commit. Own API processes are stopped. The shared synthetic DB contains the final tests' fixtures; reseed before the next isolated acceptance/performance campaign.
