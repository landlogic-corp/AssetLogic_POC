# LandLogic Asset Monitor prototype

Clickable proof of concept for an asset monitoring module inside the LandLogic platform.
All property, planning and market data in it is example data.

Live: https://guileless-monstera-a74dd9.netlify.app

## What it shows

- **Dashboard view**: a sortable, filterable table of every watched asset with zoning, Official Plan,
  secondary plan, heritage, flood risk, nearby development applications, permits and average sale price.
- **Map view**: the watchlist, a map with pins for nearby activity, and a bottom sheet with the full
  detail for one asset (Overview, Planning, Development, Risk, Market, Activity).
- **Monitored layers**: turn data layers on or off per asset and set alert rules on each layer.
- **Alerts**: a feed of flags across the portfolio and the list of active alert rules.

## Files

| File | Purpose |
|---|---|
| `asset-monitor.html` | The source. Edit this file. One self-contained page: HTML, CSS and JavaScript. |
| `index.html` | Generated from the source by the build script. This is what the site serves. |
| `scripts/build-index.js` | Wraps the source in a full HTML document and writes `index.html`. |
| `netlify.toml` | Netlify settings: publish the repo root, run the build script, send `noindex` headers. |
| `landlogic-logo-colour.svg` | The LandLogic logo used in the sidebar. |

## Run it locally

Open `index.html` in a browser. After editing `asset-monitor.html`, regenerate it:

```bash
node scripts/build-index.js
```

## Deploy

Publish a change with one command. It rebuilds `index.html`, commits, pushes to `main`, and waits until
the Netlify site serves that commit:

```bash
node scripts/publish.js "Describe the change"
```

Check what the live site is serving with `node scripts/publish.js --check`. The live URL is set in
`deploy.config.json`. Netlify must be linked to this repository for pushes to deploy.
