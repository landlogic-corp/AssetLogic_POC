// Shared database connection for scripts and Netlify Functions.
//
// Reads DATABASE_URL from the environment (Netlify) or from .env.local (local), opens a small
// connection pool over TLS with full certificate verification, and exposes query() and close().
// Nothing here ever logs a credential.
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

let pool;
async function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  // Strip any sslmode from the URL and enforce full certificate verification ourselves.
  const url = new URL(process.env.DATABASE_URL); url.searchParams.delete('sslmode'); url.searchParams.delete('uselibpqcompat');
  pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000 });
  return pool;
}
async function query(text, params) { const p = await getPool(); return p.query(text, params); }
async function close() { if (pool) await pool.end(); pool = null; }
const describe = () => process.env.DATABASE_URL ? 'DATABASE_URL (' + new URL(process.env.DATABASE_URL).hostname.split('.').slice(-3).join('.') + ')' : 'not configured';

module.exports = { getPool, query, close, describe };
