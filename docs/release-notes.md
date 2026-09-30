# Release notes

Live site: https://guileless-monstera-a74dd9.netlify.app · Repo: https://github.com/landlogic-corp/AssetLogic_POC

## 2026-09-28

### Shipped
- **Real data.** The five placeholder properties were replaced by the eight buildings from the sample
  apartment sheet (Toronto, Mississauga, Waterloo, Kitchener) with their zoning codes, Official Plan
  designations, secondary plans, heritage notes, flood risk and active applications within 500 m.
- **Fixes from review.** Zoning tags now show real codes; every address reads "street, municipality,
  ON"; average sale is a per-unit multi-residential figure that agrees across KPI, chart and table.
  Values the sheet does not provide (permits, environmental screening, lot sizes, assessments) are
  shown as not available instead of invented.
- **Real map.** Mapbox GL JS on the LandLogic light style, buildings and nearby applications at
  geocoded coordinates, static map thumbnails, working zoom, 3D and satellite toggles. The token is
  stamped in at build time from Netlify's environment and never enters the repository.
- **Favicon** is the LandLogic colour icon.
- **Publishing workflow.** One command rebuilds, commits, pushes and waits until Netlify serves the
  new commit. A local dev server exists because the Mapbox token is URL-restricted.
- **Schema v2** (`docs/schema.sql`): `ref` (provenance), `gis` (whole-city parcels plus zoning,
  Official Plan, secondary plan, heritage, hazard, application, permit, sale and market layers) and
  `app` (users, assets, fact snapshots, layers, alert rules, alerts). Every external record carries
  source tracking and a JSON attributes column so the LandLogic database can feed the same tables
  through an API or MCP later. `app.snapshot_asset()` derives an asset's facts by spatial join.
- **Database provisioned** by LandLogic: Cloud SQL PostgreSQL 18 with PostGIS in Toronto, public IP
  with no open networks, application user and service account. Netlify holds the credentials as
  secret environment variables. A `db-health` function confirms Netlify reaches the database.
- **Parcel files inspected** (`docs/data-sources.md`): Mississauga 166,923, Toronto 498,589 and
  Waterloo Region 167,275 parcels, all WGS84, clean. All eight buildings fall inside a parcel.
- **Security.** Full git history and working tree scanned: no token, key or password has ever been
  committed. `.gitignore` blocks env files, keys, the parcels folder, data drops and the generated
  page. The service-account key was moved out of the project folder to `~/.assetlogic/`.

### Known blockers
- **Local database access** fails on this machine because Norton Web Shield intercepts the encrypted
  connection to the Cloud SQL port and the Google connector rejects the swapped certificate. Netlify
  is unaffected. Needs a Norton exclusion for `node.exe` (HTTPS scanning) or for the instance IP on
  port 3307.
- **Cloud SQL SSL mode** still allows unencrypted connections; should be set to SSL-only.

## 2026-09-30

### Shipped (local, awaiting review before push)
- **Local database access** after a Norton Safe Web change (HTTPS scanning off; browser protection stays via the extension).
- **Schema created** in Cloud SQL and seeded: 10 municipalities, data sources, 13 layers, admin user.
- **Parcels imported**: Mississauga 166,923, Toronto 498,589, Waterloo Region 167,275 (all seven municipalities), 833k rows in about four minutes, each run logged in `ref.ingest_run`.
- **Eight buildings loaded** with their sheet facts, layers, alert rules, alerts, nearby applications, comparables and market series; each linked to its parcel. `app.snapshot_asset()` now carries sheet facts forward for layers not loaded yet.
- **API as Netlify Functions**: `assets` (list/detail/remove), `parcels` (current map view, capped), `add-asset` (geocoder suggestions; geocode → parcel → snapshot), `monitoring` (layers, rules, mark read, re-snapshot), `db-health`. Parameterised SQL and input validation throughout; credentials only in Netlify environment variables.
- **Page wired to the API** with the sample data as automatic fallback; real parcel outlines drawn in the map view; every toggle, rule, alert and add/remove persists. Verified end to end locally, including adding 155 University Ave W (parcel found by roll number) and removing it.
- **Local dev server** now runs the functions in-process at the same paths as production.

### Known risk
- The site has no sign-in, so anyone with the URL can change the watchlist. Acceptable for the review period only; add access control before sharing the link widely.

## Next session

1. Review and push the API + page wiring; confirm `db-health` and the live page against Netlify.
2. Access control for the write endpoints (simplest: Netlify Identity or a signed session cookie for the admin user).
3. Tighten Cloud SQL SSL mode to SSL-only.
4. Scheduled re-snapshot (Netlify scheduled function, daily) so changes become alerts automatically.
5. Toronto and Mississauga address points for address/PIN search without geocoding.
6. Sources for the remaining layers (zoning, OP, secondary plans, heritage, hazards, applications, permits, sales, market series) and their importers; replace the illustrative market and comparables data.
7. "Add asset" by clicking a parcel on the map.
