# Task5 fix round1 — R1 enrollment-company conflict

Status: **DONE_WITH_CONCERNS**, ready for bounded R1 review. Overall acceptance remains pending; formal B1 is prohibited.

Workspace: `/Users/peng/Agent本地开发/云学堂权限预研`, branch `spike/permission-v83`.
Base: `791c47841da1e176e2ed740bf5ad00fe27571402`.
Scoped source/test commit: `9fb99755f146622d30f352444128ef77eb68c6fd`.
This report is committed separately after the source commit. Controller coverage/audit/fault-summary/final-review files are excluded.

## Verified finding and implementation

Read the complete `task-5-review.md` and original `task-5-brief.md`, especially its immutable enrollment snapshot/no silent old-A reuse requirement. Existing `EnrollmentService.change` authorized X's current company B, then `ON CONFLICT DO NOTHING` skipped the old A enrollment and returned `{changed:true,count:1}`. A mixed request also inserted the other new person, falsely reporting a fully successful batch.

`src/training/enrollment-service.ts:33`–`:39` now inspects existing enrollment facts against the current training person projection inside the existing transaction and tenant authority lock. Any company mismatch throws the existing safe `Denied` before insertion. Both project-appointment and direct-team paths pass this check after their own current authorization. Existing same-company conflicts retain their prior idempotent behavior. No old company/name/progress/attachment is rewritten; no learning-round engine, new response contract, or schema change was introduced.

The owned-command serialization assumption is unchanged: current organization/enrollment mutations acquire the tenant authority lock. The conflict query additionally locks matching existing roster rows. Raw database writes outside those owning commands and independent database privilege isolation remain outside the prototype proof.

## Actual RED → GREEN

`test/task5-enrollment-conflict.test.ts` uses real APIs and PostgreSQL/Redis for Native and Casbin. Legitimately appointed customer B manager Y tries to add X after X transfers A→B and its current name becomes `new-B-X`. Old enrollment remains company A, captured name X, progress 25, attachment `attachment-X`.

- Actual RED2: singleton returned 200 with `changed:true,count:1`; mixed `[W,X,Y]` returned 200/count3, inserted fresh B member W and advanced revision/export epoch. Both candidates failed the expected 403/unchanged complete roster checks. B roster then exposed the unintended partial W insert. Preserved output is 2 passing / 8 failing Node test entries (including parent entries), exit1.
- GREEN: singleton and mixed requests return only the existing generic denial body (plus ordinary transport metadata), HTTP403; complete roster, revision and export epoch are unchanged. A customer sees old X/name, B customer sees only Y and cannot read X's progress or attachment; internal M sees all three enrollment facts. Exact list/count/search and project export create/execute/claim outcomes are checked for all three actors. Same-company `[Y,W]` succeeds twice, stores W once, and retains Y's original snapshot/progress/attachment.
- Focused GREEN: **10/10** Node test entries; **68 literal observations**, 34 per candidate, zero mismatches.
- Bounded related campaign: **36/36** entries; **164 literal observations**, 82 per candidate, zero mismatches. Covers existing direct-team positive/negative/mixed batches, cross-process enrollment/revoke ordering, attachment action restrictions, membership target restrictions, module boundaries, and transfer/current-person snapshot controls.

All raw paths below are relative to the workspace above. No old raw failure was overwritten.

## Exact validation commands and evidence

Every Node/npm command below used `PATH=/opt/homebrew/opt/node@24/bin:$PATH`.

