/** Internal server-fact contracts. Never deserialize these from request bodies. */
export type ScopeKind = 'all' | 'ownDeptSubtree' | 'ownDept' | 'departments' | 'managed' | 'self';
export type Scope = {
    kind: 'all' | 'ownDeptSubtree' | 'ownDept' | 'managed' | 'self';
} | {
    kind: 'departments';
    departmentIds: string[];
    includeDescendants?: boolean;
};
export type Anchor = 'personId' | 'uploaderId' | 'createdBy' | 'ownerId';
export interface Context {
    tenantId: string;
    personId: string;
    companyId: string;
    companyIds: string[];
    internal: boolean;
    authenticated: boolean;
    enabled: boolean;
    deleted: boolean;
    revision: number;
    departmentId?: string;
}
export interface NodeDefinition {
    id: string;
    resourceType: string;
    actions: string[];
    scopes: ScopeKind[];
    selfAnchor?: Anchor;
    departmentAnchor?: 'personId';
    companyMode: 'companyId' | 'dataCompanyId' | 'content' | 'ownWallet';
    backend: boolean;
    rawFields: string[];
    publishedActions?: string[];
}
export interface Subject {
    type: string;
    id: string;
}
export type SubjectResolver = (subject: Subject, context: Context) => boolean;
export type SubjectResolvers = Record<string, SubjectResolver>;
export type Provenance = 'system_origin' | 'active' | 'inactive' | 'recheck_required' | 'suspended';
export interface NodePolicy {
    nodeId: string;
    navigation: boolean;
    actions: string[];
    rawFields: string[];
    scope: Scope;
    delegableActions: string[];
}
export interface DelegationCap { nodeId:string; action:string; objectIds:string[]; rawFields:string[] }
export interface Membership {
    delegation?: { sourceMembershipId:string; sourceActorId:string; revision:number; caps:DelegationCap[] };
    id: string;
    tenantId: string;
    personId: string;
    roleId: string;
    level: 1 | 2 | 3;
    active: boolean;
    provenance: Provenance;
    policies: NodePolicy[];
    jurisdiction?: Scope;
    overrides?: {
        membershipId: string;
        nodeId: string;
        scope: Scope | null;
    }[];
    subject?: Subject;
}
export interface Appointment {
    id: string;
    tenantId: string;
    personId: string;
    projectId: string;
    active: boolean;
}
export interface AppointmentCapability {
    nodeId: string;
    actions: string[];
}
export interface ScopeSpec {
    tenantId: string;
    actorId: string;
    revision: number;
    nodeId: string;
    action: string;
    resourceType: string;
    scope: Scope;
    departmentId?: string;
    anchor?: Anchor;
    departmentAnchor?: 'personId';
    companyIds: string[];
    companyMode: NodeDefinition['companyMode'];
    objectIds?: string[];
    managerId?: string;
}
export interface EffectiveGrant {
    sourceId: string;
    sourceKind: 'role' | 'appointment' | 'catalog';
    membershipId?: string;
    tenantId: string;
    actorId: string;
    revision: number;
    nodeId: string;
    action: string;
    rawFields: string[];
    delegable: boolean;
    scope: ScopeSpec;
}
export interface Resource {
    id: string;
    tenantId: string;
    type: string;
    companyId?: string;
    dataCompanyId?: string;
    personId?: string;
    uploaderId?: string;
    createdBy?: string;
    ownerId?: string;
    enabled: boolean;
    deleted: boolean;
    exists: boolean;
    published?: boolean;
    businessAllowed?: boolean;
    crossCompanyReference?: boolean;
    historicalDepartmentId?: string;
}
export interface OrganizationSnapshot {
    tenantId: string;
    revision: number;
    departments: {
        id: string;
        parentId?: string;
    }[];
    people: {
        id: string;
        departmentId?: string;
        managerId?: string;
    }[];
}
export interface ResolvedScope {
    spec: ScopeSpec;
    all: boolean;
    personIds: string[];
    anchor?: Anchor;
    anchorIds?: string[];
    objectIds?: string[];
}
/** Task2 provides the real version-bound organization implementation, called once per batch. */
export interface OrganizationPublic {
    resolveScopeMembers(specs: readonly ScopeSpec[], authzRevision: number): Promise<ResolvedScope[]>;
}
export interface MatchInput {
    context: Context;
    nodeId: string;
    action: string;
    resource: Resource;
    nodes: readonly NodeDefinition[];
    grants: readonly EffectiveGrant[];
    organization: OrganizationSnapshot;
    affectedCompanyIds?: string[];
}
export interface MatchResult {
    allowed: boolean;
    sourceIds: string[];
    rawFields: string[];
    revision: number;
}
export interface Candidate {
    readonly name: string;
    match(input: MatchInput): Promise<MatchResult>;
}
export interface CatalogGrant {
    id: string;
    action: string;
    subject: Subject;
}
export interface Catalog {
    id: string;
    tenantId: string;
    creatorId: string;
    lockedBy?: string;
    grants: CatalogGrant[];
}
export interface ObjectSet {
    tenantId: string;
    actorId: string;
    revision: number;
    nodeId: string;
    action: string;
    objectIds: string[];
}
export interface ProposedGrant {
    /** Trusted owning-module affected IDs; never copied from a request DTO. */
    objectIds?: string[];
    nodeId: string;
    action: string;
    scope: Scope;
    rawFields: string[];
}
export interface QuerySource {
    sourceId: string;
    rawFields: string[];
    resolved: ResolvedScope;
}
export interface QueryPolicy {
    tenantId: string;
    actorId: string;
    revision: number;
    nodeId: string;
    action: string;
    resourceType: string;
    companyIds: string[];
    companyMode: NodeDefinition['companyMode'];
    requirePublished: boolean;
    sources: QuerySource[];
}
