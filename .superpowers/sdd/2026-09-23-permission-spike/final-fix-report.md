# Final review consolidated fixes — isolated permission spike

Date: 2026-09-23. Base: `e8c5bf937bb34ab8ee344a985488f68670ebed63`. Fixed application/schema/test source: `cb72484ed8e7547146920fd4312dd24f8c9e2402`. This is a scoped I1–I4 correction, not formal B1 or an overall Go decision. Full appointment browser acceptance, four resource-matched 50×600 reference windows and independent 168-point semantic acceptance remain controller work. No subagents were used.

Read the complete final review and final-fix brief before implementation. The controller's uncommitted documentation was excluded from the source commit. No planning inputs, controller tools, coverage mappings, quotas, dependencies, thresholds or production product were changed.

## Findings, real RED and fixes

### I1 — appointment relation identity

The old `${personId}-${projectId}` ID merged two lawful opaque-ID pairs. The new regression creates `final-<candidate>-A-B / final-<candidate>-C` and `final-<candidate>-A / B-final-<candidate>-C`. M has an exact object cap permitting appointment only on the second project; HTTP appointment against the first project returns 403. Despite that, pre-fix successful writes to the second pair deactivated/reactivated the first row and never created the second row. These are real HTTP and database observations in both Native and Casbin, not static extrapolations.

`TrainingService.appoint` now uses a generated UUID for row identity and upserts on the unique `(tenant_id, person_id, project_id)` relation. It returns the persisted `id, active` from `RETURNING`, including the existing ID during repeated operations. The schema adds that semantic unique constraint and makes person/project non-null. This is a disposable prototype schema/cleanseed change, not a production migration. Repeating activate/revoke affects exactly one natural key, retains unrelated appointments, preserves backend access from a remaining appointment, and closes access after the last revoke. Existing independent-role and cross-process revoke campaigns remain unchanged.

Four historical test cleanups used the old generated strings L-P/M-P/X-P. They now delete exactly the person/project pair they created; their behavioral assertions were not weakened. Other fixtures already used relation-based cleanup or their own explicitly supplied IDs.

### I2 — authorization set equality

JavaScript `.sort()` and the PostgreSQL collation produced different orderings for the same complete authorized set. The pre-fix test independently reproduced all four project/direct-team add/remove positive failures plus a subtree/parent department move failure, for each candidate. Fixtures retain mixed-case `Z-*` and `a-*` IDs; database collation was not changed.

A small shared `sameUniqueIds` compares cardinality, uniqueness and membership without depending on ordering. Both enrollment authorization checks (current targets and removable roster facts) and department subtree/parent authorization use it. Request duplicate rejection, exact complete membership, company caps, transaction locks, snapshot preservation and old-company conflict denial are unchanged. Negative tests keep one inaccessible/missing/duplicate member in the whole batch, verify the full roster is unchanged, and verify an unauthorized child prevents a department move without changing the tree. Existing parent-outside-cap regressions are included in the final Task4 campaign.

M1 was addressed only near touched code: enrollment indentation, explicit project-source try/catch, named set comparison and the edited appointment SQL. No blanket historical-code reformat was performed.

### I3 — missing category target versus inaccessible target

The first attempt had a test-fixture error: a T2 category creator referenced T2/Z, which does not exist. That complete original run remains `final-fix-red.*`; it is not evidence of a product I3 failure. Only the fixture creator was corrected to lawful T2/other-1 before the second RED; no production code had changed.

The genuine second RED used the same authenticated L, valid request bodies and three target classes: inaccessible T1 category, absent category and category existing only in T2. Configure, append-preview, append, import and recheck returned `[403,503,503]` with different safe messages. Authorized create with a missing parent also returned 503. Full request/response bodies are retained.

At the knowledge command boundary, missing current-tenant targets and missing requested parents now throw `Denied` before effective-category evaluation. Existing-category ancestry validation remains unchanged; broken ancestor chains still throw an unexpected error, protected by the existing HTTP 503 wrapper. No global error-to-403 conversion was introduced. GREEN checks each target class has only the same generic 403 business body (ordinary dynamic `meta` excluded from equality but retained raw), successful authorized configuration, complete transaction rollback for an import whose later target is missing, real Redis timeout 503 and successful recovery. Existing full Task5 DB/Redis faults additionally run unchanged.

### I4 — in-DOM component closure

