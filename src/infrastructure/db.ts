import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
export const metrics = new AsyncLocalStorage<{
    queries: number;
}>();
export const pool = new pg.Pool({ host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 55432), database: process.env.PGDATABASE ?? 'permission_spike', user: process.env.PGUSER ?? 'spike', password: process.env.PGPASSWORD ?? 'spike', max: Number(process.env.PGPOOL ?? 20), connectionTimeoutMillis: 800, statement_timeout: 10000 });
pool.on('error', () => { });
export type DB = Pick<pg.PoolClient, 'query'>;
export async function query(db: DB, sql: string, args: unknown[] = []) { const m = metrics.getStore(); if (m)
    m.queries++; return db.query(sql, args); }
export async function transaction<T>(fn: (db: DB) => Promise<T>) { const db = await pool.connect(); try {
    await query(db, 'BEGIN');
    const result = await fn(db);
    await query(db, 'COMMIT');
    return result;
}
catch (e) {
    await db.query('ROLLBACK');
    throw e;
}
finally {
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
