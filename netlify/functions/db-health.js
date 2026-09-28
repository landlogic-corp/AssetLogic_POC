// GET /.netlify/functions/db-health
// Confirms the site can reach the database. Returns only server version, extension names, schema
// names and timing. No credentials, no data.
const db = require('../../scripts/db');

exports.handler = async () => {
  const started = Date.now();
  try {
    const v = await db.query('select version() as version, current_user as db_user, current_database() as db');
    const ext = await db.query('select extname from pg_extension order by 1');
    const sch = await db.query(`select nspname from pg_namespace where nspname in ('ref','gis','app') order by 1`);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({
        ok: true,
        ms: Date.now() - started,
        server: v.rows[0].version.split(' on ')[0],
        database: v.rows[0].db,
        user: v.rows[0].db_user,
        extensions: ext.rows.map(r => r.extname),
        schemas: sch.rows.map(r => r.nspname),
        schemaCreated: sch.rows.length === 3,
      }),
    };
  } catch (e) {
    return { statusCode: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify({ ok: false, ms: Date.now() - started, error: String(e.message || e).replace(/password[^ ]*/gi, '[redacted]') }) };
  }
};