All self-closing `el-*` tags in `web/index.html` now have explicit closing tags. Navigation, sequence guards and backend capability handling were preserved. The controller's original actual Chrome blank-page/compiler-30 RED remains at the paths cited by the final review; this report does not re-label that evidence as a newly performed RED.

Used the installed Playwright CLI skill wrapper through `bash` (the wrapper is not executable directly), a real headed Chrome session and actual local Native/Casbin APIs. Both learner pages and Z management pages with the P/Q table render. Native unauthorized project P produces the generic access message and the learner route returns to the learning center. Screenshots `native-learner.png`, `native-admin.png`, `casbin-admin.png` were captured; the management screenshots were visually inspected. There was no Vue compiler-30 error. Original favicon 404 and the expected protected-request 403 are retained. The later Native page console is empty; Casbin console contains only favicon 404. An initial stale element reference and a combobox input blocked by the visible selection wrapper are preserved as CLI diagnostics; clicking the actual visible select wrapper completed the actor selection. These are smoke results, not the controller's full appointment UI acceptance.

All smoke text, screenshots and copied CLI snapshots/console logs are under `output/playwright/final-fix-smoke/`. Its `close.txt` confirms the owned browser session closed.

## Commands and evidence

Node commands used `PATH=/opt/homebrew/opt/node@24/bin:$PATH`. Project root: `/Users/peng/Agent本地开发/云学堂权限预研`.

1. Before production edits, `FINAL_FIX_SOURCE=e8c5bf937bb34ab8ee344a985488f68670ebed63 FINAL_FIX_HTTP=evidence/raw/final-fix-red-http.jsonl TASK3_OBSERVATIONS=evidence/raw/final-fix-red.jsonl node --import tsx --test --test-concurrency=1 test/final-fix-regressions.test.ts > evidence/raw/final-fix-red.txt 2>&1`: exit 1; 37 entries, 13 pass / 24 fail. Includes genuine I1/I2 failures and the explicitly excluded I3 fixture failure.
2. Corrected only the T2 creator fixture and ran the same command with `red2` filenames: exit 1; 53 entries, 15 pass / 38 fail. 110 expected/actual observations, 32 genuine mismatches; 104 complete HTTP observations. All I1/I2/I3 positive reproductions fail as described above for both candidates.
3. After the scoped application/schema fix, `npm run seed > evidence/raw/final-fix-green-seed.txt 2>&1`: exit 0. The focused command with `green` filenames: exit 0; 53/53, 130 literal observations (65 each), 0 mismatches, 104 full HTTP observations.
4. After formatting and opt-in HTTP recording in existing test helpers, the focused command with `final-focused` filenames, plus `HTTP_OBSERVATIONS=evidence/raw/final-fix-final-focused-helper-http.jsonl`: exit 0; 53/53, 130 literal observations, 0 mismatches, 104 full HTTP observations. These final source/test bytes were committed unchanged as cb72484; the pre-commit records transparently label the source `e8c5bf9-plus-final-fix-working-tree`.
5. `npm run typecheck > evidence/raw/final-fix-typecheck.txt 2>&1`, `npm run build > evidence/raw/final-fix-build.txt 2>&1`, and `git diff --check > evidence/raw/final-fix-diffcheck.txt`: all exit 0. The earlier typecheck is separately retained as `final-fix-initial-typecheck.txt`.
6. Full frozen-source campaign and environment handoff results are recorded below.

## Frozen-source final campaign

The tests contain historical hardcoded raw paths. To preserve those historical files, execution cwd is `/Users/peng/Agent本地开发/云学堂权限预研/output/final-fix-campaign`, with source/test/scripts/schema/web/dependencies/tools/config symlinked to the same fixed project source and a new independent `evidence/raw` directory. No alternative implementation was copied into this workspace. `FINAL_FIX_SOURCE=cb72484ed8e7547146920fd4312dd24f8c9e2402` is attached to complete HTTP capture. Core service-level tests retain their own actual observations; they are not described as HTTP observations.

Exact command arrays, cwd, environment, exit statuses and elapsed durations are retained in `commands.json`. Orchestration is sequential: cleanseed → all core suites → cleanseed/HTTP Native → cleanseed/HTTP Casbin → cleanseed/Task3 → cleanseed/Task4 → cleanseed/Task5. No browser, load or other API campaign overlaps these stages. Elapsed durations are diagnostic test execution times, not benchmark acceptance.

