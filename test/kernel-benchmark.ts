import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { NativeCandidate, CasbinCandidate } from '../src/authz/candidates.js';
import { normalizePolicy } from '../src/authz/policy.js';
import { ctx, nodes, org, membership, learning } from './fixtures.js';
const require = createRequire(import.meta.url);
const grants = normalizePolicy({ context: ctx, nodes, memberships: [membership('bench', { kind: 'ownDept' })] });
const request = { context: ctx, nodes, grants, nodeId: 'personal-learning', action: 'report.personal-learning.view', resource: learning('A'), organization: org };
const output = { kind: 'object-match microbenchmark; includes Casbin enforcer/model construction; NOT HTTP/SQL evidence', timestamp: new Date().toISOString(), node: process.version, casbin: require('casbin/package.json').version, typescript: require('typescript/package.json').version, platform: process.platform, arch: process.arch, iterations: 200, results: [] as unknown[] };
for (const engine of [new NativeCandidate(), new CasbinCandidate()]) {
    const samples: number[] = [];
    for (let i = 0; i < 20; i++)
        await engine.match(request);
    for (let i = 0; i < 200; i++) {
        const t = performance.now();
        const r = await engine.match(request);
        samples.push(performance.now() - t);
        if (!r.allowed || r.sourceIds[0] !== 'role:bench:personal-learning:report.personal-learning.view')
            throw new Error('benchmark correctness mismatch');
    }
    samples.sort((a, b) => a - b);
    output.results.push({ candidate: engine.name, count: samples.length, p50_ms: samples[99], p95_ms: samples[189], p99_ms: samples[197], min_ms: samples[0], max_ms: samples[199] });
}
console.log(JSON.stringify(output, null, 2));
