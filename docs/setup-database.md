# Setting up the database

The map is done. This guide covers the database in Google Cloud: what it is for, what you do in
the console, what I do after, and how secrets are handled so nothing sensitive reaches the public
GitHub repository.

## Where this is going

The prototype currently ships its eight buildings inside the page. The database replaces that with
real records and, more importantly, with the **city-wide GIS layers** the product needs:

| Layer | What it enables |
|---|---|
| Parcels (whole city) | Click any parcel on the map, snap an address to its lot, draw the true outline |
| Zoning, Official Plan, secondary plan areas | Derive an asset's designations by spatial join instead of typing them |
| Heritage properties and districts | "On site" and "within 100 m" checks |
| Conservation authority hazard areas | Flood risk by intersection |
| Development applications, permits, sales | "Within 500 m" counts and alerts when status changes |

With those in place, **adding a property live** is one flow: geocode the address, find the parcel
under it, run `app.snapshot_asset()` to spatially join the parcel against every layer, and show the
result. The same function re-runs on a schedule; a difference between two snapshots becomes an alert.

Every table that holds outside data carries `source_id`, `source_record_id`, `source_updated_at` and
an `attributes` JSON column. When the LandLogic database becomes reachable through an API or MCP,
its records land in the same tables with a different `data_source` row; nothing about the page or
the schema has to change. Full definition: `docs/schema.sql`.

## Recommendation

**Cloud SQL for PostgreSQL 16 with PostGIS**, in the Toronto region, smallest tier. PostGIS handles
parcel polygons, "within 500 m" and "intersects floodplain" natively and is what GIS tooling expects.

The Netlify site stays static. It talks to the database through **Netlify Functions**, small
server-side handlers deployed with the site, which hold the credentials. The browser never sees a
database password, and the public repository never contains one.

## What you do in Google Cloud

1. **Choose the project.** https://console.cloud.google.com, select the project for this, or create
   `assetlogic-poc`. Billing must be enabled. The smallest Cloud SQL instance is roughly
   US$10–15 a month while running; storage for a few cities of parcels is a few GB.
2. **Enable APIs.** *APIs & Services* → *Enable APIs and services*: **Cloud SQL Admin API** and
   **Cloud Resource Manager API**.
3. **Create the instance.** *SQL* → *Create instance* → *PostgreSQL*.
   - Instance ID `assetlogic-poc`; PostgreSQL 16; edition *Enterprise*; preset *Development*
     (1 vCPU shared, ~1.7 GB RAM, 10 GB SSD, autoscaling storage on).
   - Region `northamerica-northeast2` (Toronto). Single zone is fine for a POC.
   - Set the `postgres` user password. Keep it in your password manager. **I do not need it.**
   - *Connections*: leave **Public IP** on, add **no** authorized networks. Access goes through
     Google's Cloud SQL connector with a service account, which is the secure path.
   - Create. It takes a few minutes.
4. **Create the database and the application user.** On the instance page:
   - *Databases* → *Create database* → name `assetlogic`.
   - *Users* → *Add user account* → username `assetlogic_app`, choose a strong password.
     This is the only database credential the site will ever hold.
5. **Enable PostGIS.** *Cloud SQL Studio* (left menu) → sign in as `postgres` → database
   `assetlogic` → run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```
   Only the `postgres` user can install extensions, which is why this one step is yours.
6. **Create a service account** for the site and for my imports. *IAM & Admin* → *Service accounts*
   → *Create*: name `assetlogic-netlify`, role **Cloud SQL Client** only. Open it → *Keys* →
   *Add key* → JSON. A key file downloads.
7. **Give the site its configuration.** Netlify → project → *Site configuration* →
   *Environment variables*:

   | Name | Value |
   |---|---|
   | `GCP_SA_KEY` | the whole contents of the JSON key file |
   | `DB_INSTANCE` | the *Connection name* on the instance page, e.g. `assetlogic-poc:northamerica-northeast2:assetlogic-poc` |
   | `DB_NAME` | `assetlogic` |
   | `DB_USER` | `assetlogic_app` |
   | `DB_PASSWORD` | the password from step 4 |

   Mark `GCP_SA_KEY` and `DB_PASSWORD` as **secret** in Netlify so they are hidden in the UI and logs.
8. **Give me the same access locally**, outside the repository:
   - Move the key file to `C:\Users\Soroosh Sanjarani\.assetlogic\gcp-sa-key.json`.
   - Add to `.env.local` in the project folder (copy the names from `.env.example`): `DB_INSTANCE`,
     `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `GCP_SA_KEY_FILE` pointing at that path.
   - Tell me it is done. I will not print the key or the password anywhere.
9. **Drop the parcel files** in the `parcels` folder inside the project directory (git-ignored, so
   they can never be committed), one file per city, and tell me for each: the coordinate system if you know it (WGS84, or a projected system
   such as UTM 17N / MTM 10), and which property holds the PIN, roll number and address.

## What I do after that

1. Connect with the key through Google's Cloud SQL connector (no IP allow-listing, TLS by default).
2. Create the schema from `docs/schema.sql` and seed the four municipalities and the layer list.
3. Import each city's parcels with a streaming Node script (`scripts/import-parcels.js`): reads the
   file, reprojects to WGS84 if needed, writes `gis.parcel` in batches, logs a `ref.ingest_run` row.
   Toronto alone is several hundred thousand parcels; the import runs in minutes and can be re-run
   safely because rows are keyed on the source feature id.
4. Load the eight buildings, link each to its parcel, and run `app.snapshot_asset()` for each.
   Facts the GIS layers cannot yet provide (we only have parcels at first) stay as they are in the
   sample sheet, stored with `method = 'manual'`, until the corresponding layer is imported.
5. Add Netlify Functions: `assets` (list and detail from `app.asset_dashboard`), `parcels` (the
   parcels in the current map view, via `gis.parcels_in_bbox`), `add-asset` (geocode → parcel →
   snapshot), `layers` and `alerts` (read and write). Each holds the credentials server-side and
   validates its input.
6. Switch the page to the functions, drawing real parcel outlines on the map, with the built-in
   sample data kept as an offline fallback.
7. When you share the sources for the other columns (zoning, OP, heritage, hazards, applications,
   sales, market series), each gets a `data_source` row and an import or sync script into its
   `gis` table, and the snapshots start deriving those facts automatically.

## Security model

- **Public repository holds no secrets.** Verified across the full git history: no token, key or
  password has ever been committed. `.gitignore` blocks `.env*`, key files, `secrets/`, the
  `.assetlogic` folder, data drops and the generated `index.html`.
- **Mapbox token** is a public token restricted to `localhost` and the Netlify URL. It is stamped
  into the built page from Netlify's environment, never from the repo.
- **Database credentials** live only in Netlify environment variables (marked secret) and in your
  local `.env.local` / `.assetlogic` folder. The browser only ever calls Netlify Functions.
- **Least privilege.** The service account has *Cloud SQL Client* only. The `assetlogic_app` user
  can read `ref` and `gis`, and read/write `app`; it cannot alter schemas or install extensions.
  Imports run under a separate owner role.
- **Cloud SQL has no open networks.** Connections go through Google's connector with IAM, over TLS.
- **Site headers** already send `noindex` and `nosniff`; the functions will add rate limiting and
  input validation before anything writes to the database.

## Two decisions to make

- **Sign-in.** Decided: one hard-coded user (the admin account) for this version; the `app.app_user`
  table is there so real sign-in can be added later without a migration.
- **Who else can query the database directly.** Give teammates the *Cloud SQL Client* role and a
  read-only database user each; do not share the `assetlogic_app` password.