The entire new raw directory was copied, retaining relative paths, to `evidence/raw/final-fix-full-campaign/`. All **35 files** were compared by SHA256 between execution and archive locations. `evidence/raw/final-fix-campaign-copy-manifest.json` records every original/archive path, size and digest; its own SHA256 is `1d401e1ede4ee395b84d0b212c925594c4c46d07f6ec1f6cd368ea53df79a8b5`. The archived `commands.json` SHA256 is `1c45a5f0788767bef626752596f0ad22461132a0759db88147c7e0210f9a27ad`. `evidence/raw/final-fix-campaign-runner.py` preserves the exact orchestration; `final-fix-campaign-runner.txt` preserves stage exit codes. Source file hashes are in `final-fix-source-identity.json`.

| Stage | Actual command (after its cleanseed) | Result | Archived output |
| --- | --- | --- | --- |
| Core | `node --import tsx --test --test-concurrency=1 test/semantic.test.ts test/cache.test.ts test/integration.test.ts test/races.test.ts test/review-regressions.test.ts test/module-boundaries.test.ts` | 55/55, exit 0 | `final-fix-full-campaign/core.txt` |
| HTTP Native | `node --import tsx --test test/http.test.ts`, Native API on 4311 | 2/2, exit 0 | `final-fix-full-campaign/http-native.txt` |
| HTTP Casbin | same test command, separate cleanseed and Casbin API | 2/2, exit 0 | `final-fix-full-campaign/http-casbin.txt` |
| Task3 | `npm run test:task3` | 118/118, exit 0 | `final-fix-full-campaign/task3.txt` |
| Task4 | `npm run test:task4` | 82/82, exit 0 | `final-fix-full-campaign/task4.txt` |
| Task5 | `npm run test:task5` | 58/58, exit 0 | `final-fix-full-campaign/task5.txt` |

All table paths are relative to `evidence/raw/`. Total **317 passing Node test entries**, including parent/subtest and repeated boundary entries; this is not a count of unique acceptance points. No stage was retried or changed after source freeze. The final focused 53 entries are separate. Actual Task3/4/5 literal observations are respectively **322 / 290 / 616**, with zero expected/actual mismatches. Their complete HTTP captures contain **288 / 310 / 690** responses, plus 14 each from core Native/Casbin HTTP, **1,316 total complete HTTP observations**. Existing Task5 DB/Redis timeout/stop cases, both-process revocation timelines, current/history snapshots and independent role/navigation cases passed. This is functional/fault regression, not reference-window performance acceptance.

`evidence/raw/final-fix-observation-audit.json` records per-file counts, candidate splits, hashes and literal comparisons; `final-fix-focused-audit.json` records RED/GREEN counts and hashes. Eight historical `task2-fix1-observations.jsonl` records are **not whole-record literal equals** because actual includes a dynamic `revision`; all specified business fields match. The unchanged test separately asserts that revision equals a fresh authoritative read. The audit preserves the eight literal differences and explicitly records this distinction, rather than erasing them or describing all core observations as literal equality. The 118 core semantic source/field comparisons have zero mismatches.

## Environment handoff and unchanged boundaries

After all tests, owned API processes were stopped, and `npm run seed > evidence/raw/final-fix-handoff-seed.txt 2>&1` completed with exit 0. The subsequent checks were read-only; no API/browser/load or fixture mutations followed the handoff seed. The controller was informed that environment ownership could resume.

- `lsof -nP -iTCP:4311 -iTCP:4312 -sTCP:LISTEN > evidence/raw/final-fix-handoff-api.txt` returned exit 1 with an empty file, meaning no listeners.
- `final-fix-handoff-state.json` records real PostgreSQL `SELECT 1`, Redis `PONG`, T1=50,000/T2=500 people, T1=2,000 departments, zero appointments, zero report/training/account export jobs, no final-fix persons, original L/X/Y company/department/name state and the original three P enrollment snapshots/progress/attachments.
- `final-fix-handoff-services.txt` records yxt-pg/yxt-redis running after the fault campaigns. No API containers were created; no Docker quotas or settings changed. Owned browser session was closed.
- Full campaign evidence is archived under root `evidence/raw/final-fix-full-campaign/`, not left solely in an unpackaged output directory. Original historical raw files were neither overwritten nor edited.

No authorization company/range/object/field, owner, snapshot, source-provenance, disabled/deleted-person, export ownership or revocation gate was relaxed. No new test framework. No production product, actual third-party integration, business signature, production migration or reuse credit is claimed. G01/G02/G04/G05/G06 and the previously recorded business evidence gaps remain; D42/T10 remain our definitions rather than verified original-site facts. Reuse credit remains 0 person-days.
