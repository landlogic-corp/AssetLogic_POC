// Minimal local web server for the prototype. Serves the static page and runs the Netlify Functions
// in-process at /.netlify/functions/<name>, the same paths the deployed site uses.
// Mapbox tokens are restricted to http://localhost and the Netlify URL, so the page must be served from
// localhost rather than opened as a file.
//
// Usage: node --use-system-ca scripts/dev-server.js   (then open http://localhost:8765)
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 8765;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.geojson': 'application/geo+json' };
process.env.URL = process.env.URL || `http://localhost:${port}`;

async function runFunction(name, req, res) {
  const file = path.join(root, 'netlify', 'functions', name + '.js');
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end('No such function'); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const url = new URL(req.url, process.env.URL);
  const event = { httpMethod: req.method, path: url.pathname, queryStringParameters: Object.fromEntries(url.searchParams), headers: req.headers, body: Buffer.concat(chunks).toString('utf8') || null };
  try {
    const t = Date.now();
    const out = await require(file).handler(event, {});
    res.writeHead(out.statusCode || 200, out.headers || { 'content-type': 'application/json' });
    res.end(out.body || '');
    console.log(`${req.method} /.netlify/functions/${name}${url.search} → ${out.statusCode} (${Date.now() - t} ms)`);
  } catch (e) { console.error('function error', name, e.message); res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'function crashed' })); }
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const fn = urlPath.match(/^\/\.netlify\/functions\/([^/]+)\/?$/);
  if (fn) return runFunction(fn[1], req, res);
  let file = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root) || file.includes('.env') || /[\\/](parcels|node_modules|\.git|scripts|netlify)[\\/]/.test(file)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`Prototype at http://localhost:${port}`));
