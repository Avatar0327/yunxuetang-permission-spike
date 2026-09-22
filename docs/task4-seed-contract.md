# Task4 synthetic seed contract (independent oracle input)

This contract describes the generating formulas, not results copied from authorization SQL. `npm run seed` recreates only synthetic schemas. Reseed before a scale/benchmark campaign: mutation suites intentionally create temporary roles, departments, courses and facts, and some Task3 fixtures persist until reseed. Exact main cardinality is 50,000 people, 2,000 departments, 20 seed roles, 1,000,000 non-fixture facts; tenant T2 has 500 people. Do not count fixture rows as bulk workload. All IDs and data below are synthetic. Do not use this as a formal B1 schema migration.

## Companies and organization

Each tenant has company IDs I (internal), A (customer A), B (customer B). `internal` is a trusted server fixture attribute, never a client permission claim. Internal cap is own company union explicit company_grant rows; an external cap is only current company regardless of grant rows.

T1 departments:

- D1, D2 are I roots; D11 is I child of D1.
- chain-1 .. chain-20 are I: chain-1 root, each subsequent department has previous parent. The deepest depth is exactly 20.
- wide-1 .. wide-1977: company is [I,A,B][i mod 3] (zero-based). wide-1 is A root, wide-2 B root. Remaining A branches parent wide-1, B branches parent wide-2, I branches parent D2.
- Thus I has 3 + 20 + 659 = 682 departments, A has 659, B has 659. T2 has one I root `other`.

Physical composite keys bind department to `(tenant,company,id)`, parent to the same tenant/company, and non-null person.department_id to the person's company. Invalid parent, cross-company parent/person-department, cycle and depth21 are rejected. Schema deliberately keeps person.department_id nullable **only to represent abnormal/missing-fact authorization fixtures**; approved02's normal main department is required. Normal `/people/:id` rejects `departmentId:null`. A normal manager may be cleared with `managerId:null`. This prototype's nullable physical person column is not evidence of formal02 physical-schema conformance. Tests label direct null injection explicitly and synchronously deliver projections; it is not a product mutation command.

Fixed T1 people (13): M,A,B,C,D,E,N are I in departments D1,D1,D2,D1,D11,D2,D2. A and B report directly to M; C/D to N; E to A. M/N have no manager. X is A, Y is B. L,Z,disabled,deleted are I. These six X/Y/L/Z/disabled/deleted deliberately lack a primary department and manager, including customer X/Y: they are abnormal boundary fixtures, not valid normal customer organization examples. `disabled` is disabled, `deleted` soft-deleted; the other 11 are enabled/current. Valid mixed-company isolation and scale derive from the bulk fixtures and company-qualified departments, not these null-department people.

Bulk T1 people: `person-00001` .. `person-49987`, integer j=1..49987. Company is [I,A,B][j mod 3]. Department is `wide-(1 + ((j-1) mod 1977))`. Because 1977 is divisible by3, this department always belongs to the same company. All bulk people are enabled/nondeleted, manager null; internal is true precisely for I. For each wide-k, there are 25 people plus one if k<=562 (49987 = 1977*25+562). Company people totals, including fixed rows: I=16662+11=16673, A=16663+1=16664, B=16662+1=16663. Current enabled/nondeleted count is 49998 (I=16671,A=16664,B=16663).

T2 people `other-1` .. `other-500` belong to I/other. Their display_name is `person-` plus the five-digit integer, equal to the first500 T1 bulk display names, but IDs and tenant keys differ. T1 display_name equals ID. Current job_id is `job-internal` for I and `job-customer` otherwise. Projection raw fixture strings are `phone-<id>`, `email-<id>`, `card-<id>`; these are not real PII. Only A/B/C/D/E/M/N have projection.fixture=true.

Seed roles are role-1..role-20. m-broad(M) gives personal-learning view/export and history all. m-dept(M) gives personal-learning/department-report ownDept raw phone/email/id_card. x-self(X) gives history SELF, own-account SELF, and management account SELF view/source/export. admin(Z) explicitly grants registered actions; level1 alone does not create permissions or delegability. `prepareAdmin()` in tests explicitly marks actions delegable. L has no seed management membership. M and Z have explicit I/A/B grants; L has I. Removing all M cross-company grants leaves I via own-company cap.

Sessions use hashed server-side `spike-M/X/Y/L/Z/disabled/deleted`; actor IDs in bodies do not establish sessions. Tests can insert additional synthetic hashed sessions (e.g. person-00001) without adding a person. No 50,001st main person is created.

