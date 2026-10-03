import {observePool, observing} from './telemetry.js';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
export const metrics = new AsyncLocalStorage<{
    queries: number;
    observedRevision?: number;
    authorityObservedAt?: string;
}>();
const connection = { host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 55432), database: process.env.PGDATABASE ?? 'permission_spike', user: process.env.PGUSER ?? 'spike', password: process.env.PGPASSWORD ?? 'spike', connectionTimeoutMillis: 800, statement_timeout: 10000 };
// Round 2 isolation: the per-process connection total stays PGPOOL (default 20).
// Authority reads and heavy analytical reads no longer queue behind each other;
// the general pool keeps transactions, writes and other domain reads.
const total = Number(process.env.PGPOOL ?? 20), authzMax = Number(process.env.PGPOOL_AUTHZ ?? 4), analyticsMax = Number(process.env.PGPOOL_ANALYTICS ?? 12);
if (!(authzMax >= 1 && analyticsMax >= 1 && total - authzMax - analyticsMax >= 1)) throw new Error('invalid PGPOOL split');
export const pool = new pg.Pool({ ...connection, max: total - authzMax - analyticsMax });
export const authzPool = new pg.Pool({ ...connection, max: authzMax, allowExitOnIdle: true });
export const analyticsPool = new pg.Pool({ ...connection, max: analyticsMax, allowExitOnIdle: true });
export const poolSizes = { total, general: total - authzMax - analyticsMax, authz: authzMax, analytics: analyticsMax };
for (const p of [pool, authzPool, analyticsPool]) {
    p.on('error', () => { });
    if (observing()) observePool(p);
}
/** Runs fn on one checked-out client when given a pool; an existing client or transaction is reused as is. */
export async function pinned<T>(db: DB, fn: (db: DB) => Promise<T>): Promise<T> {
    if (!(db instanceof pg.Pool)) return fn(db);
    const client = await db.connect();
    try { return await fn(client); }
    finally { client.release(); }
}
export type DB = Pick<pg.PoolClient, 'query'>;
// Only this transaction boundary may grant a live, pinned transaction client.
const activeTransactions = new WeakSet<DB>();
export function requireTransaction(db: DB): void {
    if (!activeTransactions.has(db)) throw new Unavailable();
}
export async function query(db: DB, sql: string, args: unknown[] = []) { const m = metrics.getStore(); if (m)
    m.queries++; return db.query(sql, args); }
export async function transaction<T>(fn: (db: DB) => Promise<T>) { const db = await pool.connect(); try {
    await query(db, 'BEGIN ISOLATION LEVEL READ COMMITTED');
    activeTransactions.add(db);
    const result = await fn(db);
    await query(db, 'COMMIT');
    return result;
}
catch (e) {
    await db.query('ROLLBACK');
    throw e;
}
finally {
    activeTransactions.delete(db);
    db.release();
} }
export class Denied extends Error {
    status = 403;
    constructor() { super('你暂时不能查看或操作这项内容，请联系管理员确认权限'); }
}
export class Unavailable extends Error {
    status = 503;
    constructor() { super('服务暂不可用，请稍后重试'); }
}
export interface Identity {
    tenantId: string;
    personId: string;
}
