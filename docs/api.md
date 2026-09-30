# API reference

The server side is six functions in `netlify/functions/`. Each is reachable at
`/.netlify/functions/<name>` on the live site and on the local dev server.

## Conventions

- **Format.** Requests and responses are JSON (`parcels` returns GeoJSON).
- **Envelope.** Responses carry `ok: true` or `ok: false` with an `error` string.
- **Errors.** `400` invalid input, `404` not found, `405` wrong method, `409` conflict, `500`
  unexpected failure, `503` database unreachable (health check only). Error text never contains
  credentials.
- **Validation.** Identifiers are checked for shape, strings for length, enumerations against an
  allow-list, and every query is parameterised. A write always checks that the asset belongs to the
  current user.
- **Authentication.** None yet. The API acts as a single administrator account. This is the next
  piece of work; see [security.md](security.md).
- **Caching.** Responses are `no-store` except `parcels`, which is cached at the CDN.

## `GET /assets`

Returns every active asset with its facts, plus the alert feed.

```json
{
  "ok": true,
  "assets": [ { "id": "…", "name": "…", "address": "…", "city": "…", "province": "ON", "…": "…" } ],
  "alerts": [ { "id": 1, "asset": "…", "layer": "apps", "cat": "planning", "sev": "crit",
                "when": "Sep 26 · 08:10", "ago": "4 days ago", "title": "…", "desc": "…",
                "unread": true, "tab": "planning" } ],
  "generatedAt": "2026-09-30T14:05:00.000Z"
}
```

The asset object is the shape documented in [frontend.md](frontend.md#the-shape-of-an-asset). It
includes the parcel outline as GeoJSON so the map can draw it without a second request.

## `GET /assets?id=<uuid>`

One asset. `404` if it does not exist or is archived.

## `DELETE /assets?id=<uuid>`

Removes an asset from the watchlist. The record is archived, not deleted, so its history is kept.

```json
{ "ok": true }
```

## `GET /parcels?bbox=minLng,minLat,maxLng,maxLat`

The parcels that intersect a map view, as a GeoJSON `FeatureCollection`. Each feature has an `id` and
properties `id`, `pin`, `address` (either may be null depending on the source city).

- The box is limited to roughly 2.4 km across. A larger box returns an empty collection with
  `"tooWide": true`. The page only asks at street-level zoom.
- At most 4,000 parcels are returned.
- Cached at the CDN for an hour; parcel geometry changes rarely.

```json
{ "ok": true, "type": "FeatureCollection",
  "features": [ { "type": "Feature", "id": 136,
                  "properties": { "id": 136, "pin": null, "address": "63 Dunbar Rd S" },
                  "geometry": { "type": "MultiPolygon", "coordinates": [ "…" ] } } ] }
```

## `GET /add-asset?q=<text>`

Address suggestions for the add-asset dialog, limited to Ontario. Fewer than three characters returns
an empty list.

```json
{ "ok": true, "suggestions": [
  { "address": "155 University Avenue West", "city": "Waterloo", "postal": "N2L 3E5",
    "full": "155 University Avenue West, Waterloo, Ontario N2L 3E5, Canada",
    "lnglat": [-80.536081, 43.471517] } ] }
```

The lookup runs on the server so the page does not need its own geocoding call.

## `POST /add-asset`

Creates an asset.

| Field | Required | Notes |
|---|---|---|
| `address` | yes | Street address |
| `city` | no | Improves matching |
| `cls` | yes | `Residential`, `Mixed-use`, `Commercial`, `Industrial` or `Agricultural` |
| `sub` | no | Free-text sub-type |
| `name` | no | Defaults to the address |
| `layers` | no | Array of layer ids to monitor; a default set is used if omitted |

What happens, in order:

1. The address is geocoded.
2. The municipality is checked against those the system covers. An uncovered municipality is a `400`
   with a message naming the covered areas.
3. A duplicate (same owner, municipality and street address) is a `409` carrying the existing id.
4. The asset is created and its layers enabled.
5. A snapshot is taken: the parcel is found and linked, and facts are derived.
6. A "Monitoring started" alert is recorded.

Response `201`:

```json
{ "ok": true, "asset": { "id": "…", "address": "155 University Avenue West", "city": "Waterloo",
                         "parcel": { "address": "155 University Ave W", "area_m2": 119303, "…": "…" },
                         "…": "…" } }
```

## `POST /monitoring`

One endpoint, four actions, selected by `action`.

### `layer`
Turn a monitored layer on or off. Turning one off also removes its alert rule.

```json
{ "action": "layer", "assetId": "<uuid>", "layerId": "transit", "enabled": true }
```

### `rule`
Set an alert rule on a layer, replacing any existing one. Send `"rule": null` to remove it.

```json
{ "action": "rule", "assetId": "<uuid>", "layerId": "apps",
  "rule": { "trigger": "Application submitted", "radius": "500 m",
            "channels": ["In-app", "Email"], "freq": "Instantly" } }
```

| Field | Allowed values |
|---|---|
| `radius` | `On property`, `250 m`, `500 m`, `1 km`, `2 km` |
| `channels` | any of `In-app`, `Email`, `SMS`, `Teams`; at least one |
| `freq` | `Instantly`, `Daily digest (7:00 am)`, `Weekly digest (Monday)` |

### `read`
Mark one alert, or all of them, as read.

```json
{ "action": "read", "alertId": 23 }
{ "action": "read", "all": true }
```

### `snapshot`
Re-check one asset now.

```json
{ "action": "snapshot", "assetId": "<uuid>" }
```

Layer ids: `zoning`, `op`, `sp`, `coa`, `apps`, `permits`, `transit`, `heritage`, `flood`, `env`,
`sales`, `rent`, `mpac`.

## `POST /resnapshot`

Re-checks every active asset and creates an alert for each monitored fact that changed since the
previous snapshot. Runs automatically once a day; can be called by hand.

```json
{ "ok": true, "assets": 8, "alerts": 0, "ms": 766 }
```

An alert is only created when the corresponding layer is enabled for that asset.

## `GET /db-health`

Whether the site can reach the database. Returns no data and no credentials.

```json
{ "ok": true, "ms": 937, "server": "PostgreSQL 18.6", "database": "…", "user": "…",
  "extensions": ["pgcrypto", "plpgsql", "postgis"], "schemas": ["app", "gis", "ref"],
  "schemaCreated": true }
```

`503` with `ok: false` when the database cannot be reached.

## How a function is put together

```js
const { json, bad, fail, parseBody, isUuid, adminId, db } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method not allowed' });
    const body = parseBody(event); if (!body) return bad('invalid JSON');
    // 1. validate every input
    // 2. resolve the current user and check ownership
    // 3. run parameterised queries through db.query(text, params)
    return json(200, { ok: true });
  } catch (e) { return fail(e); }   // generic message, credentials redacted
};
```

`_lib.js` provides the helpers. `scripts/db.js` provides the connection: a small pool opened lazily
on first use and reused while the function instance stays warm.

## Adding an endpoint

1. Create `netlify/functions/<name>.js` exporting `handler`.
2. Validate every input. Never build SQL by concatenating request values.
3. Restart the local server (`npm run dev`) and call it at
   `http://localhost:8765/.netlify/functions/<name>`.
4. Document it here.

Table and column names are in the internal ERD ([how to get it](README.md#internal-documents)).