## Immutable learning facts

For n=1..1,000,000, id is `fact-` plus seven-digit n. Let j=1+((n-1) mod49987); person=`person-<five-digit j>`, data_company=[I,A,B][j mod3], historical_department=`old-dept-(n mod20)`, points=1, historical_job=`old-job-(n mod5)`, historical_status=`disabled` when n mod7=0 else `enabled`. All fact records are enabled/nondeleted and fixture=false. Fact status flags describe row validity; historical_status is the immutable captured person status.

Each person j<=260 has21 facts, all other bulk people20 (49987*20+260=1,000,000). Company nonfixture fact totals are I=333326, A=333347, B=333327. Each historical department has50,000 facts/points; each historical job200,000. Historical statuses: disabled142857, enabled857143. Historical department and job are correlated by n modulo20/5; do not multiply independent group counts. Current bulk people remain enabled even for historical disabled snapshots.

Two fixture facts: h-X-A=(X,A,old-A,10 points), h-X-B=(X,B,old-B,20 points), historical_job null, historical_status enabled. X's current company starts A, so SELF reads only h-X-A; transferring X to B does not mutate either row and then SELF reads only h-X-B. Baseline M with all company grants sees1,000,002 facts. Historical group old-dept-* IDs are snapshot labels, not current live department foreign keys. Current organization state filters use report.person_projection, and current authorized people come from the central organization scope resolver.

History data_company, person, historical department/job/status are physically immutable on UPDATE. Fixture deletion/seed reset is allowed. Authorization applies before grouping; snapshot grouping does not confer scope. Current projections hold company/status/department/manager/job/display name. Report/training/account updates use owning public ports in the same marked transaction.

## Project and account seed

Projects P/Q are valid, enabled, created by Z, initially team_enabled=false. P roster is A(company I), X(A), Y(B), with progress50/25/75 respectively and attachment `attachment-<personID>`. Q empty. The T07 HTTP suite first assigns X to valid A/ wide-1 and Y to valid B/ wide-2, and restores their abnormal null-department fixtures only during cleanup. Appointment fixtures and shared published course fixtures are installed by tests; they do not alter people cardinality. Course/public authorizations continue to use Task3's centralized catalog contracts.

Account sources: source-X-A company A and source-X-B company B. X's entries:

| ID | Company | Currency | Kind | Amount / initial remaining |
|---|---|---|---|---:|
| debt-X-A | A | credit | debt | 30 |
| debt-X-B | B | credit | debt | 10 |
| reward-X-B | B | credit | reward | 20 |
| reward-X-B-point | B | point | reward | 8 |

Own wallet initial groups are A/credit balance0 debt30; B/credit balance20 debt10; B/point balance8 debt0. Offsetting debt-X-B/reward-X-B consumes10 from each, leaving B/credit balance10 debt0 while A debt30 stays. A/B and credit/point mismatches reject before updates. This is a minimal isolation/offset mechanism, not the formal credit/reward/recovery engine. Management uses node/action/current person scope/data company; own-wallet does not expose source payload. Sources are physically bound to entry data_company. Account export is currently synchronous protected JSON and remains explicitly in Task5's chunking/revocation audit scope.

## Stable authorization cap oracle

History and management account delegation use cap `dimension: person-company-v1`; objectIds are canonical JSON arrays `[personId,dataCompanyId]`, serialized without spaces. The exact set is **current authorized people × authorized historical/data companies**, intersected with the original selected source's saved pairs. It is independent of existing fact/entry IDs and of their creation times. For L SELF with own I and no rows, expected cap is exactly `["L","I"]` even before the first learning fact/account entry exists. A new L/I fact/entry is visible immediately; L/A is not. Currency is not an authorization scope dimension; offset enforces equal currency each time. Own-account remains a separate narrow exception.

Known current person changes, source changes and company revocation retain the conservative freeze/recheck protocol. Old history/account fact-ID caps or unknown dimensions deny until explicitly rechecked against the original source. Courses/projects/departments keep exact resource-ID caps. Department moves require the moved subtree and the non-null destination parent to be inside the department action's cap; person.update does not imply department.move.

This pair representation can enumerate up to roughly people×companies during delegation and create large JSON snapshots. Normal ALL list paths still do not enumerate the tenant. Task5 must measure large-cap memory/storage/SQL/Casbin costs independently; no production-performance conclusion is implied here.