1. `npm run seed > evidence/raw/task5-fix-round1-red-seed.txt 2>&1` — exit0.
2. `TASK3_OBSERVATIONS=evidence/raw/task5-fix-round1-red.jsonl node --import tsx --test test/task5-enrollment-conflict.test.ts > evidence/raw/task5-fix-round1-red.txt 2>&1` — exit1, original pre-fix attempt; correct singleton R1 failure plus the separate mixed-ID ordering problem documented below.
3. After changing only the fresh test fixture from lowercase `person-00002` to uppercase W: `TASK3_OBSERVATIONS=evidence/raw/task5-fix-round1-red2.jsonl node --import tsx --test test/task5-enrollment-conflict.test.ts > evidence/raw/task5-fix-round1-red2.txt 2>&1` — exit1, genuine singleton and mixed-batch R1 failures for both candidates before any production edit.
4. After the scoped fix: `TASK3_OBSERVATIONS=evidence/raw/task5-fix-round1-green.jsonl node --import tsx --test test/task5-enrollment-conflict.test.ts > evidence/raw/task5-fix-round1-green.txt 2>&1` — exit0, 10/10.
5. `npm run seed > evidence/raw/task5-fix-round1-regression-seed.txt 2>&1` — exit0.
6. `TASK3_OBSERVATIONS=evidence/raw/task5-fix-round1-regressions.jsonl node --import tsx --test --test-concurrency=1 test/task5-enrollment-conflict.test.ts test/task5-transfer.test.ts test/task4-team.test.ts test/task4-delivery.test.ts test/task4-review-regressions.test.ts test/module-boundaries.test.ts > evidence/raw/task5-fix-round1-regressions.txt 2>&1` — exit0, 36/36.
7. `npm run typecheck > evidence/raw/task5-fix-round1-typecheck.txt 2>&1`; `npm run build > evidence/raw/task5-fix-round1-build.txt 2>&1` — both exit0, no diagnostics.
8. `git diff --check > evidence/raw/task5-fix-round1-diffcheck.txt` — exit0. No dependencies changed; no renewed dependency audit or full-core/long-load campaign was necessary for this bounded fix.

`evidence/raw/task5-fix-round1-observation-audit.json` independently parses expected/actual literal pairs and records real SHA256 values:

- GREEN JSONL: `70eff0002bb2e4cca921779098fecaa25cc426a3c6886ca23d31870c657dd0c9`.
- Related campaign JSONL: `a6641526aeebc021cebcee5e8afea5417af9be7d9c83d62a4259cafc43a6d883`.

These comparisons establish the recorded results, not untested semantic acceptance.

## Out-of-scope — unresolved mixed-ID collation rejection

**Not fixed.** Before production edits, the original same-company positive request from appointed Y was `POST /projects/P/enrollments`, body `{"operation":"add","personIds":["Y","person-00002"]}`. Both people are enabled/nondeleted current company B. Both candidates returned generic HTTP403, though this authorized mixed batch should succeed. Exact raw records: `evidence/raw/task5-fix-round1-red.jsonl`, observation `R1 same-company add response 0` for Native and Casbin; assertion failures are preserved in `evidence/raw/task5-fix-round1-red.txt`.

Root-cause evidence: `src/training/enrollment-service.ts:19` uses JavaScript `.sort()`, producing `["Y","person-00002"]`; SQL at `:21` uses database `ORDER BY id`, yielding `["person-00002","Y"]`. Strict JSON array comparison at `:28` rejects equal authorized sets in different orders. Direct-team sorting at `:26` and remove sorting/comparison at `:30`–`:31` share the pattern (those variants were inspected, not newly claimed as reproduced).

`evidence/raw/task5-fix-round1-out-of-scope-sort.json` records the original request plus a real read-only SQL query showing both authorized B records and both sort orders. The initial R1 mixed request `[person-00002,X,Y]` was also rejected before reaching insertion because of this issue; replacing only the fresh fixture with uppercase W allows the R1 test to reach the faulty conflict path. This fixture adjustment does **not** resolve or waive the collation bug. It is explicitly deferred to the controller's final whole-branch review, per controller instruction, and is a remaining correctness concern.

## Environment handoff and limits

- Test helpers stopped their owned API processes. `lsof -nP -iTCP:4311 -iTCP:4312 -sTCP:LISTEN > evidence/raw/task5-fix-round1-handoff-api.txt` — exit1 with empty output, expected no listeners.
- After all tests, `npm run seed > evidence/raw/task5-fix-round1-handoff-seed.txt 2>&1` — exit0. Subsequent checks were read-only. No further API tests/mutations ran after this seed.
- `docker ps --format '{{.Names}} {{.Status}}' > evidence/raw/task5-fix-round1-handoff-services.txt` shows PostgreSQL/Redis running. `evidence/raw/task5-fix-round1-handoff-state.json` contains real Redis PONG, original X=A/Y=B/null departments/names, absent W, original 3 P enrollments, zero appointments/export jobs, and T1=50000/T2=500 people.
- No controller tools, planning inputs, coverage/status gates, runtime caps, or formal product source were changed. No subagents. Only source service/test commit plus this report are owned changes.
- Actual browser, four capped 50-client/600-second reference windows, performance gate and independent full semantic acceptance remain controller work. Existing short-window >50ms permission overhead concern remains unchanged. The R1 tests are not overall Go or formal B1 approval.
