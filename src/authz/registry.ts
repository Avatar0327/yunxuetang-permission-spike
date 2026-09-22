import type { NodeDefinition, AppointmentCapability } from './contracts.js';
const scopes: NodeDefinition['scopes'] = ['all', 'ownDept', 'ownDeptSubtree', 'departments', 'managed', 'self'];
export const nodes: NodeDefinition[] = [
    ...['personal-learning', 'department-report'].map(id => ({ id, resourceType: 'person', actions: ['report.personal-learning.view', 'report.personal-learning.export', 'report.personal-learning.update'], scopes, selfAnchor: 'personId' as const, departmentAnchor: 'personId' as const, companyMode: 'companyId' as const, backend: true, rawFields: ['phone', 'email', 'id_card'] })),
    { id: 'history', resourceType: 'learning', actions: ['report.history.view', 'report.history.export'], scopes, selfAnchor: 'personId', departmentAnchor: 'personId', companyMode: 'dataCompanyId', backend: true, rawFields: [] },
    { id: 'project', resourceType: 'project', actions: ['training.project.view', 'training.project.update', 'training.project.export', 'training.project.download', 'training.project.appoint'], scopes: ['all', 'self'], selfAnchor: 'createdBy', companyMode: 'content', backend: true, rawFields: [] },
    { id: 'role-management', resourceType: 'role', actions: ['authz.role.create','authz.role.update','authz.role.recheck'], scopes: ['all'], companyMode:'content', backend:true, rawFields:[] },
    { id: 'category', resourceType: 'category', actions: ['knowledge.category.create','knowledge.category.configure','knowledge.category.append'], scopes:['all'], companyMode:'content',backend:true,rawFields:[] },
    { id: 'course', resourceType:'course', actions:['knowledge.course.browse','knowledge.course.maintain','knowledge.course.distribute','knowledge.course.download'],scopes:['all','self'],selfAnchor:'uploaderId',companyMode:'content',backend:true,rawFields:[],publishedActions:['knowledge.course.browse','knowledge.course.download'] },
    { id:'face-to-face',resourceType:'face-to-face',actions:['training.face-to-face.view','training.face-to-face.update'],scopes:['all','self'],selfAnchor:'ownerId',companyMode:'content',backend:true,rawFields:[] },
    { id: 'administration', resourceType: 'person', actions: ['organization.person.update', 'authz.membership.revoke'], scopes: ['all'], departmentAnchor: 'personId', companyMode: 'companyId', backend: true, rawFields: [] },
];
export const appointmentCapabilities: AppointmentCapability[] = [{ nodeId: 'project', actions: ['training.project.view', 'training.project.update', 'training.project.export', 'training.project.download'] }];
