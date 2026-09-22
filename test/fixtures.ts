import type { Context, Membership, NodeDefinition, OrganizationSnapshot, Resource, Scope } from '../src/authz/contracts.js';
export const ctx: Context = { tenantId: 'T1', personId: 'M', companyId: 'I', companyIds: ['I', 'CA', 'CB'], internal: true, authenticated: true, enabled: true, deleted: false, revision: 7, departmentId: 'D1' };
export const org: OrganizationSnapshot = { tenantId: 'T1', revision: 7, departments: [{ id: 'D1' }, { id: 'D11', parentId: 'D1' }, { id: 'D2' }], people: [
        { id: 'A', departmentId: 'D1', managerId: 'M' }, { id: 'B', departmentId: 'D2', managerId: 'M' }, { id: 'C', departmentId: 'D1', managerId: 'N' }, { id: 'D', departmentId: 'D11', managerId: 'N' }, { id: 'E', departmentId: 'D2', managerId: 'A' }
    ] };
const six = ['all', 'ownDeptSubtree', 'ownDept', 'departments', 'managed', 'self'] as const;
export const nodes: NodeDefinition[] = [
    {id:'role-management',resourceType:'role',actions:['authz.role.create','authz.role.update'],scopes:['all'],companyMode:'content',backend:true,rawFields:[]},
    { id: 'personal-learning', resourceType: 'learning', actions: ['report.personal-learning.view', 'report.personal-learning.edit', 'report.personal-learning.download'], scopes: [...six], selfAnchor: 'personId', departmentAnchor: 'personId', companyMode: 'dataCompanyId', backend: true, rawFields: ['phone'] },
    { id: 'department-report', resourceType: 'learning', actions: ['report.department.view'], scopes: [...six], selfAnchor: 'personId', departmentAnchor: 'personId', companyMode: 'dataCompanyId', backend: true, rawFields: ['phone'] },
    { id: 'account', resourceType: 'account', actions: ['account.view'], scopes: ['all', 'self'], selfAnchor: 'personId', companyMode: 'dataCompanyId', backend: false, rawFields: [] },
    { id: 'wallet-own', resourceType: 'account', actions: ['account.own.view'], scopes: ['self'], selfAnchor: 'personId', companyMode: 'ownWallet', backend: false, rawFields: [] },
    { id: 'course', resourceType: 'course', actions: ['knowledge.course.browse', 'knowledge.course.maintain', 'knowledge.course.distribute', 'knowledge.course.download'], scopes: ['all', 'self'], selfAnchor: 'uploaderId', companyMode: 'content', backend: true, rawFields: [] },
    { id: 'project', resourceType: 'project', actions: ['training.project.view', 'training.project.update', 'training.project.export'], scopes: ['all', 'self'], selfAnchor: 'createdBy', companyMode: 'companyId', backend: true, rawFields: [] },
    { id: 'face', resourceType: 'face', actions: ['training.face.update'], scopes: ['all', 'self'], selfAnchor: 'ownerId', companyMode: 'companyId', backend: true, rawFields: [] },
    { id: 'organization', resourceType: 'person', actions: ['organization.person.view'], scopes: ['all', 'self'], selfAnchor: 'personId', companyMode: 'companyId', backend: true, rawFields: ['phone'] }
];
export function membership(id: string, scope: Scope = { kind: 'all' }, action = 'report.personal-learning.view', nodeId = 'personal-learning'): Membership {
    return { id, personId: 'M', tenantId: 'T1', roleId: `role-${id}`, level: 2, active: true, provenance: 'system_origin', policies: [{ nodeId, navigation: true, actions: [action], rawFields: [], scope, delegableActions: [] }] };
}
export function learning(id: string, company = 'CA'): Resource { return { id: `L-${id}`, tenantId: 'T1', type: 'learning', personId: id, companyId: company, dataCompanyId: company, enabled: true, deleted: false, exists: true }; }
export function project(id: string, company = 'CA'): Resource { return { id, tenantId: 'T1', type: 'project', companyId: company, enabled: true, deleted: false, exists: true, createdBy: 'N' }; }
