# AssetLogic prototype: working rules

## Source of truth
- Edit `asset-monitor.html` only. `index.html` is generated from it; never edit `index.html` by hand.
- The page is one self-contained file (HTML, CSS, JavaScript). All data in it is example data.

## Code review before anything reaches GitHub
The user reviews every change before it is pushed. After editing, rebuild `index.html`
(`node scripts/build-index.js`), check the page locally, and describe the change to the user.
Do not commit or push until the user confirms. Never run the publish script on your own initiative.

## Publishing (only after the user confirms)

```bash
node scripts/publish.js "Describe the change"
```

This rebuilds `index.html`, commits, pushes to `origin/main` (github.com/landlogic-corp/AssetLogic_POC),
then waits until the Netlify site serves that exact commit. It prints `LIVE` on success and exits with
code 2 if the site has not updated in time. Report that result to the user as it is.

To see what the live site is serving without publishing:

```bash
node scripts/publish.js --check
```

- The live URL is in `deploy.config.json`. Update it if the Netlify site name changes.
- End commit messages with the Co-Authored-By trailer when Claude writes the commit.
- `origin` is pinned to the SorooshLLG login. Two GitHub accounts are stored on this machine, so keep the
  username in the remote URL or pushes will try to prompt and fail.

## Secrets and data
- The GitHub repo is PUBLIC. Never commit tokens, keys, passwords, .env files, service-account JSON,
  or data drops (parcel GeoJSON etc.). They live in `.env.local`, in the `.assetlogic` folder under the
  user's home directory, and in Netlify environment variables. .gitignore already blocks them; keep it that way.
- Never print a token, key or password in chat or in tool output. Redact when inspecting env files.
- Database access from the site goes through Netlify Functions only; the browser never holds
  database credentials.

## Look and feel
- Match the LandLogic platform: sidebar, light grey map, white right panel, dark green headings.
- Text must never overflow its container. Let values wrap; avoid no-wrap chips in narrow boxes.
