# Task 1 central authorization kernel contract

This is an isolated permission spike, based on approved 04/T-05/T-06/T-07/T-15/T-16. Unit/object-match evidence does not pass any full AUTH-T01–T24 gate. No HTTP, SQL, authoritative revision read, Redis, persistence or UI is implemented here.

## Trusted input boundary

All exported structures describe **internal server facts**, not API DTOs. Transport must load context, memberships, overrides, appointments, node dictionary, effective catalog ancestry and subject membership from authoritative ports. Do not accept grants, ScopeSpec, allowed person IDs, company caps, `businessAllowed`, `published`, `affectedCompanyIds`, resolver callbacks or raw-field flags from clients. Validate external identifiers against tenant-qualified database relations. Reject unknown schema versions, nodes, scopes and subject types. Protect immutable snapshots by current tenant authorization revision; the kernel's numeric binding is not a database freshness proof.

`contracts.ts` is authoritative for exported types. IDs are opaque strings; actions are registered exact strings, with no wildcard or prefix authorization. Context has tenantId/personId/revision, status, primary department, internal flag, current company and server-loaded companyIds. External company caps always reduce to current company even if supplied companyIds contains more. Resource.enabled/deleted are **current target status**; historical status and department do not override them. All resource/company/state facts must come from the owning module.

## Exported signatures

```ts
// policy.ts
normalizePolicy(input: NormalizeInput): EffectiveGrant[]
normalizeCatalog(input: NormalizeCatalogInput): EffectiveGrant[]
buildQueryPolicy(input: QueryInput): Promise<QueryPolicy>
backendCapabilities(grants: readonly EffectiveGrant[], nodes: readonly NodeDefinition[]):
  { backend: boolean; nodes: string[] }
hardAllowed(context: Context, node: NodeDefinition | undefined, resource: Resource,
  affectedCompanyIds?: readonly string[], action?: string): boolean
validContext(context: Context): boolean
activeMembership(membership: Membership, context: Context): boolean
subjectMatches(subject: Subject, context: Context, resolvers: SubjectResolvers): boolean

// scope.ts
companyCap(context: Context): string[]
makeScope(context: Context, node: NodeDefinition, action: string,
  scope: Scope, jurisdiction?: Scope): ScopeSpec | null
resolveScope(spec: ScopeSpec, org: OrganizationSnapshot): ResolvedScope
scopeMatches(scope: ResolvedScope, resource: Resource): boolean
teamMembers(context: Context, org: OrganizationSnapshot): string[]

// delegation.ts
assertCanDelegate(input: DelegateInput): Promise<void>
assertGrantSubset(input: GrantSubsetInput): Promise<void>

// candidates.ts
new NativeCandidate(): Candidate
new CasbinCandidate(): Candidate
// both:
match(input: MatchInput): Promise<MatchResult>
// CASBIN_MODEL is exported for review.
```

`NormalizeInput` contains context/nodes/memberships and optional appointments, explicit appointmentCapabilities and SubjectResolvers. `NormalizeCatalogInput` contains context/nodes/nodeId/catalog/courseId/subjectResolvers and optional customBrowse. `QueryInput` contains context/nodes/grants/nodeId/action and `organization: OrganizationPublic`. `DelegateInput` contains context/nodes/memberships/managementRoleMembershipId, operation create/edit, targetLevel, proposed[] and trusted `resolveObjects(spec): Promise<ObjectSet>`.

`EffectiveGrant` keeps sourceId, sourceKind, optional membershipId, tenantId, actorId, revision, nodeId, action, rawFields, delegable and ScopeSpec **together**. Source IDs are `role:<membership>:<node>:<action>`, `appointment:<appointment>:<node>:<action>` and `catalog:<grant-id>`. Duplicate generated source IDs fail normalization closed. Do not concatenate independently normalized batches with colliding source IDs.

`MatchResult` has allowed, sourceIds, rawFields and revision. Fields are unioned **only over sources which actually match this object for this action**. Native matches registered exact dimensions and source scopes. Casbin builds real model/policy rows and independently enforces each candidate source with a central scope predicate, then collects actual matching source IDs. It does not consume a Native allow boolean. Common hard constraints and semantic normalization intentionally remain shared. Casbin cannot replace override processing, organization relationships, SQL compilation, field projection, delegation subsets or revision/revocation protocols.

## Normalization and closed semantics

