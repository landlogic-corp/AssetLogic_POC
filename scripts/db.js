// Shared database connection for scripts and Netlify Functions.
//
// Reads configuration from the environment (Netlify) or .env.local (local). Connects to Cloud SQL
// through Google's Cloud SQL connector: IAM-authorised, TLS, no IP allow-list. Nothing here ever
// logs a credential.
//
//   DB_INSTANCE   project:region:instance
//   DB_NAME, DB_USER, DB_PASSWORD
//   GCP_SA_KEY      service-account key JSON (Netlify)      or
//   GCP_SA_KEY_FILE path to the key file                     (local)
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { Connector } = require('@google-cloud/cloud-sql-connector');

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

// The connector reads the key through GOOGLE_APPLICATION_CREDENTIALS (a path). On Netlify the key
// arrives as JSON text, so write it to a temp file the function can read.
function ensureCredentialsFile() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  if (process.env.GCP_SA_KEY_FILE) { process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GCP_SA_KEY_FILE; return; }
  if (process.env.GCP_SA_KEY) {
    const tmp = path.join(require('os').tmpdir(), 'assetlogic-sa.json');
    if (!fs.existsSync(tmp)) fs.writeFileSync(tmp, process.env.GCP_SA_KEY, { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmp; return;
  }
  throw new Error('No service-account key: set GCP_SA_KEY (JSON) or GCP_SA_KEY_FILE (path)');
}

let pool, connector;
async function getPool() {
  if (pool) return pool;
  ensureCredentialsFile();
  connector = new Connector();
  const clientOpts = await connector.getOptions({ instanceConnectionName: required('DB_INSTANCE'), ipType: 'PUBLIC' });
  pool = new Pool({ ...clientOpts, database: required('DB_NAME'), user: required('DB_USER'), password: required('DB_PASSWORD'), max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000 });
  return pool;
}
async function query(text, params) { const p = await getPool(); return p.query(text, params); }
async function close() { if (pool) await pool.end(); if (connector) connector.close(); pool = connector = null; }

module.exports = { getPool, query, close };
