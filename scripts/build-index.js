// Builds index.html (the page Netlify serves) from asset-monitor.html (the editable source).
// asset-monitor.html has no <!DOCTYPE>/<html>/<head> wrapper because it is also published as a
// claude.ai artifact, which adds its own. This script adds the wrapper for normal hosting.
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

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${head}
</head>
<body>
${body}</body>
</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`index.html written (${out.length.toLocaleString()} bytes)`);
