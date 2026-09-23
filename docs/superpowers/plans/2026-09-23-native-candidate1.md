# Task 3 supplement: Native candidate 1 — covering fact access

Stage 1 delivered separately as planning03/14 at measurement source b3ea778 and delivery ec2e616. Stage1 evidence: two capped50/600 windows, 13866 joined requests,1782classified503; primary history SQL contributes83.14–99.74%ofserverelapsed atHTTPp95, sharedpoolwait dominatespermission/listtail. Snapshot parse/normalize are single-digit/~10ms p95, not the seconds-level primary cost. Existing plan/spec and all business constraints remain binding. NoformalB1;throwawayresearch/reuse0.

## Alternatives and choice

1. **Candidate1 chosen for actual evaluation:** change fact access representation through a covering index on report's own learning_fact, preserving current compiled SQL/predicate/permission path. Target repeated fact heap access and current-person nested lookups shown by exactEXPLAIN: constrained457673facts, factindex506ms, entireexecution758ms whenisolated; underloadmany10sSQLtimeouts. This is a bounded physical optimization; no new authorization caching or semantic fallback. Expectedbenefit unproven until fullwindows.
2. Version-bound permission/compiled-plan reuse: deferred proposal, not an implemented candidate. It targets repeated construction, but stage1 shows wait rather than construction dominating. Reconsider only after candidate1 measured results demonstrate remaining costs. No promise that it fixes history CPU.
3. T-1 projection: permitted business alternative, not implemented here. Would require grain/cardinality evaluation, explicit freshness/title and current-revocation proof; source facts vary historicaldepartment/job/status perperson, so blindly grouping byperson maynot shrink them. No claim of measuredbenefit without implementation and fullwindows.

## Exact files/interfaces and constraints

- Add at most one physical covering index in `sql/schema.sql` owned by `report`; no business schema fields or global PostgreSQL settings. Suggested key tenant_id,data_company_id,person_id; INCLUDE historical_department_id,historical_job_id,historical_status,points,enabled,deleted,fixture,id as needed. Inspect exact schema/SQL before choosing final minimal coverage and record size/writecost. Existing index removal only if exactly replaced and proven unnecessary; default retain to isolate additivecandidate.
- Add `test/native-fact-access.test.ts` for actualPostgreSQL EXPLAIN/buffers and independent resulttruth. Capture baseline RED before index introduction. Assert desired covering/noheap access on the actualconstrained query after normalcontrolledanalyze/visibilitymaintenance, plus count/group/points truth, rather than merely checking anindexname. If optimizer legitimatelychoosesotherplan, report concretely; do not secretlyforceplannerflags.
- Optional `scripts/native-fact-access.ts` for recording all4actualNativequeryplans/parameters/indexsizes. Nativeonly; do not invoke scripts/explain.ts as it loopsCasbin. No alteredSQL/authz/sourcebinding algorithms in thiscandidate. Any necessary change beyond these bounds must be raised tocontrollerbeforeediting.
- Seed remains same datasets/formulas. VACUUM/ANALYZE needed for visibilitymust be documented and applied consistently as data preparation; inspect existing seed ANALYZE first. Do not introduce perwindow onlymanualsteps that the runner cannotreproduce. If adding VACUUM solely to privilegecandidate, compare baseline atsame maintenance state beforeattributingbenefit. Better design applicableSQL and record heapfetches withoutextra maintenance ifpossible.
- Keep originalresources, APIpool20, authorityreads/fences, Redisrequiredhealth300ms, SQL10s, acquire800ms, client20s, allroles/company/field/appointmentsemantics. Index only targets report-owned tables; no crossmoduleprivatejoins.

## Tests/evidence and ownership

Implementer owns syntheticDB only aftercontrollerhandoff. APIs currently absent; PG/Redis running. No otherworkloadmayrun simultaneously. Focused RED/GREEN with realSQL, actualindexbytes, write/preparationtime, EXPLAIN sameparameters. Native-only relevant current/history/company/source/fieldregressions using `--test-name-pattern='^native:'`; no Casbinenforcement/workload. Typecheck/build/moduleboundaries. Commit then report andreturnDBownership. Do notlaunch50/600windows (controllerafterreview).

Controller then freshcode/spec review; exactcleanimage; complete hot+cold50/600 under samecaps; every200truth, failuresfullyattributed, authorityp95≤50/list500/history2000/normalnonsuccess≤0.1%perwindowandscene. Native two-processnextrequestrevocationincludingmedia, PubSubabsent, Redisdisconnect/timeoutwarm+cold/DBfailclosed and field/company regressions. This candidate is not passed by anisolatedEXPLAINspeedup.

After candidate1fullresults: select atmostonefurtheractualcandidate onlyifmajorremainingcosthasclearmeasuredtarget. Stop afterboundedtimebox; ifNoGo delivercostdrivers and isolatedbusiness-concession experiments as proposals, neverchangebusinessrules bydefault.
