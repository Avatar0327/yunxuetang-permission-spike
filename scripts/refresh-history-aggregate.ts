import { pool } from '../src/infrastructure/db.js';
import { refreshHistoryAggregate } from '../src/report/history-aggregate.js';
/** Round 2 T-1 refresh entry point; production schedules this once per day after the day closes. */
try {
    const tenants = process.argv.slice(2).length ? process.argv.slice(2) : (await pool.query('SELECT tenant_id FROM report.export_epoch ORDER BY tenant_id')).rows.map(r => r.tenant_id as string);
    for (const tenant of tenants) console.log(JSON.stringify(await refreshHistoryAggregate(tenant)));
    await pool.query('ANALYZE report.history_agg_unit, report.history_agg_size, report.history_agg_cell, report.history_agg_person');
}
finally {
    await pool.end();
}
