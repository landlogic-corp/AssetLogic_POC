# Troubleshooting

Problems that have actually occurred on this project, with the cause and the fix.

## Quick diagnosis

| Symptom | Go to |
|---|---|
| Notice says "Showing sample data" | [Sample data instead of live data](#sample-data-instead-of-live-data) |
| `unable to verify the first certificate` | [Certificate error connecting to the database](#certificate-error-connecting-to-the-database) |
| Map area is blank, or a drawn map instead of the real one | [The real map does not appear](#the-real-map-does-not-appear) |
| Map opens zoomed far out | [Map opens at the wrong zoom](#map-opens-at-the-wrong-zoom) |
| `node: bad option: --use-system-ca` | [Node.js is too old](#nodejs-is-too-old) |
| `EADDRINUSE` on start | [Port 8765 is already in use](#port-8765-is-already-in-use) |
| A function returns 500 | [A function fails](#a-function-fails) |
| Publish says `NOT LIVE` | [Publish reports NOT LIVE](#publish-reports-not-live) |
| Push is rejected or asks for a login | [Git push fails](#git-push-fails) |
| My edit does not show up | [Changes do not appear](#changes-do-not-appear) |
| Logged in to the database but see no tables | [Database login sees no tables](#database-login-sees-no-tables) |

## Sample data instead of live data

**Cause.** The page could not reach the `assets` function, or the function could not reach the
database. The page falls back by design.

**Fix.**
1. Open http://localhost:8765/.netlify/functions/db-health. The `error` field says what failed.
2. `… is not set`: a value is missing from `.env.local`. Compare with `.env.example`.
3. A certificate error: see the next section.
4. Restart the server after changing `.env.local`.

If you intended to run without a database (level 1 in [local-setup.md](local-setup.md)), this notice
is expected.

## Certificate error connecting to the database

```
FAILED: unable to verify the first certificate
```

**Cause.** Security software on the machine is inspecting encrypted connections and substituting its
own certificate. The database connector pins the database's real certificate and correctly refuses
the substitute. Seen with Norton 360's *Safe Web → HTTPS scanning*; other products with "HTTPS
scanning", "SSL inspection" or "web shield" features behave the same way, as do some corporate
proxies.

**Confirm.** `npm run db:check` fails with the message above while the live site's `db-health`
returns `ok`.

**Fix.** In the security product, stop it inspecting this connection. Prefer the narrowest option it
offers: an exclusion for the `node` program, or for non-browser applications, before turning HTTPS
inspection off entirely. In Norton 360: *Security → Advanced Security → Web → Safe Web → settings*,
then turn off *Uncommon application scanning*; if the error persists, turn off *HTTPS scanning*.
Browser protection through the product's extension is unaffected.

Security products have been known to re-enable this after an update. If database access stops
working again, check here first.

**Related.** The scripts run Node with `--use-system-ca` so it also trusts certificates installed in
the operating system's store. Keep that flag.

## The real map does not appear

| What you see | Cause | Fix |
|---|---|---|
| A drawn placeholder map | No token at build time | Add `MAPBOX_TOKEN` to `.env.local`, then `npm run build` |
| Blank map, notice about the token | The token does not allow this address | Open the page at `http://localhost:8765`, not as a file. For a new site address, ask the administrator to allow it on the token |
| Basemap loads but looks like the default Mapbox style | `MAPBOX_STYLE` missing | Add it and rebuild |
| Build says `mapbox off` after you added the token | Typo or stray characters on the line | One `NAME=value` per line, nothing after the value |

## Map opens at the wrong zoom

**Cause.** Historical bug: the map was created while the dashboard view kept it hidden, so its first
move was lost. Fixed; the map is positioned when it becomes visible and snaps to its target if the
animation cannot run.

**If it recurs** after a change to the map code, check that anything which moves the map tolerates a
hidden, zero-size container.

## Node.js is too old

```
node: bad option: --use-system-ca
```

**Fix.** Install Node.js 22.15 or newer (`node --version`).

## Port 8765 is already in use

**Cause.** A previous dev server is still running.

**Fix.** Stop it (`Ctrl + C` in its terminal), or run on another port:

```bash
PORT=8766 npm run dev
```

PowerShell: `$env:PORT = 8766; npm run dev`. The map token is allowed for `localhost` on any port.

## A function fails

1. Read the terminal running `npm run dev`; it prints each function call and its status.
2. Call the function directly in the browser or with `curl` and read the `error` field.
3. `400` means the input was rejected; compare with [api.md](api.md).
4. After editing a function, restart the server. Functions are loaded at start.

## Publish reports NOT LIVE

**Cause.** The push succeeded but the live page is not reporting the new commit within the wait time.
Usually the Netlify build failed.

**Fix.** Open the project's *Deploys* page in Netlify and read the failed build's log. Common causes:
a syntax error in a function, or a file the build needs that is ignored by git. Fix, then publish
again. `node scripts/publish.js --check` shows what is currently live.

## Git push fails

| Message | Cause | Fix |
|---|---|---|
| `Permission … denied` (403) | The stored GitHub login has no write access to this repository | Use an account with write access |
| `could not read Username … terminal prompts disabled` | More than one GitHub login is stored and git cannot choose | Put the username in the remote address: `git remote set-url origin https://<user>@github.com/landlogic-corp/AssetLogic_POC.git` |
| `rejected … fetch first` | The remote has commits you do not | `git pull --rebase`, then publish again |

## Changes do not appear

| Situation | Fix |
|---|---|
| Edited `asset-monitor.html` | Run `npm run build`; the browser loads `index.html` |
| Edited a function or a script | Restart `npm run dev` |
| Edited `index.html` | Do not; it is overwritten. Edit `asset-monitor.html` |
| Live site still shows the old version | `node scripts/publish.js --check` to see what is deployed |

## Database login sees no tables

**Cause.** In PostgreSQL, a login sees only what it owns or has been granted. The administrator login
on a managed service is not an all-seeing superuser.

**Fix.** The object owner grants access. This has been done for the administrator login on this
project. For a new login, an administrator applies the grants described in the internal ERD.

## Windows notes

- Use Git Bash for the commands in these documents, or translate to PowerShell.
- In PowerShell use `Copy-Item`, `Move-Item` and `$HOME` instead of `cp`, `mv` and `~`.
- If a command that starts `node` hangs and nothing happens, make sure it is the real Node.js and not
  a Windows "app execution alias". `where node` should point into the Node.js install folder.

## Still stuck

Collect: the exact command, the exact output, your Node.js version, and the JSON from
`/.netlify/functions/db-health`. Remove any credential values, then send that to the project
administrator.
