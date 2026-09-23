import {instrumentMethods, recordError, span} from '../infrastructure/telemetry.js';
import { createClient } from 'redis';
import { Unavailable } from '../infrastructure/db.js';
export class SessionCache {
    private redis = createClient({ socket: { host: process.env.REDIS_HOST ?? '127.0.0.1', port: Number(process.env.REDIS_PORT ?? 56379), connectTimeout: 300, reconnectStrategy: () => false }, disableOfflineQueue: true });
    private connecting?: Promise<unknown>;
    private l1 = new Map<string, string>();
    constructor() { this.redis.on('error', () => { }); }
    private async timed<T>(p: Promise<T>): Promise<T> { let timer: ReturnType<typeof setTimeout>; try {
        return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => { recordError('redis.timeout', {name:'TimeoutError',code:'REDIS_TIMEOUT'}); reject(new Unavailable()); }, Number(process.env.REDIS_TIMEOUT_MS ?? 300)); })]);
    }
    catch (e) {
        recordError('redis.failure', e);
        throw new Unavailable();
    }
    finally {
        clearTimeout(timer!);
    } }
    async available() { try {
        if (!this.redis.isOpen) {
            this.connecting ??= this.redis.connect().finally(() => { this.connecting = undefined; });
        }
        // isOpen turns true before Redis handshake completes. Every concurrent
        // first request must await the same connection, then perform a live PING.
        if (this.connecting) await span('redis.connect', () => this.timed(this.connecting!));
        if (!this.redis.isReady) { recordError('redis.ready', {name:'Error',code:'REDIS_NOT_READY'}); throw new Unavailable(); }
        await span('redis.ping', () => this.timed(this.redis.ping()));
    }
    catch (e) {
        recordError('redis.failure', e);
        throw new Unavailable();
    } }
    async get(key: string, cold = false) { if (cold) {
        this.l1.delete(key);
        await span('redis.del', () => this.timed(this.redis.del(key)));
        return { value: null, hit: 'cold' };
    } const local = this.l1.get(key); if (local)
        return { value: local, hit: 'L1' }; const value = await span('redis.get', () => this.timed(this.redis.get(key))); if (value)
        this.l1.set(key, value); return { value, hit: value ? 'L2' : 'cold' }; }
    async set(key: string, value: string) { await span('redis.set', () => this.timed(this.redis.set(key, value, { EX: 120 }))); if (this.l1.size > 500)
        this.l1.clear(); this.l1.set(key, value); }
    async close() { if (this.redis.isOpen)
        this.redis.destroy(); }
}

instrumentMethods(SessionCache.prototype, ['available','get','set'], 'cache');
