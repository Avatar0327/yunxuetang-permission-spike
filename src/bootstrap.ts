import {ProjectExports,projectExportRequester} from './training/exports.js';
import {AccountExports,accountExportRequester} from './account/exports.js';
import {registerExportLookup} from './authz/public.js';
import { OrganizationFactsPort } from './organization/public.js';
import { TrainingFactsPort } from './training/public.js';
import { KnowledgeFactsPort } from './knowledge/public.js';
import { CompanyGrantService } from './authz/company-service.js';
import { AccountService } from './account/service.js';
import { RoleService } from './authz/role-service.js';
import { KnowledgeService } from './knowledge/service.js';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { readFile } from 'node:fs/promises';
import { Authority } from './authz/revision.js';
import { SessionCache } from './authz/cache.js';
import { ReportService, type ListOptions } from './report/service.js';
import { EnrollmentService } from './training/enrollment-service.js';
import { TrainingService } from './training/service.js';
import { OrganizationService } from './organization/service.js';
import { ExportService, reportExportRequester } from './report/exports.js';
import { metrics, Denied, Unavailable } from './infrastructure/db.js';
import type { CandidateName } from './authz/bulk-candidate.js';
class AppModule {
}
Module({})(AppModule);
const cache = new SessionCache(), authority = new Authority(cache,{organization:db=>new OrganizationFactsPort(db),training:db=>new TrainingFactsPort(db),knowledge:db=>new KnowledgeFactsPort(db)}), report = new ReportService(authority), training = new TrainingService(authority), organization = new OrganizationService(authority), exportsService = new ExportService(report);
const app = await NestFactory.create(AppModule, new FastifyAdapter({ logger: false }), { logger: false });
const fastify = app.getHttpAdapter().getInstance();
const candidate = (process.env.CANDIDATE ?? 'native') as CandidateName;
if (!['native', 'casbin'].includes(candidate))
    throw new Error('unknown candidate');
