// Builds index.html (the page Netlify serves) from asset-monitor.html (the editable source).
// asset-monitor.html has no <!DOCTYPE>/<html>/<head> wrapper because it is also published as a
// claude.ai artifact, which adds its own. This script adds the wrapper for normal hosting.
//
// It also stamps the page with the commit it was built from (<meta name="build">). Netlify sets
// COMMIT_REF during its builds, so the live page says exactly which commit it is serving.
// scripts/publish.js reads that stamp to confirm a push has gone live.
//
// Usage: node scripts/build-index.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'asset-monitor.html'), 'utf8');

const marker = '</style>';
const cut = src.indexOf(marker);
if (cut < 0) throw new Error('Could not find the end of the <style> block in asset-monitor.html');

const head = src.slice(0, cut + marker.length);
const body = src.slice(cut + marker.length).replace(/^\s*\n/, '');
const build = process.env.COMMIT_REF || 'local';

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="build" content="${build}">
${head}
</head>
<body>
${body}</body>
</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`index.html written (${out.length.toLocaleString()} bytes, build ${build})`);
