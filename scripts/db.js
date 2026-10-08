// Shared database connection for scripts and Netlify Functions.
//
// Reads configuration from the environment (Netlify) or .env.local (local). Nothing here ever logs
// a credential.
//
// Preferred: DATABASE_URL   a PostgreSQL connection string (TLS enforced). This is how the Neon
//                           database is reached.
// Legacy:    DB_INSTANCE + DB_NAME + DB_USER + DB_PASSWORD + GCP_SA_KEY / GCP_SA_KEY_FILE
//                           the Google Cloud SQL connector path, kept only until that instance is
//                           deleted. Remove together with the @google-cloud/cloud-sql-connector
//                           dependency.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnv() {
  const p = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('='); const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

function required(name) { const v = process.env[name]; if (!v) throw new Error(`${name} is not set`); return v; }

let pool, connector;
async function getPool() {
  if (pool) return pool;
  const common = { max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000 };
  if (process.env.DATABASE_URL) {
    // Strip any sslmode from the URL and enforce full certificate verification ourselves.
    const url = new URL(process.env.DATABASE_URL); url.searchParams.delete('sslmode'); url.searchParams.delete('uselibpqcompat');
    pool = new Pool({ ...common, connectionString: url.toString(), ssl: { rejectUnauthorized: true } });
    return pool;
  }
  // Legacy Cloud SQL path
  const { Connector } = require('@google-cloud/cloud-sql-connector');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (process.env.GCP_SA_KEY_FILE) process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GCP_SA_KEY_FILE;
    else if (process.env.GCP_SA_KEY) { const tmp = path.join(require('os').tmpdir(), 'assetlogic-sa.json'); if (!fs.existsSync(tmp)) fs.writeFileSync(tmp, process.env.GCP_SA_KEY, { mode: 0o600 }); process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp; }
    else throw new Error('No database configuration: set DATABASE_URL');
  }
  connector = new Connector();
  const clientOpts = await connector.getOptions({ instanceConnectionName: required('DB_INSTANCE'), ipType: 'PUBLIC' });
  pool = new Pool({ ...clientOpts, ...common, database: required('DB_NAME'), user: required('DB_USER'), password: required('DB_PASSWORD') });
  return pool;
}
async function query(text, params) { const p = await getPool(); return p.query(text, params); }
async function close() { if (pool) await pool.end(); if (connector) connector.close(); pool = connector = null; }
const describe = () => process.env.DATABASE_URL ? 'DATABASE_URL (' + new URL(process.env.DATABASE_URL).hostname.split('.').slice(-3).join('.') + ')' : 'Cloud SQL connector';

module.exports = { getPool, query, close, describe };