function options(q: any): ListOptions { return { groupBy:q.groupBy==='department,job,status'?'department,job,status':undefined, fixture: q.fixture === true || q.fixture === 'true', history: q.history === true || q.history === 'true', aggregate: q.aggregate === true || q.aggregate === 'true', node: typeof q.node === 'string' ? q.node : undefined, limit: q.limit ? Number(q.limit) : 50, offset: q.offset ? Number(q.offset) : 0, search: typeof q.search === 'string' ? q.search : undefined, id: typeof q.id === 'string' ? q.id : undefined, state: ['enabled', 'disabled', 'deleted', 'all'].includes(q.state) ? q.state : 'enabled', cold: process.env.CACHE_MODE === 'cold' }; }
function route(method: string, url: string, handler: (identity: any, req: any) => Promise<any>) {
    fastify.route({ method, url, handler: async (req: any, reply: any) => metrics.run({ queries: 0 }, async () => {
            const at = new Date().toISOString(), start = performance.now();
            try {
                const identity = await authority.token(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
                const tokenMs = performance.now() - start;
                const payload = await handler(identity, req);
                if (payload.evidence)
                    payload.evidence.permissionMs += tokenMs;
                return reply.send({ ...payload, meta: { candidate, instance: process.env.INSTANCE_ID ?? String(process.pid), pid: process.pid, pubsub: false, requestAt: at, responseAt: new Date().toISOString(), elapsedMs: performance.now() - start, authorityObservedAt:metrics.getStore()!.authorityObservedAt,observedRevision:metrics.getStore()!.observedRevision, queryCount: metrics.getStore()!.queries } });
            }
            catch (e) {
                const error = e instanceof Denied ? e : (['23503','23505','23514','P0001'].includes((e as any)?.code) ? new Denied() : new Unavailable());
                return reply.code(error.status).send({ message: error.message, meta: { candidate, pubsub:false, instance: process.env.INSTANCE_ID ?? String(process.pid), requestAt: at, responseAt: new Date().toISOString(), elapsedMs: performance.now() - start, authorityObservedAt:metrics.getStore()!.authorityObservedAt,observedRevision:metrics.getStore()!.observedRevision, queryCount: metrics.getStore()!.queries } });
            }
        }) });
}
const account=new AccountService(authority);
route('GET','/account/own',async(i)=>account.own(i,candidate));
route('GET','/account/entries',async(i)=>account.list(i,candidate));
route('GET','/account/export',async(i,r)=>account.exportPage(i,candidate,Math.max(0,Number(r.query.offset??0))));
route('GET','/account/entries/:id',async(i,r)=>account.list(i,candidate,false,r.params.id));
route('GET','/account/entries/:id/source',async(i,r)=>account.list(i,candidate,false,r.params.id,true));
route('POST','/account/offset',async(i,r)=>account.offset(i,candidate,r.body??{}));
const roles=new RoleService(authority),knowledge=new KnowledgeService(authority);
route('POST','/company-grants',async(i,r)=>new CompanyGrantService(authority).change(i,candidate,r.body??{}));
route('POST','/roles',async(i,r)=>roles.create(i,r.body??{}));
route('POST','/roles/:id',async(i,r)=>roles.edit(i,r.params.id,r.body??{}));
route('POST','/roles/:id/members',async(i,r)=>roles.addMember(i,r.params.id,r.body??{}));
route('POST','/memberships/:id/recheck',async(i,r)=>roles.recheck(i,r.params.id,r.body?.managementRoleMembershipId));
route('POST','/departments/:id/move',async(i,r)=>organization.moveDepartment(i,candidate,r.params.id,r.body?.parentId));
route('POST','/categories',async(i,r)=>knowledge.createCategory(i,candidate,r.body??{}));
route('POST','/categories/import',async(i,r)=>knowledge.importCategories(i,candidate,r.body?.updates));
route('POST','/categories/:id/recheck',async(i,r)=>knowledge.recheckPolicy(i,candidate,r.params.id,'category'));
route('POST','/courses/:id/recheck',async(i,r)=>knowledge.recheckPolicy(i,candidate,r.params.id,'custom'));
route('POST','/categories/:id',async(i,r)=>knowledge.updateCategory(i,candidate,r.params.id,r.body??{}));
route('POST','/categories/:id/append-preview',async(i,r)=>knowledge.append(i,candidate,r.params.id,r.body??{},true));
route('POST','/categories/:id/append',async(i,r)=>knowledge.append(i,candidate,r.params.id,r.body??{},false));
route('GET','/face-to-face',async(i)=>training.faceToFace(i,candidate));
route('GET','/face-to-face/:id',async(i,r)=>training.faceToFace(i,candidate,r.params.id));
route('GET','/courses',async(i,r)=>knowledge.courses(i,candidate,r.query));
route('GET','/courses/:id',async(i,r)=>knowledge.courses(i,candidate,{id:r.params.id,action:r.query.action}));
route('GET','/courses/:id/download',async(i,r)=>knowledge.download(i,candidate,r.params.id));
route('POST','/courses/:id',async(i,r)=>knowledge.saveCourse(i,candidate,r.params.id,r.body??{}));
route('POST','/courses/:id/distribute',async(i,r)=>knowledge.distribute(i,candidate,r.params.id));
route('POST','/courses/:id/browse-policy',async(i,r)=>knowledge.customBrowse(i,candidate,r.params.id,r.body??{}));
route('GET', '/auth/me', async (i) => { const r = await authority.load(i); return { capabilities: r.capabilities, revision: r.context.revision }; });
route('GET', '/report', async (i, r) => report.list(i, candidate, options(r.query)));
route('GET', '/history', async (i, r) => report.list(i, candidate, { ...options(r.query), history: true, aggregate: true }));
route('GET', '/projects', async (i) => { const r = await training.projects(i, candidate); return { rows: r.rows, count: r.count }; });
route('GET', '/projects/:id', async (i, r) => { const x = await training.projects(i, candidate, r.params.id); return { rows: x.rows, count: x.count }; });
route('GET', '/projects/:id/roster', async (i, r) => training.roster(i, candidate, r.params.id,r.query.search));
route('GET','/projects/:id/people/:personId/progress',async(i,r)=>training.personal(i,candidate,r.params.id,r.params.personId,'progress'));
route('GET','/projects/:id/people/:personId/attachment',async(i,r)=>training.personal(i,candidate,r.params.id,r.params.personId,'attachment'));
route('GET','/projects/:id/media/:segment/ticket',async(i,r)=>training.mediaTicket(i,candidate,r.params.id,r.params.segment));
route('GET', '/projects/:id/media/:segment', async (i, r) => training.media(i, candidate, r.params.id,r.params.segment,r.query.ticket));
route('POST','/projects/:id/enrollments',async(i,r)=>new EnrollmentService(authority,training).change(i,candidate,r.params.id,r.body??{}));
route('POST', '/projects/:id', async (i, r) => training.save(i, candidate, r.params.id, r.body ?? {}));
route('POST', '/appointments', async (i, r) => { if (typeof r.body?.active !== 'boolean')
    throw new Denied(); return training.appoint(i, candidate, r.body.personId, r.body.projectId, r.body.active); });
route('POST', '/memberships/:id/revoke', async (i, r) => organization.revoke(i, candidate, r.params.id));
route('POST', '/people/:id', async (i, r) => organization.update(i, candidate, r.params.id, r.body ?? {}));
route('POST', '/exports', async (i, r) => exportsService.create(i, candidate, options(r.body ?? {})));
route('POST', '/exports/:id/execute', async (i, r) => exportsService.phase(i, candidate, r.params.id, 'execute'));
route('GET', '/exports/:id/claim', async (i, r) => exportsService.phase(i, candidate, r.params.id, 'claim',Number(r.query.chunk??0)));
const projectExports=new ProjectExports(training),accountExports=new AccountExports(account);
registerExportLookup('report',reportExportRequester);registerExportLookup('training',projectExportRequester);registerExportLookup('account',accountExportRequester);
route('POST','/projects/:id/exports',async(i,r)=>projectExports.create(i,candidate,{projectId:r.params.id}));
route('POST','/project-exports/:id/execute',async(i,r)=>projectExports.phase(i,candidate,r.params.id,'execute'));
route('GET','/project-exports/:id/claim',async(i,r)=>projectExports.phase(i,candidate,r.params.id,'claim',Number(r.query.chunk??0)));
route('POST','/account/exports',async(i)=>accountExports.create(i,candidate,{}));
route('POST','/account/exports/:id/execute',async(i,r)=>accountExports.phase(i,candidate,r.params.id,'execute'));
route('GET','/account/exports/:id/claim',async(i,r)=>accountExports.phase(i,candidate,r.params.id,'claim',Number(r.query.chunk??0)));
for(const [domain,service] of Object.entries({report:exportsService,training:projectExports,account:accountExports})){
 fastify.post('/worker/'+domain+'/exports/:id/execute',async(req:any,reply:any)=>metrics.run({queries:0},async()=>{
  const requestAt=new Date().toISOString();const meta=()=>({candidate,instance:process.env.INSTANCE_ID??String(process.pid),pid:process.pid,pubsub:false,requestAt,responseAt:new Date().toISOString(),authorityObservedAt:metrics.getStore()!.authorityObservedAt,observedRevision:metrics.getStore()!.observedRevision,queryCount:metrics.getStore()!.queries});
  try{if(Object.keys(req.body??{}).length)throw new Denied();return {...await service.worker(String(req.headers.authorization??'').replace(/^Bearer /,''),candidate,req.params.id),meta:meta()};}
  catch(e){const error=e instanceof Denied?e:new Unavailable();return reply.code(error.status).send({message:error.message,meta:meta()});}
 }));
}
fastify.get('/', async (_: any, reply: any) => reply.type('text/html').send(await readFile('web/index.html', 'utf8')));
for (const [url, path, type] of [['/assets/vue.js', 'node_modules/vue/dist/vue.global.prod.js', 'text/javascript'], ['/assets/element.js', 'node_modules/element-plus/dist/index.full.min.js', 'text/javascript'], ['/assets/element.css', 'node_modules/element-plus/dist/index.css', 'text/css']])
    fastify.get(url, async (_: any, reply: any) => reply.type(type).send(await readFile(path!)));
await app.listen(Number(process.env.PORT ?? 4311), '0.0.0.0');
console.log(JSON.stringify({ ready: true, port: process.env.PORT ?? 4311, candidate, instance: process.env.INSTANCE_ID ?? process.pid, pubsub: false }));
