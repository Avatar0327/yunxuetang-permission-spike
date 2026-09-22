import { appendFile, mkdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
export const dir = process.env.EVIDENCE_DIR ?? 'evidence/raw/task2';
await mkdir(dir, { recursive: true });
export async function evidence(name: string, value: unknown) { await appendFile(`${dir}/${name}.jsonl`, JSON.stringify(value) + '\n'); }
export async function check(id: string, actual: unknown, expected: unknown, context: Record<string, unknown> = {}) { const pass = isDeepStrictEqual(actual, expected); await evidence('functional', { id, expected, actual, status: pass ? 'pass' : 'fail', at: new Date().toISOString(), ...context }); if (!pass)
    throw Error(`${id}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`); }
export const bases = [process.env.API_A ?? 'http://127.0.0.1:4311', process.env.API_B ?? 'http://127.0.0.1:4312'];
export async function request(path: string, actor = 'M', body?: unknown, instance = 0) { const requestedAt = new Date().toISOString(); const r = await fetch(bases[instance] + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer spike-' + actor, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) }); const payload = await r.json() as any; return { status: r.status, payload, requestedAt, completedAt: new Date().toISOString() }; }
