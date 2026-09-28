// Connectivity check: prints server version, extensions and schemas. Never prints credentials.
// Usage: node scripts/db-check.js
const db = require('./db');
(async () => {
  const t = Date.now();
  const v = await db.query('select version() as v, current_user as u, current_database() as d');
  console.log(`Connected as ${v.rows[0].u} to ${v.rows[0].d} in ${Date.now() - t} ms`);
  console.log(`Server: ${v.rows[0].v.split(' on ')[0]}`);
  const ext = await db.query(`select extname, extversion from pg_extension order by 1`);
  console.log('Extensions:', ext.rows.map(r => `${r.extname} ${r.extversion}`).join(', '));
  const sch = await db.query(`select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by 1`);
  console.log('Schemas:', sch.rows.map(r => r.nspname).join(', '));
  const priv = await db.query(`select has_database_privilege(current_user, current_database(), 'CREATE') as can_create, rolsuper as superuser from pg_roles where rolname = current_user`);
  console.log(`Privileges: create-in-database=${priv.rows[0].can_create}, superuser=${priv.rows[0].superuser}`);
  await db.close();
})().catch(async e => { console.error('FAILED:', e.message); await db.close().catch(() => {}); process.exit(1); });
