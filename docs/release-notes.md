# Release notes

Newest first. Each entry says what changed and, at the top, where work resumes.

Live site: https://landlogic-assetlogic.netlify.app

## Where we are (paused 2026-10-08)

The prototype is a working application on a free, serverless PostgreSQL + PostGIS database: real
parcel boundaries for Toronto, Mississauga and the Region of Waterloo, eight monitored properties,
an API, a daily re-check, and a full documentation set. Nothing in the stack bills: Netlify free,
Neon free, Mapbox free, public GitHub. The Google Cloud instance is deleted.

### Resume with these, in order

| # | Task | Why now | Needs from LandLogic |
|---|---|---|---|
| 1 | **Access control**: sign-in on the site and every function | Today anyone with the URL can change the watchlist | Decision: Netlify Identity (invite-only), or LandLogic's existing login |
| 2 | **Connect LandLogic data** through its API or MCP, one layer at a time: zoning, Official Plan, secondary plans, heritage, hazards, applications, permits, sales | Turns carried-forward facts into derived, live ones | Endpoint, credential (as a Netlify environment variable), field documentation or a sample response per dataset |
| 3 | **Separate database login for the site** with read/write rights only, keeping the owner login for administrators | Least privilege | Nothing |
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

### Connecting with DataGrip

Full guide, including pgAdmin and psql: [database-clients.md](database-clients.md).

1. Get the **direct** connection string from the administrator (in Neon: *Connect*, untick
   *Connection pooling*). It has the form `postgresql://user:password@host/database?sslmode=require`.
2. In DataGrip: **+** → **Data Source** → **PostgreSQL**. Download the driver if prompted.
3. **General** tab: Host = the part between `@` and `/`; Port `5432`; User = before the first `:`;
   Password = between `:` and `@`; Database = after the last `/`, before `?`.
4. **SSH/SSL** tab: tick **Use SSL**, Mode **require**, leave certificate fields empty.
5. **Test Connection**: expect PostgreSQL 18.6.
6. **Schemas** tab: tick **ref**, **gis** and **app**. Only `public` is shown by default, and it is empty.
7. Click OK, then try `select * from app.asset_dashboard;`

The first query after a quiet period takes a second while the database wakes. The login owns the
schema, so prefer `select` while exploring; structural changes go through the reviewed schema file.

## 2026-10-13

### Fixed
- The shared helper file for the functions was being deployed as an endpoint of its own, which
  answered with a crash page. It now lives in `netlify/lib/`, outside the functions folder.

### Security
- Netlify build logs are no longer public.

## 2026-10-08

### Changed
- **Database moved to a free serverless host (Neon).** The original managed instance was a
  production-grade machine costing hundreds of dollars a month for 480 MB of data. The database was
  rebuilt from the repository scripts (schema, parcel imports, sample assets) on Neon's free plan,
  which allows 1 GB per project and sleeps when idle. Connection is now a single `DATABASE_URL`.
- Role grants in the schema are conditional, so the same file works on any host.
- Health check reports which connection path is in use.
- The Google Cloud instance, service account and connection code are gone; `DATABASE_URL` is the
  only database setting left.

### Added
- [database-clients.md](database-clients.md): connecting DataGrip, pgAdmin or psql.

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
