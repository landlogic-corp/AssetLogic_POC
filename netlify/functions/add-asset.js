// POST /.netlify/functions/add-asset  { address, name?, cls, sub?, layers: [...] }
// Geocodes the address (Ontario only), finds the parcel under it, creates the asset, enables the
// chosen layers, takes the first snapshot, and returns the asset in page shape.
// GET  /.netlify/functions/add-asset?q=<text>  → address suggestions (proxy to the geocoder, so the
// browser never needs its own geocoding call)
const { json, bad, fail, parseBody, str, adminId, loadAssets, db } = require('./_lib');

const SITE = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8765';
async function geocode(q, limit = 1) {
  const token = process.env.MAPBOX_TOKEN; if (!token) throw new Error('MAPBOX_TOKEN is not configured');
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=ca&limit=${limit}&types=address&bbox=-95.2,41.6,-74.3,56.9&access_token=${token}`;
  const r = await fetch(url, { headers: { referer: SITE } });
  if (!r.ok) throw new Error(`geocoder ${r.status}`);
  const j = await r.json();
  return (j.features || []).map(f => ({ lnglat: f.geometry.coordinates, full: f.properties.full_address, street: f.properties.name, city: f.properties.context && f.properties.context.place && f.properties.context.place.name, postal: f.properties.context && f.properties.context.postcode && f.properties.context.postcode.name, accuracy: f.properties.coordinates && f.properties.coordinates.accuracy }));
}
const LAYER_IDS = ['zoning', 'op', 'sp', 'coa', 'apps', 'permits', 'transit', 'heritage', 'flood', 'env', 'sales', 'rent', 'mpac'];
const CLASSES = ['Residential', 'Mixed-use', 'Commercial', 'Industrial', 'Agricultural'];

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      const q = str(event.queryStringParameters && event.queryStringParameters.q, 120); if (!q || q.length < 3) return json(200, { ok: true, suggestions: [] });
      const hits = await geocode(q, 5);
      return json(200, { ok: true, suggestions: hits.filter(h => h.city).map(h => ({ address: h.street, city: h.city, postal: h.postal || '', full: h.full, lnglat: h.lnglat })) });
    }
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method not allowed' });
    const b = parseBody(event); if (!b) return bad('invalid JSON');
    const address = str(b.address, 160); const cls = CLASSES.includes(b.cls) ? b.cls : null; const sub = str(b.sub, 160) || null; const name = str(b.name, 160) || address;
    const layers = Array.isArray(b.layers) ? b.layers.filter(l => LAYER_IDS.includes(l)) : ['zoning', 'op', 'sp', 'apps', 'permits', 'flood'];
    if (!address || !cls) return bad('address and asset class are required');
    const [hit] = await geocode(address + (b.city ? `, ${b.city}, ON` : ', ON'));
    if (!hit || !hit.city) return bad('address could not be located');
    const muni = await db.query(`select id from ref.municipality where lower(name) = lower($1) and province = 'ON'`, [hit.city]);
    if (!muni.rowCount) return bad(`${hit.city} is not covered yet (parcels are loaded for Toronto, Mississauga and the Region of Waterloo)`);
    const owner = await adminId();
    const dup = await db.query(`select id from app.asset where owner_id = $1 and municipality_id = $2 and lower(street_address) = lower($3) and archived_at is null`, [owner, muni.rows[0].id, hit.street || address]);
    if (dup.rowCount) return json(409, { ok: false, error: 'already on the watchlist', id: dup.rows[0].id });
    const ins = await db.query(`insert into app.asset (owner_id, name, street_address, municipality_id, postal_code, asset_class, sub_type, location, geocode_accuracy)
      values ($1,$2,$3,$4,$5,$6,$7, ST_SetSRID(ST_Point($8,$9),4326)::geography, $10) returning id`, [owner, name, hit.street || address, muni.rows[0].id, hit.postal || null, cls, sub, hit.lnglat[0], hit.lnglat[1], hit.accuracy || 'unknown']);
    const id = ins.rows[0].id;
    for (const l of layers) await db.query(`insert into app.asset_layer (asset_id, layer_id, enabled) values ($1,$2,true) on conflict do nothing`, [id, l]);
    if (layers.includes('apps')) await db.query(`insert into app.alert_rule (asset_id, layer_id, trigger, radius_m) values ($1,'apps','Application submitted',500)`, [id]);
    await db.query(`select app.snapshot_asset($1)`, [id]);   // links the parcel and derives what the layers can answer
    await db.query(`insert into app.alert (asset_id, layer_id, severity, category, title, body) values ($1,'zoning','info','planning','Monitoring started', $2)`, [id, `Baseline captured for ${hit.full}. Facts fill in as each data layer is loaded.`]);
    const [asset] = await loadAssets(owner, id);
    return json(201, { ok: true, asset });
  } catch (e) { return fail(e); }
};
