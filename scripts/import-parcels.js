// Streams a GeoJSON parcel file into gis.parcel in batches. Re-runnable: rows are keyed on
// (source, source feature id) and updated in place. Logs a ref.ingest_run row.
//
// Usage: node --use-system-ca scripts/import-parcels.js <city>
//   city = toronto | mississauga | waterloo
const fs = require('fs');
const path = require('path');
const db = require('./db');

const PARCELS = path.join(__dirname, '..', 'parcels');
const CONFIG = {
  toronto: { file: 'Toronto Property Boundaries.geojson', source: 'toronto-property-boundaries', municipality: () => 'Toronto',
    map: p => ({ rid: String(p.OBJECTID), pin: null, arn: null, address: null, land_use: p.F_TYPE || null, area: null, attrs: {} }) },
  mississauga: { file: 'Mississauga Parcels.geojson', source: 'mississauga-parcels', municipality: () => 'Mississauga',
    map: (p, f) => ({ rid: String(f.id ?? p.FID), pin: null, arn: null, address: null, land_use: null, area: p.GIS_AREA ?? null, attrs: { CITY_PIN: p.CITY_PIN } }) },
  waterloo: { file: 'Wtarloo Region Parcels.geojson', source: 'waterloo-region-parcels', municipality: p => p.Municipality || 'Region of Waterloo',
    map: p => ({ rid: String(p.OBJECTID), pin: null, arn: p.RollNumber || null, address: p.Location || null, land_use: p.RealtyTaxClass || null, area: p['Shape.STArea()'] ?? null, attrs: { LegalDescription: p.LegalDescription, perimeter_m: p['Shape.STLength()'] } }) },
};
const BATCH = 400;
const SQL = `
  INSERT INTO gis.parcel (municipality_id, pin, arn, address, land_use, area_m2, geom, centroid, attributes, source_id, source_record_id)
  SELECT m.id, x.pin, x.arn, x.address, x.land_use, coalesce(x.area, ST_Area(g.geog)), g.geog, ST_Centroid(g.geog::geometry)::geography, x.attrs::jsonb, $10, x.rid
  FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[], $8::text[], $9::text[]) AS x(rid, pin, arn, address, land_use, area, gj, attrs, muni)
  JOIN ref.municipality m ON m.name = x.muni AND m.province = 'ON'
  CROSS JOIN LATERAL (SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x.gj), 4326)), 3))::geography AS geog) g
  WHERE NOT ST_IsEmpty(g.geog::geometry)
  ON CONFLICT (source_id, source_record_id) DO UPDATE SET municipality_id = excluded.municipality_id, pin = excluded.pin, arn = excluded.arn,
    address = excluded.address, land_use = excluded.land_use, area_m2 = excluded.area_m2, geom = excluded.geom, centroid = excluded.centroid,
    attributes = excluded.attributes, ingested_at = now()`;

(async () => {
  const city = process.argv[2]; const cfg = CONFIG[city]; if (!cfg) throw new Error('city must be one of ' + Object.keys(CONFIG).join(', '));
  const file = path.join(PARCELS, cfg.file); const size = fs.statSync(file).size;
  const src = await db.query(`select id from ref.data_source where code = $1`, [cfg.source]); const sourceId = src.rows[0].id;
  const run = await db.query(`insert into ref.ingest_run (source_id, target_table, parameters) values ($1, 'gis.parcel', $2) returning id`, [sourceId, { file: cfg.file, bytes: size }]);
  const runId = run.rows[0].id; const t0 = Date.now();
  let features = 0, written = 0, skipped = 0, batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const cols = [[], [], [], [], [], [], [], [], []];
    for (const r of batch) { cols[0].push(r.rid); cols[1].push(r.pin); cols[2].push(r.arn); cols[3].push(r.address); cols[4].push(r.land_use); cols[5].push(r.area); cols[6].push(r.gj); cols[7].push(JSON.stringify(r.attrs)); cols[8].push(r.muni); }
    const res = await db.query(SQL, [...cols, sourceId]);
    written += res.rowCount; skipped += batch.length - res.rowCount; batch = [];
    if (features % 20000 < BATCH) { const s = (Date.now() - t0) / 1000; console.log(`${city}: ${features.toLocaleString()} read, ${written.toLocaleString()} written, ${Math.round(features / s)} /s, ${Math.round(s)} s`); }
  };
  const featRe = /\{\s*"type"\s*:\s*"Feature"/g; let buf = '';
  const handle = async txt => {
    const f = JSON.parse(txt); features++;
    if (!f.geometry) { skipped++; return; }
    const r = cfg.map(f.properties || {}, f); r.muni = cfg.municipality(f.properties || {}); r.gj = JSON.stringify(f.geometry);
    batch.push(r); if (batch.length >= BATCH) await flush();
  };
  for await (const chunk of fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 4 << 20 })) {
    buf += chunk; const starts = []; featRe.lastIndex = 0; let m; while ((m = featRe.exec(buf))) starts.push(m.index);
    if (starts.length < 2) continue;
    for (let i = 0; i < starts.length - 1; i++) { let txt = buf.slice(starts[i], starts[i + 1]).trim(); if (txt.endsWith(',')) txt = txt.slice(0, -1); await handle(txt); }
    buf = buf.slice(starts[starts.length - 1]);
  }
  let tail = buf.trim(); tail = tail.slice(0, tail.lastIndexOf('}') + 1).replace(/\]\s*\}\s*$/, '').trim(); if (tail.endsWith(',')) tail = tail.slice(0, -1);
  if (tail.startsWith('{')) await handle(tail);
  await flush();
  await db.query(`update ref.ingest_run set finished_at = now(), status = 'succeeded', rows_written = $2, message = $3 where id = $1`, [runId, written, `${features} features read, ${skipped} skipped`]);
  console.log(`${city}: DONE ${features.toLocaleString()} features read, ${written.toLocaleString()} written, ${skipped} skipped in ${Math.round((Date.now() - t0) / 1000)} s (ingest_run ${runId})`);
  await db.close();
})().catch(async e => { console.error('FAILED:', e.message); try { await db.query(`update ref.ingest_run set finished_at = now(), status = 'failed', message = $1 where status = 'running' and target_table = 'gis.parcel'`, [e.message]); } catch {} await db.close().catch(() => {}); process.exit(1); });
