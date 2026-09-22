import { createWriteStream } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
const scenario = process.env.SCENARIO ?? 'list-broad', phase = process.env.PHASE ?? 'success', candidate = process.env.CANDIDATE ?? 'native', cache = process.env.CACHE_MODE ?? 'hot';
const definitions: Record<string, {
    path: string;
    actor: string;
    count: number;
    history: boolean;
}> = {
    'list-broad': { path: '/report?limit=50', actor: 'M', count: 49998, history: false },
    'list-constrained': { path: '/report?node=department-report&limit=50', actor: 'M', count: 3, history: false },
    'history-broad': { path: '/history', actor: 'M', count: 1000002, history: true },
    'history-constrained': { path: '/history', actor: 'X', count: 1, history: true }
};
const selected = definitions[scenario];
if (!selected)
    throw Error('unknown SCENARIO');
const def = selected;
const concurrency = Number(process.env.CONCURRENCY ?? 50), seconds = Number(process.env.DURATION_SECONDS ?? 600);
if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isFinite(seconds) || seconds <= 0)
    throw Error('invalid run parameters');
const urls = [process.env.API_A ?? 'http://127.0.0.1:4311', process.env.API_B ?? 'http://127.0.0.1:4312'];
const output = process.env.OUTPUT ?? `evidence/raw/benchmark-${candidate}-${cache}-${scenario}-${phase}-${Date.now()}`;
await mkdir(output, { recursive: true });
const gzip = createGzip();
gzip.setMaxListeners(concurrency + 10);
const saving = pipeline(gzip, createWriteStream(output + '/samples.jsonl.gz'));
const hist: Record<string, number[]> = { success: [], denial: [], failure: [], authorization_error: [], permission: [], data: [] };
const queries: Record<string, number> = {}, instances: Record<string, number> = {}, hits: Record<string, number> = {};
if (cache === 'hot' && phase === 'success') {
    const prewarm = [];
    for (const url of urls) {
        const response = await fetch(url + def.path, { headers: { authorization: 'Bearer spike-' + def.actor } });
        const body = await response.json() as any;
        prewarm.push({ url, status: response.status, evidence: body.evidence, meta: body.meta });
        if (response.status !== 200)
            throw Error('prewarm failed');
    }
    await writeFile(output + '/prewarm.json', JSON.stringify(prewarm, null, 2));
}
const startAt = new Date().toISOString(), start = performance.now(), deadline = start + seconds * 1000;
let total = 0;
async function client(clientId: number) {
    while (performance.now() < deadline) {
        const index = (clientId + total) % 2, at = new Date().toISOString(), t = performance.now();
        let sample: any = { clientId, instanceUrl: urls[index], candidate, configuredCache: cache, scenario, phase, requestAt: at };
        try {
            const res = await fetch(urls[index] + def.path, { headers: { authorization: 'Bearer spike-' + (phase === 'denial' ? 'L' : def.actor) }, signal: AbortSignal.timeout(20000) });
            const body = await res.json() as any;
            sample = { ...sample, status: res.status, elapsedMs: performance.now() - t, permissionMs: body.evidence?.permissionMs, dataMs: body.evidence?.dataMs, cache: body.evidence?.cache, revision: body.evidence?.revision, sourceIds: body.evidence?.sourceIds, queryCount: body.meta?.queryCount, instance: body.meta?.instance };
            let classification = res.status === 200 ? 'success' : res.status === 403 ? 'denial' : 'failure';
            if (res.status === 200) {
                const expectedRows = def.history ? undefined : Math.min(50, def.count);
                const incorrect = phase !== 'success' || body.meta?.candidate !== candidate || body.count !== def.count || !Array.isArray(body.rows) || (expectedRows !== undefined && body.rows.length !== expectedRows) || (!def.history && body.rows.some((r: any) => !['A', 'C', 'M'].includes(r.id) && [r.phone, r.email, r.id_card].some(v => v !== null)));
                if (incorrect) {
                    classification = 'authorization_error';
                    sample.correctness = { expectedCount: def.count, actualCount: body.count, actualRows: body.rows?.length, expectedCandidate: candidate };
                }
                if (cache === 'cold' && body.evidence?.cache !== 'cold') {
                    classification = 'authorization_error';
                    sample.cacheMismatch = true;
                }
            }
            sample.classification = classification;
            hist[classification]!.push(sample.elapsedMs);
            if (classification === 'success') {
                hist.permission!.push(sample.permissionMs);
                hist.data!.push(sample.dataMs);
            }
            queries[String(sample.queryCount)] = (queries[String(sample.queryCount)] ?? 0) + 1;
            instances[sample.instance] = (instances[sample.instance] ?? 0) + 1;
            hits[sample.cache ?? 'none'] = (hits[sample.cache ?? 'none'] ?? 0) + 1;
        }
        catch (e) {
            sample = { ...sample, classification: 'failure', elapsedMs: performance.now() - t, error: e instanceof Error ? e.name : 'unknown' };
            hist.failure!.push(sample.elapsedMs);
        }
        total++;
        if (!gzip.write(JSON.stringify(sample) + '\n'))
            await once(gzip, 'drain');
    }
}
await Promise.all(Array.from({ length: concurrency }, (_, i) => client(i)));
gzip.end();
await saving;
const summary: Record<string, unknown> = { startAt, endAt: new Date().toISOString(), durationMs: performance.now() - start, configuredSeconds: seconds, concurrency, total, candidate, cache, scenario, phase, urls, pageSize: 50, queryCounts: queries, instances, cacheHits: hits, referenceWindow: seconds === 600 && concurrency === 50, samplingRatio: 1 };
for (const [key, values] of Object.entries(hist)) {
    values.sort((a, b) => a - b);
    const q = (p: number) => values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null;
    summary[key] = { count: values.length, p50: q(.5), p95: q(.95), p99: q(.99) };
}
await writeFile(output + '/summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (hist.authorization_error!.length || phase === 'success' && (hist.denial!.length || hist.failure!.length))
    process.exitCode = 1;
