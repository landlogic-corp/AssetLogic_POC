# Release notes

Newest first. Each entry says what changed and, at the top, where work resumes.

Live site: https://landlogic-assetmonitoring.netlify.app

## Where we are (paused 2026-09-30)

The prototype is a working application on a real database: real parcel boundaries for three cities,
eight monitored properties, an API, a daily re-check, and a full documentation set. Work is paused
here.

### Resume with these, in order

| # | Task | Why now | Needs from LandLogic |
|---|---|---|---|
| 1 | **Access control**: sign-in on the site and every function | Today anyone with the URL can change the watchlist | Decision: hosting provider's identity service, or LandLogic's existing login |
| 2 | **Connect LandLogic data** through its API or MCP, one layer at a time: zoning, Official Plan, secondary plans, heritage, hazards, applications, permits, sales | Turns carried-forward facts into derived, live ones | Endpoint, credential (as a hosting environment variable), field documentation or a sample response per dataset |
| 3 | **Tighten the database**: encrypted connections only; recreate the application login with minimal rights | Closes the two known configuration gaps | Administrator action in the database console |
| 4 | **Address and identifier search for Toronto and Mississauga** | Their parcel files carry no addresses | Address-point datasets, or item 2 |
| 5 | **Replace illustrative market data** with real sales and a real series | Currently placeholders | A sales source |
| 6 | **Add a property by clicking its parcel** on the map | Natural next interaction now that parcels are drawn | Nothing |
| 7 | **Alert delivery**: email and digests | Rules record a channel and frequency but nothing is sent yet | Choice of email service |
| 8 | **Automated tests** for the functions and the snapshot logic | None exist | Nothing |

### Open decisions

- Whether to rewrite git history to remove the schema file that was public from 2026-09-28 to
  2026-09-30. It is no longer in the working tree, but it remains in earlier commits.
- Where the internal documents (`docs/internal/`) are backed up, since they are not in git.
- Whether to keep the repository public. It is public to avoid hosting charges for private
  organisation repositories.

## 2026-09-30

### Added
- **Documentation set.** README, architecture, directory guide, local setup, frontend, API,
  database overview, data pipeline, deployment, security, contributing, troubleshooting, glossary.
- **Internal documents**, kept out of git: database ERD and data dictionary, infrastructure map.
  The full schema, the provisioning guide and the source-data mapping moved there too.
- **Live database.** Structure created and seeded. About 833,000 parcels imported for Toronto,
  Mississauga and the Region of Waterloo in roughly four minutes; every run logged.
- **Sample properties loaded** and each linked to its real parcel.
- **API.** Functions for assets, parcels in view, adding a property, monitoring settings, a health
  check, and a daily re-check that turns changes into alerts.
- **Page on live data.** Loads from the API with the built-in sample as automatic fallback; draws
  real parcel outlines; saves layer toggles, alert rules, read state, additions and removals.
- **Add a property end to end.** Address suggestions, geocoding, parcel match, first snapshot.
- **Administrator access** to every schema for the database's admin login.
- **Local dev server runs the functions**, at the same paths as production.

### Changed
- Snapshots carry forward a fact when the layer that would derive it is not loaded, and record that
  they did.
- Parcel responses are cached at the CDN.
- `.env.example` no longer suggests any values.

### Fixed
- Local database access, which was blocked by security software inspecting encrypted connections.

## 2026-09-28

### Added
- **Real data.** Eight properties from a LandLogic sample sheet replaced the placeholders, with
  zoning, Official Plan, secondary plan, heritage, flood risk and nearby applications.
- **Real map.** Mapbox GL JS on the LandLogic basemap, geocoded locations, map thumbnails, working
  zoom, 3D and satellite toggles. The token is injected at build time, never stored in the repository.
- **Database design**, in three areas: reference and provenance, spatial layers, product.
- **Publishing workflow**: one command builds, commits, pushes and confirms the live site.
- LandLogic favicon.

### Changed
- Addresses always read "street, municipality, province".
- Average sale is a per-unit multi-residential figure that agrees across the KPI, chart and table.
- Facts the source does not provide are shown as not available rather than invented.
- `index.html` is generated and no longer tracked.

### Fixed
- Map opening at the wrong zoom when first shown from the dashboard.

### Security
- Full history scanned: no token, key or password has ever been committed.
- Ignore rules widened to cover configuration files, key files and data files.

## 2026-09-17

### Added
- Dashboard (table) view with sorting, filtering, column selection and summary tiles, and a
  Dashboard / Map toggle.
- Official LandLogic logo; sidebar links open the real product.
- Repository on GitHub; site on Netlify, deploying on every push.

### Fixed
- Text overflowing its container in several components.
- A layout bug that pushed the detail sheet off-screen.

## 2026-09-15

### Added
- First prototype: LandLogic-style shell, watchlist, map with detail sheet, monitored layers, alert
  rules, alerts feed.