Each valid membership contributes its node policy after its own matching override is applied. Null override means zero grant; absent override inherits. An override with another membership ID does not attach to a regranted membership. Scope override cannot create navigation/actions/raw fields. `managed` resolves only that membership's department jurisdiction; missing or unsupported jurisdiction becomes an empty department set. A jurisdiction is currently the explicit `departments` shape, with includeDescendants default false. Other scopes are unaffected by jurisdiction. No implicit global personal upper bound is added.

`all` remains an all marker and does not enumerate people. Department scopes use **current** organization members, not historical department snapshots. ownDept excludes descendants; ownDeptSubtree includes the primary department subtree; no primary department gives empty. The pure reference resolver rejects invalid subtree hierarchy (cycles, invalid parents, >20 depth); production organization must also reject invalid hierarchy writes. Team is strictly managerId == actor, never recursive. `teamMembers` is only relation resolution: Task2 must additionally enforce the registered project team-management action, project switch, current target status and companies before a command.

SELF anchors are registered by node: personId for learning/account, uploaderId for course maintenance, createdBy for project configuration, ownerId for face-to-face. No universal createdBy fallback. Unsupported scope/node combinations yield no grants. Unknown subject resolvers yield no grant; thrown resolver errors deny. Built-ins are authenticated same-tenant public and exact user; catalog_creator compares current authoritative creator. Additional subject types resolve to the same common grant structure.

Appointment capabilities are a server-owned explicit table. Normalization accepts only project resource nodes and exact registered actions and produces objectIds containing that project, no raw fields and no delegation. The backend shell is derived from normalized management grants, never a permanent global role. Consumers must normalize current facts again after revocation; capabilities alone do not authorize data. A scope with no currently resolved objects can retain a navigation hint, but cannot return any records.

Catalog.grants must already be the owning module's effective ancestry policy, including forced ancestor grants and `lockedBy`. Supplying customBrowse when locked throws, including for the creator. Unlocked customBrowse replaces browse only; maintain/distribute/download remain independent. Creator rights are explicit catalog_creator grants, not a matcher bypass. Mutation commands must resolve ancestry authoritatively, reject locked changes, and run `assertGrantSubset` for replacement grants, in addition to their own registered mutation capability. This pure module does not persist ancestry or implement parent-append commands. Download preconditions and publication are action-specific authoritative facts (`publishedActions`, resource.published/businessAllowed), not inferred from browse.

## Bulk SQL consumption (Task 2)

```ts
const grants = normalizePolicy(serverSnapshot);
const plan = await buildQueryPolicy({
  context, nodes, grants, nodeId: 'personal-learning',
  action: 'report.personal-learning.view', organization: organizationPublic,
});
// Revalidate tenant revision before using plan; discard/rebuild or deny on change.
return reportRepository.listAndCount(compileReportPlan(plan), pagination);
```

`OrganizationPublic.resolveScopeMembers(specs: readonly ScopeSpec[], authzRevision: number): Promise<ResolvedScope[]>` is called **once per build**, in input order; results retain exactly their original spec. Empty source list does not call the port. `buildQueryPolicy` validates every selected source binding and every returned spec (including node/action/actor/revision/company cap) and rejects mismatch. QueryPolicy carries tenant/actor/revision/node/action/resourceType/companyIds/companyMode/requirePublished plus `sources: {sourceId, rawFields, resolved}[]`. ResolvedScope has all/personIds and optional anchor/anchorIds/objectIds. ObjectIds is an additional intersection even when all is true.

The repository compiler maps these controlled fields to module-owned columns. For each source, compile its own object/ownership/person predicate; OR source predicates for visible rows, and independently OR only raw-capable source predicates for each raw field's CASE projection. Retain sourceIds internally for audit. Apply tenant, resource state, company and publication constraints **before** sorting/pagination/count/aggregate. Share one authorized relation between list/count/detail/export; no per-row engine enforce or organization queries. `scopeMatches` and candidate classes are reference object checks and microtiming candidates, not the production list algorithm. A bulk caller must never flatten rawFields across all sources before row matching.

CompanyMode current companyId applies to personnel/current objects; dataCompanyId binds historical facts; history grouping may use historicalDepartmentId only after authorization. content means content-level permission and does not share the creator's personnel data. ownWallet is exclusively the registered own-account read path: additionally constrain personId = actor, require a nonempty authoritative dataCompanyId and crossCompanyReference explicitly false, separate each dataCompanyId account, forbid cross-company offsets/references, and never use this mode for management/history reports. Whole-project commands pass the authoritative complete affectedCompanyIds to hardAllowed and must reject unless **every** affected company is covered; do not pass only visible participants.

