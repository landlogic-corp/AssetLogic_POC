# Running the project locally

A step-by-step guide from an empty machine to the application running at http://localhost:8765.

There are three levels. Each builds on the one before, and you can stop at any of them.

| Level | What you get | What you need |
|---|---|---|
| **1. UI only** | The full interface with built-in sample data and a placeholder map | Node.js |
| **2. Real map** | The same, on the LandLogic Mapbox basemap | + Mapbox values from the administrator |
| **3. Live data** | Real parcels and assets from the database; changes persist | + database values and a key file from the administrator |

## Before you start

### Install

| Tool | Version | Check with |
|---|---|---|
| Node.js | 22.15 or newer | `node --version` |
| npm | comes with Node.js | `npm --version` |
| Git | any recent | `git --version` |

Download Node.js from https://nodejs.org (the LTS installer). On Windows, use **Git Bash** (installed
with Git for Windows) for the commands below; PowerShell equivalents are given where they differ.

### Ask the project administrator for

You do not need these for level 1. For levels 2 and 3, request:

| Item | Needed for | What it is |
|---|---|---|
| `MAPBOX_TOKEN` | Level 2 | A public Mapbox access token. The administrator must allow `http://localhost` on it |
| `MAPBOX_STYLE` | Level 2 | The address of the LandLogic basemap style |
| `DB_INSTANCE`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Level 3 | Where the database is and the application login |
| A service-account key file (`.json`) | Level 3 | Proves to Google Cloud that you may connect |

These are credentials. Receive them through a private channel, never by email thread or chat that
others can read, and never commit them. See [security.md](security.md).

## Level 1 · UI only

**Step 1. Get the code.**

```bash
git clone https://github.com/landlogic-corp/AssetLogic_POC.git
cd AssetLogic_POC
```

**Step 2. Install dependencies.**

```bash
npm install
```

This creates `node_modules/`. It takes under a minute.

**Step 3. Build the page.**

```bash
npm run build
```

Expected output, roughly:

```
index.html written (174,000 bytes, build local, mapbox off)
```

`mapbox off` is correct at this level.

**Step 4. Start the local server.**

```bash
npm run dev
```

Expected output:

```
Prototype at http://localhost:8765
```

Leave this terminal open. Stop the server later with `Ctrl + C`.

**Step 5. Open http://localhost:8765.**

You should see the dashboard with a notice that it is showing sample data. Click a row to open the
map view: at this level it is a drawn placeholder map. Everything in the interface works; changes are
not saved.

## Level 2 · Real map

**Step 6. Create your local configuration file.**

```bash
cp .env.example .env.local
```

PowerShell: `Copy-Item .env.example .env.local`

**Step 7. Fill in the two Mapbox lines** in `.env.local` with the values from the administrator:

```
MAPBOX_TOKEN=<value from the administrator>
MAPBOX_STYLE=<value from the administrator>
```

Leave the database lines empty for now.

**Step 8. Rebuild and restart.**

```bash
npm run build
npm run dev
```

The build line should now end with `mapbox on, custom style`. Reload the browser: the map view is now
the LandLogic basemap, and the cards show real map thumbnails.

> The token only works on addresses the administrator has allowed. That is why you must open the page
> through `http://localhost:8765` and not by double-clicking `index.html`.

## Level 3 · Live data

**Step 9. Store the key file outside the repository.**

Create a folder named `.assetlogic` in your home directory and put the key file in it:

```bash
mkdir -p ~/.assetlogic
mv ~/Downloads/<the key file>.json ~/.assetlogic/gcp-sa-key.json
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.assetlogic"
Move-Item "$HOME\Downloads\<the key file>.json" "$HOME\.assetlogic\gcp-sa-key.json"
```

Do not put it inside the project folder. The repository ignores key files by name as a safety net,
but the right place is outside it.

**Step 10. Fill in the database lines** in `.env.local`:

```
DB_INSTANCE=<value from the administrator>
DB_NAME=<value from the administrator>
DB_USER=<value from the administrator>
DB_PASSWORD=<value from the administrator>
GCP_SA_KEY_FILE=<absolute path to the key file from step 9>
```

Use the full path, for example `C:\Users\you\.assetlogic\gcp-sa-key.json` on Windows or
`/Users/you/.assetlogic/gcp-sa-key.json` on macOS. Put each value on one line with nothing after it.

**Step 11. Check the database connection.**

```bash
npm run db:check
```

Expected output, roughly:

```
Connected as <user> to <database> in 1000 ms
Server: PostgreSQL 18.x
Extensions: …, postgis …
Schemas: app, gis, ref, …
```

If this fails, go to [troubleshooting.md](troubleshooting.md) before continuing. The most common
cause on Windows is antivirus software that inspects encrypted connections.

**Step 12. Restart the server and reload.**

```bash
npm run dev
```

The dashboard subtitle now reads **"live from the AssetLogic database"**. Open a property: its real
parcel outline is drawn in green, with neighbouring parcels around it. Layer toggles, alert rules and
added or removed properties are now saved.

> You are connected to the shared database. What you change here is what everyone sees.

## Confirming everything works

| Check | How | Expected |
|---|---|---|
| Page builds | `npm run build` | `index.html written …` |
| Server runs | `npm run dev`, open http://localhost:8765 | Dashboard appears |
| Map | Click any row | LandLogic basemap, centred on the property |
| Database | `npm run db:check` | `Connected as …` |
| API | Open http://localhost:8765/.netlify/functions/db-health | `{"ok":true, …}` |
| Live data | Dashboard subtitle | "live from the AssetLogic database" |
| Parcels | Map view at street zoom | Thin green parcel outlines |

## Everyday workflow

```bash
# edit asset-monitor.html or a function
npm run build        # only needed after editing asset-monitor.html
npm run dev          # restart after editing a function or a script
```

The dev server sends no-cache headers, so a browser reload always shows the latest build. Function
files are loaded when the server starts, so restart it after changing one.

Before you change anything, read [contributing.md](contributing.md): changes are reviewed before they
are pushed.

## What you do not need to do

- **Create a database.** One exists and is shared. The scripts that create and fill it
  (`db:migrate`, `db:import-parcels`, `db:load-assets`) are for administrators rebuilding the
  environment and need internal files you will not have.
- **Download parcel data.** It is already in the database.
- **Install PostgreSQL, the Google Cloud CLI or the Netlify CLI.** The project uses Node.js only.

## Removing the project

Stop the server, delete the project folder, and delete `~/.assetlogic`. Tell the administrator so
the credentials issued to you can be rotated.
