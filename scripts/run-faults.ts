import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from 'redis';
import { request, evidence, check } from './evidence.js';
const exec = promisify(execFile);
const docker = async (...args: string[]) => exec('docker', ['--context', 'colima-yxt-permission', ...args]);
async function probe(name: string, expected: number, path = '/projects/P/media/1') { const r = await request(path, 'L', undefined, 1); await evidence('faults', { name, ...r }); await check(name, [r.status, r.payload.fragment ?? null], [expected, expected === 200 ? 'synthetic-media-segment' : null], { timeline: r }); }
async function recovery() { for (let n = 0; n < 30; n++) {
    try {
        const r = await request('/auth/me', 'Z');
        if (r.status === 200)
            return;
    }
    catch { }
    await new Promise(r => setTimeout(r, 300));
} throw Error('recovery failed'); }
await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: true });
await probe('B-warm', 200);
await probe('B-L1-warm', 200);
const revoke = await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: false });
await evidence('faults', { name: 'A-revoke-commit-response', ...revoke });
await probe('B-next-request-after-revoke', 403);
await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: true });
await probe('B-regrant', 200);
try {
    await docker('stop', '--time', '1', 'yxt-redis');
    await probe('redis-disconnect-warm', 503);
}
finally {
    await docker('start', 'yxt-redis');
    await recovery();
}
await probe('redis-recovery', 200);
const redis = createClient({ socket: { host: process.env.REDIS_HOST ?? '127.0.0.1', port: Number(process.env.REDIS_PORT ?? 56379) } });
redis.on('error', () => { });
await redis.connect();
await redis.sendCommand(['CLIENT', 'PAUSE', '1000', 'ALL']);
await probe('redis-timeout-warm', 503);
redis.destroy();
await recovery();
await probe('redis-timeout-recovery', 200);
try {
    await docker('stop', '--time', '1', 'yxt-pg');
    await probe('db-authority-failure', 503);
}
finally {
    await docker('start', 'yxt-pg');
    await recovery();
}
await probe('db-recovery', 200);
await request('/appointments', 'Z', { personId: 'L', projectId: 'P', active: false });
console.log('focused real faults passed; cold fault and export stage fault coverage remains incomplete');
