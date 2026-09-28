// Builds index.html (the page Netlify serves) from asset-monitor.html (the editable source).
// asset-monitor.html has no <!DOCTYPE>/<html>/<head> wrapper because it is also published as a
// claude.ai artifact, which adds its own. This script adds the wrapper for normal hosting.
//
// It stamps three things into the <head>:
//   <meta name="build">         the commit Netlify built from (COMMIT_REF), or "local"
//   <meta name="mapbox-token">  MAPBOX_TOKEN  (Netlify environment variable, or .env.local locally)
//   <meta name="mapbox-style">  MAPBOX_STYLE  (same)
// index.html is generated, git-ignored, and rebuilt by Netlify on every deploy, so the token never
// lands in the repository. It is a public Mapbox token restricted to the site's URLs.
//
// Usage: node scripts/build-index.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function loadEnvFile() {
  const p = path.join(root, '.env.local');
  if (!fs.existsSync(p)) return {};
  return Object.fromEntries(fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
const env = { ...loadEnvFile(), ...process.env }; // real environment (Netlify) wins over .env.local
const attr = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const src = fs.readFileSync(path.join(root, 'asset-monitor.html'), 'utf8');
const marker = '</style>';
const cut = src.indexOf(marker);
if (cut < 0) throw new Error('Could not find the end of the <style> block in asset-monitor.html');

const head = src.slice(0, cut + marker.length);
const body = src.slice(cut + marker.length).replace(/^\s*\n/, '');
const build = env.COMMIT_REF || 'local';
const token = env.MAPBOX_TOKEN || '';
const style = env.MAPBOX_STYLE || '';

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="build" content="${build}">
<meta name="mapbox-token" content="${attr(token)}">
<meta name="mapbox-style" content="${attr(style)}">
${head}
</head>
<body>
${body}</body>
</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`index.html written (${out.length.toLocaleString()} bytes, build ${build}, mapbox ${token ? 'on' : 'off'}${style ? ', custom style' : ''})`);
