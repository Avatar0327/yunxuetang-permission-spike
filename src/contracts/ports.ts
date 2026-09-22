import type { Appointment, OrganizationPublic } from '../authz/contracts.js';
import type { DB, Identity } from '../infrastructure/db.js';
export interface PersonFacts { id: string; tenantId: string; companyId: string; departmentId?: string; internal: boolean; enabled: boolean; deleted: boolean }
/** Trusted, non-HTTP ports. Callers supply the same pinned transaction when locking. */
export interface OrganizationFacts extends OrganizationPublic { person(identity: Identity): Promise<PersonFacts | undefined> }
export interface TrainingFacts { appointments(identity: Identity): Promise<Appointment[]> }
export interface ReportProjection { person(db: DB, fact: PersonFacts): Promise<void> }
export interface KnowledgeFacts { catalogs(identity:Identity):Promise<{courses:{id:string;category_id:string;custom_browse:import('../authz/contracts.js').CatalogGrant[]|null}[];categories:import('../knowledge/public.js').CategoryFact[];classroomIds:string[]}> }
export interface AuthorityPorts { knowledge?(db:DB):KnowledgeFacts; organization(db: DB): OrganizationFacts; training(db: DB): TrainingFacts }