## Delegation and dynamic sources

`assertCanDelegate` takes one selected managementRoleMembershipId, verifies its active provenance/status and level, and normalizes only that membership. It does not borrow other memberships' ranges or raw fields. The same selected membership must also grant role-management / authz.role.create or authz.role.update (registered all scope), according to operation; a business delegable flag alone is insufficient. Creation accepts only levels 2/3; editing rejects level1 and equal/higher target levels. Creation still requires all selected-context delegation caps. Appointments are not input and cannot delegate. Proposed objects are compared to resolved capability sets, not scope enum ranks; per-object raw-field coverage must be a subset too. Empty proposed sets cannot mint unavailable raw fields.

`assertGrantSubset` exposes the same selected-membership action/set/field check for category/override mutations without role-specific levels/actions. Its input is DelegateInput without operation/targetLevel; the caller must separately enforce its own mutation action and lock rules.

The trusted resolveObjects port returns ObjectSet with tenantId/actorId/revision/nodeId/action/objectIds and must enumerate or otherwise accurately resolve **all** corresponding permitted business objects with company/state caps. Binding is checked; the kernel cannot verify a dishonest port's data. This includes non-person anchors such as course uploader; do not substitute a person-ID resolver for a course object resolver. On persistence save source membership, resolved cap snapshot, revision, and dependencies. Source/organization changes must freeze dependents as recheck_required in the same authority transaction; recheck may mark active or suspended. Inactive/recheck_required/suspended memberships deny now. Graph propagation, cycle rejection, transaction locks and restore are Task2 persistence work, not proven by these pure tests.

## Evidence and limitations

`npm run test:semantic` tests independently literal expected IDs/fields on both engines. Set SEMANTIC_EVIDENCE to an output JSONL filename for detailed shared-helper comparisons. `npm run bench:kernel` prints actual candidate microtimings and versions, including model setup cost; these are not HTTP/SQL performance numbers or SLA evidence. Raw RED/GREEN/audit/microbench evidence lives in evidence/raw (ignored by Git), with commands in the task report. Exact runtime dependencies are locked; csv-parse 7.0.2 overrides Casbin's vulnerable dependency and the exercised model path passes tests. File-backed CSV adapters are not part of this candidate.


## Task3 persistence extension (bounded milestone)

The earlier Task1/Task2 future-work statements above are historical boundaries. Task3 now supplies source-owned facts/projection ports and SQL/HTTP services described in `task3-ports.md`. `Membership.delegation` retains original selected membership/actor, revision and `DelegationCap[]` (node/action/object IDs/raw fields); normalization intersects those saved object caps with current scope. Internal company caps are **own company union explicit grants**, per authoritative 02 §5; external actors remain own-company-only.

RoleService create/edit/addMember/recheck enforce selected-source delegation and recipient-relative actual sets, canonical role policy fanout, local override preservation, cycles and source-ID reincarnation. KnowledgeService uses the same central course query for public/user/role/classroom subjects; persisted inheritance/custom policies, locked import/append commands and protected bytes use authority transactions. `POST /categories/:id/recheck` and `/courses/:id/recheck` follow the stored original membership and audit active/suspended, as does membership recheck. Full AUTH-group/UI/performance acceptance is still pending.


## Task4 authorization dimensions

`NodeDefinition.capDimension` and `ScopeSpec.capDimension` register the meaning of delegated ObjectSet IDs. History and management account use `person-company-v1`: canonical JSON `[personId,dataCompanyId]` pairs, including currently authorized people without any facts/entries. Matching and SQL intersect per-source `personCompanyPairs` with current scope and company cap. `assertGrantSubset` checks dimension binding as well as actor/node/action/revision and stores the dimension with exact validated caps. Legacy fact/entry-ID or unknown dimensions deny; explicit original-source recheck creates a valid cap. Course/project/departments remain exact object-ID sets. No new-fact/entry-trigger freeze is needed, since record creation does not expand the approved person/company authorization set.

`team-enrollment` is a registered direct-team person node: centralized makeScope sets managerId to current actor. Project appointments explicitly map enrollment add/remove actions without requiring a team switch. `department` is a separate registered all-scope resource/action, not a person scope alias; move checks subtree and parent caps. New account and organization owning ports are documented in task4-ports.md. These are shared-transaction prototype interfaces, not an independent service deployment claim.
