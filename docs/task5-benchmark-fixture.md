# Complex non-ALL workload fixture

Clean `npm run seed` retains exactly50000 main people,500 other-tenant people,2000 main departments,20 seed roles and1,000,000 nonfixture facts. Existing `person-00003` is internalI, department wide-3, with explicit companyA grant (noB). It has3 non-super memberships:

1. bm-managed/role-5, level2: managed jurisdiction wide-1..1200; membership-local override to wide-1..900 on personal-learning/history. View only, no raw fields.
2. bm-extra/role-6, level2: specified wide-751..1350 on personal-learning/history; overlap with the first source; view only, no raw fields.
3. bm-raw/role-7, level3: personal-learning ownDept, phone raw only. This adds a field only to wide-3 people actually matching it.

The first two saved delegation fixtures use admin/Z as original source metadata, exact person object caps for lists, and canonical `[personId,company]` pairs for history. They are seeded reviewed synthetic cap snapshots with system_origin and no dependency FK; they do not prove that a production delegation API generated50k caps within an SLA. The cap input includes bothI/A per selected current person; facts still match their immutable company and current scope. No ALL marker hides the resolution cost.

Independent arithmetic: a bulk person j has department `1+(j-1)%1977`, company `[I,A,B][j%3]`. First scope resolves23062 current bulk people before its saved/company intersection; second15000; noALL. Pair caps30750 and20000. Effective union is departments1..1350 intersectI/A:22500+375=22875 people. These have20 facts each plus173 people among j<=260 with a21st fact:457673 facts. Current person-00003 retains real valid department/company; no50001st person or null-department customer shortcut is used. Broad actorM remains49998 current rows and1000002 facts. Small X SELF correctness cases remain in domain suites.

Cold snapshot construction and JSON cap serialization can be expensive. `task5-complex-{candidate}.json` records measured heap/RSS before/after, elapsed plan time and actual membership storage/json sizes; those snapshots are diagnostic, not precise retained-heap or production-memory gates. Four short4-client3-second mixed windows are correctness/smoke only. Controller independently recomputes the oracle and runs four capped50-client600-second candidate×temperature windows. Permission overhead50ms/list500ms/history2s thresholds are unchanged; short smoke can already exceed the permission threshold and no performance Go is claimed.
