# Native permission performance remediation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. No formal B1.

**Goal:** Deliver separately evidenced Native attribution before bounded optimization, then honest Go/No-Go with complete measured evidence.
**Architecture:** Existing isolated modular monolith with centralized authorization. Stage1 observations only; stage2 alternatives selected only from stage1 evidence.
**Tech Stack:** Existing pinned Node24/NestFastify/Vue/PG17/Redis7; Native only this round.
**Spec:** docs/superpowers/specs/2026-09-23-native-performance-remediation.md

## Global Constraints

Read Spec for exact resources/semantics/gates. Normal non-success≤0.1% perwindow/perscenario, unknown causes not allowed forGo. Original p95 and error/noN+1 gates unchanged. Only synthetic local environment; planning inputs read-only. Separate03/14 stage1 report before any optimization. Maximum two actual optimization candidates inside4personday engineering box; no indefinite tuning. NoCasbin reruns, noformalB1, reuse0. Store literal evidence and all failures; no fabricated historical root causes or human signature.

### Task 1: Noninvasive instrumentation and observable benchmark

**Files:** Create src/infrastructure/telemetry.ts, test/telemetry.test.ts; modify infrastructure/db.ts, authz/cache.ts/revision.ts, report/service.ts, bootstrap.ts, scripts/benchmark.ts; optional dedicated benchmark telemetry helper. No schema/SQL/algorithm changes.
**Interfaces:** Optional telemetry request context survives AsyncLocalStorage and emits one safe JSONL diagnostic perrequest (ID, spans, pool/SQL/error codes, no rawtokens/params/fields); benchmark supplies/records sameID and clienteventloop data. Preserve existing evidence and HTTPbusiness response.
- [ ] Read Spec and existing request/token/current/load/plan/query/cache/report/benchmark paths fully. Design disjoint child/exclusive spans with instrumentationoff behavior unchanged. Save design in taskreport; surface unknown instrumentation boundaries.
- [ ] Add genuine failing focused tests: nesting gives exclusive parent duration without double count; exceptions preserve classification/no swallowed error; no parameter/payload/credential logging; disabled mode same semantics; poolwait separately captured without changing underlying pool.query semantics; bounded telemetry buffers.
- [ ] Implement telemetry gated by env OBSERVE=1, context safe acrossconcurrency, requestID; use performance.now, monitorEventLoopDelay and eventLoopUtilization with interval histograms. Preserve token/SQL/cache/permission ordering, timeouts, error statuses and data. Keep diagnosticstream localcontainerstdout/file (controller captures), never include internals in safe errorbody.
- [ ] Instrument all requested phases including original error before broadUnavailable wrapping. Every query timed with normalized fingerprint, SQLSTATE/errorname and returnedrows; poolacquire distinguish fromquery roundtrip. Snapshot parse/stringify/normalize, builds/scope/compile, response serialization distinguish explicitcosts. Record nestedspan offsets and durations so controller derives exclusivecriticalpath.
- [ ] Extend benchmark with correlatedrequestID, errorcause/code, response phase timings and clientloopintervals while retaining every200independenttruth and full600/50samples. No optimization and noCasbin run.
- [ ] Run focusedtests RED/GREEN; typecheck/build; Native-only HTTP truth smoke instrumented/off under controller-approved environmentownership. Commit. Report exact commands,source and impacts/limitations. Do not start fullbenchmark/seed without exclusiveenvironmenthandoff. No subagents.

### Task 2: Historical forensics and stage1 controlled reproduction (controller)

**Files:** tools/native-attribution*.py/sh as needed; evidence/native-remediation/stage1;03/14 report. Original evidence read-only.
- [ ] Independently count1789HTTP503/244transport cases frompreviousraw, enumerate perwindow/scenario/querycount/ID,inspect logs+errors. Mark evidence-supportedcause vsunrecoverable; never invent exactcause.
- [ ] ReviewTask1diff forunalteredalgorithm/SQL/timeout/semantics; focusedfixes thenfreezecommit.
- [ ] Reproduce unchanged-algorithm Nativehot/coldbaseline with instrumentation atsamecaps50/600. The priorfrozen fullwindows remain comparison evidence; off/on Native truth and shortobserver-overhead controls are supplemental, not fullwindow causalproof. Do not create new uninstrumented fullwindow failures whosecauseswouldagainbelost. SaveCPU/memory,server+clientloop,rawdiagnostics,configuration,tracecoverage; disclose observercostlimits.
- [ ] Audit everyresponse/status and correlate everyfailure tostage/errorcode; account late/abortedrequest andclockdomains. Produce per-scenario p95-neighborhood exclusivebreakdown andtailcohort shares with≥80%maincontributors or explicitunexplainedgap; noaddingindependentp95s.
- [ ] Commitstage1raw/summaryandwrite03/14standalonedelivery. Linkreport to user beforeTask3. If data incomplete,continueboundedmeasurement ordeliverNoGo;neveroptimizewithoutattribution.

### Task 3: Evidence-driven Native candidate(s)

**Files/interfaces:** ExactfilesselectedonlyafterTask2; write task3 supplement withobservedcosts,unchangedbusinesssemantics,RED cases andcandidateexpectedbenefit beforedispatch.
- [ ] Chooseatmost2alternativechangesdirectlytargetingmeasuredcosts;nohistoryprojectionwithoutfreshness/title/snapshot/revocationproof. Task3supplementmustbespecific,noblindimplementation.
- [ ] Implement eachcandidate withliteralNativepermissiontruth,field/company/action/override/appointment preservation andtransaction/cache fences. RunRED/GREENcoveringregressions andscopedreview.
- [ ] Eachactualcandidate50/600hot+coldsamecaps+truth,fulldata;two-instancecommit/nextmedia andRedis/PubSub/DBfaultregression. Failuresclassified;neverstopaftermicrobenchmark.
- [ ] Atboxendstopoptimization. IfNoGo,costdriversandexplicitisolatedcounterfactualexperimentsonly;noadoptedbusinessconcessions.

### Task 4: Final review and delivery

**Files:**03/15reportandconditionalestimate,NativeADRstatusaddendum,sourcebundle/archive+manifest.
- [ ] One broad finalreview andboundedfix/re-review; anycodechangesrequireaffectedfunctional/performance evidence invalidation/rerun asnecessary,notpaperGo.
- [ ] FinalcompleteNativehot/coldstatistics,revoke/faultresults,allnormalfailures,conditionalcostwithoutdoublecountwith11,permanentdiscipline,noformalrepositoryambiguity,humanunsignedsignpage.
- [ ] IfNoGo delivercost-drivenanalysisincludingmeasuredrulesavings/limitations andstop. Archivecompletefailure/success/observer/truth/gitrevision evidence,verifybundle+hashes,input65unchanged. FormalB1/reuse0 retained.
