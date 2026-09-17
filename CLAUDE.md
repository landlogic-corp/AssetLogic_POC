# AssetLogic prototype: working rules

## Source of truth
- Edit `asset-monitor.html` only. `index.html` is generated from it; never edit `index.html` by hand.
- The page is one self-contained file (HTML, CSS, JavaScript). All data in it is example data.

## Publishing every change
After any change the user should see, publish it. Do not stop at a local edit.

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

## Look and feel
- Match the LandLogic platform: sidebar, light grey map, white right panel, dark green headings.
- Text must never overflow its container. Let values wrap; avoid no-wrap chips in narrow boxes.
