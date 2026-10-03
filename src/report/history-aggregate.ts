import { pool } from '../infrastructure/db.js';

/**
 * Round 2 T-1 refresh (DIFF-05). Rebuilds the historical aggregate projection of one
 * tenant from a single REPEATABLE READ snapshot and switches the current batch at commit.
 * Only eligible facts (enabled, not deleted) at the snapshot are included; nothing about
 * authorization is stored here. This is an offline batch job, not an API request path, so
 * it carries its own statement budget instead of the API's 10 second limit.
 */
export async function refreshHistoryAggregate(tenantId: string) {
    const db = await pool.connect();
    try {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        await db.query("SET LOCAL statement_timeout = '300s'");
        const batch = (await db.query("SELECT nextval('report.history_agg_batch_seq')::bigint AS id, now() AS as_of")).rows[0];
        const t = [tenantId, batch.id];
        await db.query('INSERT INTO report.history_agg_batch(tenant_id,batch_id,as_of) VALUES($1,$2,$3)', [...t, batch.as_of]);
        await db.query(`INSERT INTO report.history_agg_unit(tenant_id,batch_id,person_id,data_company_id,fixture,cell)
            SELECT $1,$2,f.person_id,f.data_company_id,f.fixture,coalesce(p.department_id,'')
            FROM (SELECT DISTINCT person_id,data_company_id,fixture FROM report.learning_fact WHERE tenant_id=$1 AND enabled=true AND deleted=false) f
            LEFT JOIN report.person_projection p ON p.tenant_id=$1 AND p.person_id=f.person_id`, t);
        await db.query(`INSERT INTO report.history_agg_person(tenant_id,batch_id,person_id,data_company_id,fixture,historical_department_id,historical_job_id,historical_status,count,points)
            SELECT $1,$2,person_id,data_company_id,fixture,historical_department_id,historical_job_id,historical_status,count(*)::int,sum(points)::bigint
            FROM report.learning_fact WHERE tenant_id=$1 AND enabled=true AND deleted=false
            GROUP BY person_id,data_company_id,fixture,historical_department_id,historical_job_id,historical_status`, t);
        await db.query(`INSERT INTO report.history_agg_cell(tenant_id,batch_id,level,cell,data_company_id,fixture,historical_department_id,historical_job_id,historical_status,count,points)
            SELECT $1,$2,1,u.cell,a.data_company_id,a.fixture,a.historical_department_id,a.historical_job_id,a.historical_status,sum(a.count)::int,sum(a.points)::bigint
            FROM report.history_agg_person a JOIN report.history_agg_unit u ON u.tenant_id=a.tenant_id AND u.batch_id=a.batch_id AND u.person_id=a.person_id AND u.data_company_id=a.data_company_id AND u.fixture=a.fixture
            WHERE a.tenant_id=$1 AND a.batch_id=$2
            GROUP BY u.cell,a.data_company_id,a.fixture,a.historical_department_id,a.historical_job_id,a.historical_status`, t);
        await db.query(`INSERT INTO report.history_agg_cell(tenant_id,batch_id,level,cell,data_company_id,fixture,historical_department_id,historical_job_id,historical_status,count,points)
            SELECT $1,$2,0,'*',data_company_id,fixture,historical_department_id,historical_job_id,historical_status,sum(count)::int,sum(points)::bigint
            FROM report.history_agg_cell WHERE tenant_id=$1 AND batch_id=$2 AND level=1
            GROUP BY data_company_id,fixture,historical_department_id,historical_job_id,historical_status`, t);
        await db.query(`INSERT INTO report.history_agg_size(tenant_id,batch_id,level,cell,data_company_id,fixture,units)
            SELECT $1,$2,0,'*',data_company_id,fixture,count(*)::int FROM report.history_agg_unit WHERE tenant_id=$1 AND batch_id=$2 GROUP BY data_company_id,fixture
            UNION ALL
            SELECT $1,$2,1,cell,data_company_id,fixture,count(*)::int FROM report.history_agg_unit WHERE tenant_id=$1 AND batch_id=$2 GROUP BY cell,data_company_id,fixture`, t);
        await db.query(`INSERT INTO report.history_agg_current(tenant_id,batch_id) VALUES($1,$2)
            ON CONFLICT(tenant_id) DO UPDATE SET batch_id=EXCLUDED.batch_id`, t);
        for (const table of ['history_agg_unit', 'history_agg_size', 'history_agg_cell', 'history_agg_person'])
            await db.query(`DELETE FROM report.${table} WHERE tenant_id=$1 AND batch_id<>$2`, t);
        await db.query('DELETE FROM report.history_agg_batch WHERE tenant_id=$1 AND batch_id<>$2', t);
        await db.query('COMMIT');
        return { tenantId, batchId: String(batch.id), asOf: (batch.as_of as Date).toISOString() };
    }
    catch (e) {
        await db.query('ROLLBACK');
        throw e;
    }
    finally {
        db.release();
    }
}
