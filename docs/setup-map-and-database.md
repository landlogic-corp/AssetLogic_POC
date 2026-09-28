# Setting up the real map and the database

Two things stand between the prototype and live data: a Mapbox account that can serve the map,
and a database in Google Cloud that holds the assets. This is what I need from you for each, and
what I will do once I have it.

## Part 1 · Mapbox

The prototype will load Mapbox GL JS, the same library LandLogic uses, and draw the watched parcels
on a real basemap.

### What you do

1. **Sign in to Mapbox** at https://account.mapbox.com with the account that owns LandLogic's map
   styles. If LandLogic's styles live under a colleague's account, ask them for the style URL in
   step 3 instead.
2. **Create a token for this prototype.** Go to *Tokens*, then *Create a token*.
   - Name it `assetlogic-poc`.
   - Leave the default public scopes checked (`styles:read`, `fonts:read`, `styles:tiles`). No secret
     scopes are needed.
   - Under *URL restrictions*, add `https://guileless-monstera-a74dd9.netlify.app` and
     `http://localhost`. This stops anyone who reads the public repo from using the token elsewhere.
   - Copy the token. It starts with `pk.`.
3. **Find the style URL.** Open https://studio.mapbox.com, hover the style LandLogic uses, click the
   three dots, then *Copy style URL*. It looks like `mapbox://styles/landlogic/ckxxxxxxxx`. If you
   would rather not share a private style, skip this and I will use Mapbox's *Light* style, which is
   close to what the product shows.
4. **Put the token into Netlify, not into the code.** In Netlify open the project, then *Site
   configuration*, then *Environment variables*, then *Add a variable*:
   - `MAPBOX_TOKEN` = the `pk.` token.
   - `MAPBOX_STYLE` = the style URL from step 3, if you have one.
   The build script will stamp them into `index.html` at deploy time, so they never sit in the
   public GitHub repo.
5. **For my local testing**, create a file called `.env.local` in the project folder with the same
   two lines (`MAPBOX_TOKEN=pk....`). That file is already ignored by git.
6. **Send me the parcel GeoJSON** for the eight buildings if you have it. Coordinates should be
   latitude and longitude (WGS84). If it is in a projected system such as UTM zone 17, send it
   anyway and I will convert it. If you do not have parcel outlines, I will geocode the eight
   addresses and draw points.

### What I do after that

- Replace the drawn map with Mapbox GL JS and centre each asset on its geocoded location.
- Draw parcels from your GeoJSON as the green highlight, with click-to-open.
- Move the application, permit and sale pins to real coordinates.
- Keep the drawn map as a fallback for the claude.ai artifact, where external tiles are blocked.

## Part 2 · Database in Google Cloud

Recommendation: **Cloud SQL for PostgreSQL with PostGIS.** It stores parcel geometry natively,
computes "within 500 m" queries directly, and matches the GIS tooling LandLogic already uses.
The Netlify site is static, so it will reach the database through small Netlify Functions
(server-side code that runs on each request) using a Google service account. The browser never
talks to the database directly and no database password sits in the page.

The proposed schema is in `docs/schema.sql`. **Please read it and confirm or change it before I
create anything.** The main tables:

| Table | Holds |
|---|---|
| `municipality` | Toronto, Mississauga, Waterloo, Kitchener and their region, conservation authority, plan names |
| `app_user` | Who owns which watchlist |
| `asset` | One row per watched building: address, class, geocoded point, parcel polygon |
| `asset_planning` | Zoning, Official Plan, secondary plan, heritage, flood risk per retrieval, so history is kept |
| `development_application`, `building_permit` | Nearby activity with a location, matched to assets by distance |
| `sale_comparable`, `market_metric` | Comparable sales and the monthly per-unit series behind the chart |
| `layer`, `asset_layer`, `alert_rule`, `alert` | Monitored layers, alert rules and the alerts they produce |
| `asset_dashboard` (view) | One row per asset with the counts the dashboard table shows |

### What you do

1. **Pick the Google Cloud project.** Open https://console.cloud.google.com and select the project
   you want this in, or create one called `assetlogic-poc`. Billing must be enabled on it; the
   smallest Cloud SQL instance costs roughly US$10 to 15 a month while it is running.
2. **Enable two APIs.** In *APIs & Services*, then *Enable APIs and services*, enable
   **Cloud SQL Admin API** and **Cloud Resource Manager API**.
3. **Create the instance.** Go to *SQL*, then *Create instance*, then *PostgreSQL*.
   - Instance ID: `assetlogic-poc`
   - Set a password for the default `postgres` user and keep it somewhere safe. Do not send it to me.
   - Database version: PostgreSQL 16
   - Edition: Enterprise. Preset: *Sandbox* or *Development* (shared core, 1 vCPU, 10 GB).
   - Region: `northamerica-northeast2` (Toronto).
   - Under *Connections*, keep *Public IP* enabled. Do not add any authorized network; the
     service account will connect through Google's Cloud SQL connector instead.
   - Create. It takes a few minutes.
4. **Create the database and a user for the app.** On the instance page:
   - *Databases*, then *Create database*: name `assetlogic`.
   - *Users*, then *Add user account*: username `assetlogic_app`, choose a password, keep it safe.
     Do not send it to me in chat; step 6 covers how it reaches the code.
5. **Create a service account for the connection.** *IAM & Admin*, then *Service accounts*, then
   *Create service account*.
   - Name: `assetlogic-netlify`.
   - Role: **Cloud SQL Client** (only this one).
   - After it is created, open it, go to *Keys*, then *Add key*, then *Create new key*, JSON.
     A file downloads.
6. **Put the connection details into Netlify.** *Site configuration*, then *Environment variables*:
   - `GCP_SA_KEY` = the entire contents of the downloaded JSON file.
   - `DB_INSTANCE` = the *Connection name* shown on the instance page, e.g.
     `assetlogic-poc:northamerica-northeast2:assetlogic-poc`.
   - `DB_NAME` = `assetlogic`
   - `DB_USER` = `assetlogic_app`
   - `DB_PASSWORD` = the password from step 4.
7. **Give me the same access for local work.** Save a copy of the JSON key file at
   `C:\Users\Soroosh Sanjarani\.assetlogic\gcp-sa-key.json` (a folder outside the repo, so it can
   never be committed), and add the four `DB_*` lines above to the `.env.local` file from Part 1.
   Then tell me it is there. I will not print the key or the password anywhere.

### What I do after that

1. Connect through Google's Cloud SQL connector using the key file.
2. Create the schema from `docs/schema.sql` once you have confirmed it.
3. Load the eight buildings from your spreadsheet, the four municipalities, and the nearby
   applications, then geocode the addresses with Mapbox.
4. Add Netlify Functions that read assets, applications and alerts for the page, and write
   layer toggles and alert rules back.
5. Switch the page from the built-in example data to the functions, with the example data kept
   as a fallback when the database is unreachable.

### Two things to decide

- **Sign-in.** The schema has an `app_user` table so watchlists can belong to someone. For the POC
  I would hard-code one user (your admin account) and add real sign-in later. Say if you want
  sign-in now.
- **Who else can read the database.** With the setup above only the service account can connect.
  If your team wants to query it directly, give them the *Cloud SQL Client* role and the
  `assetlogic_app` password, or create read-only users per person.
