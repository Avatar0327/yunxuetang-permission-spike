import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../src/infrastructure/db.js';
import { captureNativeFactAccess, planNodes } from '../scripts/native-fact-access.js';

// Isolated diagnostic, not benchmark preparation. Run baseline and candidate with
// this same visibility maintenance; full reference windows keep seed's ANALYZE only.
// The standalone capture script never vacuums and can record fresh-seed behavior.
test('native: actual covering fact access preserves independent count/group/points truth', async () => {
    const start = performance.now();
    await pool.query('VACUUM (ANALYZE) report.learning_fact');
    const maintenanceMs = performance.now() - start;
    const evidence = await captureNativeFactAccess();
    const output = process.env.OUTPUT ?? `evidence/raw/native-candidate1/focused-${Date.now()}`;
    await mkdir(output, { recursive: true });
    await writeFile(`${output}/fact-access.json`, JSON.stringify({ ...evidence,
        maintenance: { sql: 'VACUUM (ANALYZE) report.learning_fact', maintenanceMs,
            purpose: 'paired controlled-visibility diagnostic only; not reference-window preparation' }
    }, null, 2));
    assert.equal(evidence.scenarios.length, 4);
    for (const scenario of evidence.scenarios) {
        assert.equal(scenario.queries.length, scenario.name.startsWith('history') ? 1 : 2, scenario.name);
        assert.equal(scenario.resultDigest, scenario.expectedDigest, `${scenario.name}: complete independent result truth`);
    }
    const constrained = evidence.scenarios.find(s => s.name === 'history-constrained')!;
    const factAccess = constrained.queries.flatMap(q => planNodes(q.plan)).filter(n => n['Relation Name'] === 'learning_fact');
    assert.ok(factAccess.length > 0, 'actual constrained aggregate must access learning_fact');
    assert.ok(factAccess.every(n => n['Node Type'] === 'Index Only Scan'),
        `expected covering fact access, observed ${factAccess.map(n => n['Node Type']).join(', ')}`);
    assert.ok(factAccess.every(n => n['Heap Fetches'] === 0),
        `expected no fact heap fetches in recorded visibility state: ${JSON.stringify(factAccess)}`);
});
test.after(() => pool.end());
