# Security

This repository is **public**. Read this page before your first commit.

## The rule

> No token, key, password, connection detail, data file or internal document is ever committed.

Everything the application needs to run is supplied from outside the repository.

## Where secrets live

| Secret | Live site | Your machine | In the repository |
|---|---|---|---|
| Mapbox token | Hosting environment variable | `.env.local` | **never** |
| Database connection string (contains the password) | Hosting environment variable, marked secret | `.env.local` | **never** |
| Administrator database login | Not stored in this system | Administrator only | **never** |

All of these are issued by the project administrator. If you need one, ask; do not look for it in
code, history, logs or another person's machine.

## What git ignores

`.gitignore` blocks the following, and each rule has been tested:

| Pattern | Why |
|---|---|
| `index.html` | Generated; contains the map token after a build |
| `.env`, `.env.*` (except `.env.example`) | Local configuration |
| `*.pem`, `*.key`, `*.p12`, `*-key.json`, `*sa-key*.json`, `secrets/`, `.assetlogic/` | Key material, wherever it ends up |
| `docs/internal/` | Internal documents: ERD, infrastructure map, schema, provisioning guide |
| `parcels/`, `data/`, `*.geojson`, shapefile parts, `*.gpkg`, `*.zip` | Source data |
| `node_modules/`, `.netlify/`, `.claude/` | Tooling |

Treat any change to `.gitignore` as a security change and have it reviewed.

## Before every commit

```bash
git status --short                 # nothing unexpected staged or untracked?
git diff --cached --name-only      # exactly the files you meant?
```

Then scan what you are about to commit:

```bash
git diff --cached | grep -nE "pk\.eyJ|sk\.eyJ|BEGIN [A-Z ]*PRIVATE KEY|\"private_key\"|password\s*=\s*\S" || echo "clean"
```

`clean` is the expected output. The publish script stages everything that is not ignored, so this
check matters most right before publishing.

## Design choices that protect the system

- **The browser holds no database credentials.** It calls server-side functions; only those connect.
- **The map token is public by design, and restricted.** Mapbox public tokens are meant to appear in
  a page. Ours is limited to the site's address and `localhost`, so it is useless elsewhere. It is
  injected at build time from the hosting environment rather than stored in the repository.
- **Encrypted, verified connections to the database.** The connection string is used with full
  certificate verification; the client refuses anything else.
- **Parameterised queries and input validation** in every function. Identifiers are checked for
  shape, strings for length, enumerations against allow-lists.
- **Errors do not leak.** Function errors return a generic message with credentials redacted.
- **The site is not indexed.** Responses carry a no-index header.
- **Scripts never print secrets.** Diagnostic scripts report names, lengths and outcomes, not values.

## Known gaps

Stated plainly so nobody assumes otherwise:

| Gap | Impact | Status |
|---|---|---|
| **No sign-in on the site or the functions** | Anyone who has the URL can view and change the watchlist | Next planned piece of work. Do not circulate the URL outside the team until done |
| The site and the local scripts share one database login that owns the schema | A compromised site could alter structure, not just data | Create a read/write-only login for the site when access control is added |
| A schema file was public for two days before being moved to internal docs | It remains in git history | Decision pending on rewriting history |

## If a secret is exposed

Act immediately; do not wait to confirm whether anyone saw it.

1. **Tell the project administrator.**
2. **Rotate the credential** at its source: issue a new one, update the hosting environment and every
   developer's local configuration, redeploy, then revoke the old one. Steps per credential are in
   the internal infrastructure map.
3. **Remove it from the repository.** Deleting the file in a new commit is not enough; it stays in
   history. Rotation is what makes the exposure harmless, so do that first, then clean history if
   warranted.
4. **Check for use.** Review the provider's usage logs for the exposure window.

## Local machine hygiene

- Keep `.env.local` and the key file readable only by you.
- Do not paste credential values into chat, tickets, screenshots or AI assistants.
- When you stop working on the project, delete the key file and tell the administrator so your
  credentials can be rotated.
- Security software that inspects encrypted traffic can break the database connection; see
  [troubleshooting.md](troubleshooting.md). Prefer a narrow exclusion to switching protection off.

## Data handling

- Parcel data is published by municipalities under their own open-data terms. Check the licence of a
  dataset before redistributing it.
- Market figures and comparables in the prototype are illustrative. Do not present them as evidence.
- The application stores property and planning information, not personal information. Keep it that
  way unless a privacy review says otherwise.

## Reporting

Report a suspected vulnerability or exposure privately to the project administrator at LandLogic.
Do not open a public issue for it.
