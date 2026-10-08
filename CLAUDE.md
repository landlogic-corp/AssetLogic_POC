# AssetLogic: working rules

Read `docs/README.md` for the documentation index. The rules below are the ones that must not be
missed.

## Source of truth
- Edit `asset-monitor.html` for the UI. `index.html` is generated from it, is git-ignored, and must
  never be edited by hand.
- Server logic lives in `netlify/functions/`; the only database connection code is `scripts/db.js`.
- The page must keep working without its back end (sample data) and without a map token (drawn map).

## Code review before anything reaches GitHub
The user reviews every change before it is pushed. After editing, rebuild `index.html`
(`node scripts/build-index.js`), check the page locally (`npm run dev`, http://localhost:8765), and
describe the change to the user. Do not commit or push until the user confirms. Never run the publish
script on your own initiative.

## Publishing (only after the user confirms)

```bash
node scripts/publish.js "Describe the change"
```

This rebuilds `index.html`, commits, pushes to `origin/main`, then waits until the Netlify site serves
that exact commit. It prints `LIVE` on success and exits with code 2 if the site has not updated in
time. Report that result to the user as it is. After publishing, verify on the live site.

`node scripts/publish.js --check` shows what the live site is serving without publishing.

- The live URL is in `deploy.config.json`. Update it if the Netlify site name changes.
- End commit messages with the Co-Authored-By trailer when Claude writes the commit.
- `origin` has the GitHub username in its URL because two accounts are stored on this machine; keep
  it or pushes will try to prompt and fail.

## Secrets and data
- The GitHub repo is PUBLIC. Never commit tokens, keys, passwords, `.env` files, service-account JSON,
  or data drops (parcel GeoJSON etc.). They live in `.env.local`, in the `.assetlogic` folder under the
  user's home directory, and in Netlify environment variables. `.gitignore` already blocks them; keep
  it that way and treat any change to it as security-relevant.
- Never print a token, key or password in chat or in tool output. Redact when inspecting env files.
- Before staging, check `git status --short` and scan the staged diff for secrets (see
  `docs/security.md`).
- Database access from the site goes through Netlify Functions only; the browser never holds
  database credentials.

## Public versus internal documentation
- `docs/*.md` is public. It explains how the system works. It must not contain table or column
  definitions, instance or project names, account identifiers, service-account addresses, database
  user names, or provisioning steps.
- `docs/internal/` is git-ignored: the ERD and data dictionary, the infrastructure map, the full
  schema (`schema.sql`, read by `scripts/db-migrate.js`), the provisioning guide and the source-data
  mapping. Put that kind of detail there and refer to it from the public docs by name only.
- When behaviour changes, update the matching doc (the table in `docs/contributing.md` says which)
  and `docs/release-notes.md`.

## Database work
- The database is Neon (serverless PostgreSQL + PostGIS, free plan). The only connection setting is
  `DATABASE_URL` in `.env.local` locally and in Netlify environment variables.
- Run scripts with `node --use-system-ca` (the npm scripts already do).
- Schema changes go into `docs/internal/schema.sql` and are applied to the database; keep both in step.
- Importers must be streaming, batched, keyed on (source, source record id), and must log a run.

## Look and feel
- Match the LandLogic platform: sidebar, light grey map, white right panel, dark green headings.
- Addresses are always "street, municipality, province".
- Text must never overflow its container. Let values wrap; avoid no-wrap chips in narrow boxes.
- If a fact is not available, say so. Never invent a value. Label illustrative data.
