// One-step publish: rebuild index.html, commit, push to GitHub, then wait until Netlify serves it.
//
// Usage:
//   node scripts/publish.js "Describe the change"
//   node scripts/publish.js --check          (no commit; just report what the live site is serving)
//
// The live URL and branch come from deploy.config.json.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'deploy.config.json'), 'utf8'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function liveBuild() {
  const res = await fetch(`${cfg.siteUrl}/?cb=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) return { status: res.status, build: null };
  const html = await res.text();
  const m = html.match(/<meta name="build" content="([^"]*)"/);
  return { status: res.status, build: m ? m[1] : null };
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--check') {
    const live = await liveBuild();
    const head = git('rev-parse', 'HEAD');
    console.log(`Live site : ${cfg.siteUrl} (HTTP ${live.status})`);
    console.log(`Serving   : ${live.build || 'no build stamp (deployed before stamping, or by manual upload)'}`);
    console.log(`Local HEAD: ${head}`);
    console.log(live.build === head ? 'Live site matches the latest commit.' : 'Live site does NOT match the latest commit.');
    return;
  }

  const message = args.join(' ').trim();
  if (!message) { console.error('Give a commit message: node scripts/publish.js "Describe the change"'); process.exit(1); }

  // 1. Rebuild index.html from the source. COMMIT_REF is cleared so the committed copy always says "local".
  execFileSync('node', [path.join('scripts', 'build-index.js')], { cwd: root, stdio: 'inherit', env: { ...process.env, COMMIT_REF: '' } });

  // 2. Commit if anything changed.
  git('add', '-A');
  const staged = git('diff', '--cached', '--name-only');
  if (staged) {
    git('commit', '-q', '-m', message);
    console.log(`Committed: ${staged.split('\n').join(', ')}`);
  } else {
    console.log('Nothing new to commit.');
  }

  // 3. Push.
  git('push', cfg.remote, cfg.branch);
  const head = git('rev-parse', 'HEAD');
  console.log(`Pushed ${head.slice(0, 7)} to ${cfg.remote}/${cfg.branch}`);

  // 4. Wait for Netlify to build and serve this commit.
  const deadline = Date.now() + cfg.waitMinutes * 60000;
  process.stdout.write('Waiting for Netlify');
  while (Date.now() < deadline) {
    const live = await liveBuild().catch(() => ({ build: null }));
    if (live.build === head) { console.log(`\nLIVE: ${cfg.siteUrl} is serving ${head.slice(0, 7)}.`); return; }
    process.stdout.write('.');
    await sleep(8000);
  }
  const live = await liveBuild().catch(() => ({ build: null, status: 'unreachable' }));
  console.log(`\nNOT LIVE after ${cfg.waitMinutes} min. The site is serving: ${live.build || 'no build stamp'}.`);
  console.log('Check that the Netlify project is linked to this repository, and look at its Deploys page for a failed build.');
  process.exit(2);
})().catch(e => { console.error(e.message || e); process.exit(1); });
