// Loads the eight sample buildings from the page's data block into the database, re-runnably:
// assets, their manual fact snapshots (from the sample sheet), monitored layers, alert rules,
// alerts, the nearby applications, comparable sales and the monthly market series.
// Run again after parcels are imported to link assets to parcels.
//
// Usage: node --use-system-ca scripts/load-assets.js
const fs = require('fs');
const path = require('path');
const db = require('./db');

function pageData() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'asset-monitor.html'), 'utf8');
  const start = html.indexOf('const TODAY = new Date(');
  const end = html.indexOf('/* =========================================================\n   State');
  if (start < 0 || end < 0) throw new Error('data block not found in asset-monitor.html');
  return new Function(html.slice(start, end) + '\nreturn { ASSETS, ALERTS, MUNI, TODAY };')();
}
const FLOOD = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'High' };
const parseWhen = (s, year) => { const m = s.match(/^([A-Z][a-z]{2}) (\d{1,2}) · (\d{2}):(\d{2})/); if (!m) return null; return new Date(`${m[1]} ${m[2]}, ${year} ${m[3]}:${m[4]}:00`); };
const parseMonthYear = s => { const m = s.match(/^([A-Z][a-z]{2}) (\d{4})$/); return m ? new Date(`${m[1]} 1, ${m[2]}`) : null; };

(async () => {
  const { ASSETS, ALERTS, TODAY } = pageData();
  const admin = (await db.query(`select id from app.app_user where email = 'admin@landlogic.ai'`)).rows[0].id;
  const munis = Object.fromEntries((await db.query(`select id, name from ref.municipality`)).rows.map(r => [r.name, r.id]));
  const sources = Object.fromEntries((await db.query(`select id, code from ref.data_source`)).rows.map(r => [r.code, r.id]));
  if (!sources['prototype-illustrative']) {
    const r = await db.query(`insert into ref.data_source (code, name, kind, provider, notes) values ('prototype-illustrative', 'Prototype illustrative figures', 'manual', 'LandLogic', 'Market series, comparable sales and application dates chosen to be plausible; replace with real feeds') returning id`);
    sources['prototype-illustrative'] = r.rows[0].id;
  }
  const sheet = sources['landlogic-sample-sheet'], illus = sources['prototype-illustrative'], geocoder = sources['mapbox-geocoding'];
  const ids = {};
  for (const a of ASSETS) {
    const muni = munis[a.city]; if (!muni) throw new Error('unknown municipality ' + a.city);
    const found = await db.query(`select id from app.asset where owner_id = $1 and street_address = $2 and municipality_id = $3`, [admin, a.address, muni]);
    let id;
    if (found.rowCount) { id = found.rows[0].id; await db.query(`update app.asset set name = $2, postal_code = $3, asset_class = $4, sub_type = $5, location = ST_SetSRID(ST_Point($6, $7), 4326)::geography where id = $1`, [id, a.name, a.postal, a.cls, a.sub, a.lnglat[0], a.lnglat[1]]); }
    else { const r = await db.query(`insert into app.asset (owner_id, name, street_address, municipality_id, postal_code, asset_class, sub_type, location, geocode_accuracy, added_at) values ($1,$2,$3,$4,$5,$6,$7, ST_SetSRID(ST_Point($8, $9), 4326)::geography, 'rooftop', $10) returning id`, [admin, a.name, a.address, muni, a.postal, a.cls, a.sub, a.lnglat[0], a.lnglat[1], a.added]); id = r.rows[0].id; }
    ids[a.id] = id;

    // Manual snapshot from the sample sheet (one per run would pile up; keep exactly one manual snapshot)
    await db.query(`delete from app.asset_snapshot where asset_id = $1 and method = 'manual'`, [id]);
    const [sp] = a.op.secondary.split(' · ');
    await db.query(`insert into app.asset_snapshot (asset_id, taken_at, method, source_id, zoning_code, zoning_bylaw, zoning_note, op_designation, secondary_plan, heritage_status, heritage_note, flood_risk, flood_note, applications_500m, permits_500m, extra)
      values ($1, $2, 'manual', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14)`,
      [id, TODAY, sheet, a.zoning.code, a.zoning.bylaw, a.zoning.uses, a.op.designation, sp === 'None' ? null : sp, a.heritage.status, [a.heritage.hcd, a.heritage.nearest].filter(x => x && x !== 'None').join('; '), FLOOD[a.flood.level] || 'Unknown', a.flood.detail, a.appsTotal,
        JSON.stringify({ zoning_status: a.zoning.statusLabel, op_status: a.op.statusLabel, op_policy: a.op.chapter, hazards: a.hazards, market: { unit: a.market.unit, avg_price: a.market.avgPrice, yoy: a.market.yoy, cap_rate: a.market.cap, rent: a.market.rent, rent_note: a.market.rentSub, days_on_market: a.market.dom } })]);

    // Layers and alert rules
    await db.query(`delete from app.asset_layer where asset_id = $1`, [id]);
    for (const l of a.layers) await db.query(`insert into app.asset_layer (asset_id, layer_id, enabled) values ($1, $2, true)`, [id, l]);
    await db.query(`delete from app.alert_rule where asset_id = $1`, [id]);
    for (const [layer, r] of Object.entries(a.rules)) await db.query(`insert into app.alert_rule (asset_id, layer_id, trigger, radius_m, channels, frequency) values ($1,$2,$3,$4,$5,$6)`, [id, layer, r.trigger, r.radius === 'On property' ? 0 : parseInt(r.radius) * (r.radius.includes('km') ? 1000 : 1), r.channels, r.freq]);

    // Nearby applications (from the sheet); coordinates from the geocoded pins where the label matches
    for (let i = 0; i < a.apps.length; i++) {
      const x = a.apps[i]; const pin = a.map.pins.find(p => p.t === 'app' && p.lnglat && x.addr.toLowerCase().startsWith(p.l.toLowerCase().split(' ·')[0].slice(0, 8)) && (p.s || '').toLowerCase().includes(x.type.toLowerCase().includes('site plan') ? 'site plan' : x.type.toLowerCase().includes('official plan & zoning') ? 'opa & zba' : x.type.toLowerCase().includes('official') ? 'opa' : 'zba'));
      const d = parseMonthYear(x.date);
      const attrs = JSON.stringify({ linked_asset: id, severity: x.sev, distance_note: x.dist });
      await db.query(`insert into gis.development_application (municipality_id, address, application_type, status, status_date, description, geom, source_id, source_record_id, attributes)
        values ($1,$2,$3,$4,$5,$6, ${pin ? 'ST_SetSRID(ST_Point($9, $10), 4326)::geography' : 'null'}, $7, $8, ${pin ? '$11' : '$9'}::jsonb)
        on conflict (source_id, source_record_id) do update set status = excluded.status, status_date = excluded.status_date, description = excluded.description, geom = excluded.geom, attributes = excluded.attributes`,
        pin ? [muni, x.addr, x.type, x.status, d, x.desc, sheet, `${a.id}/app/${i}`, pin.lnglat[0], pin.lnglat[1], attrs] : [muni, x.addr, x.type, x.status, d, x.desc, sheet, `${a.id}/app/${i}`, attrs]);
    }
    // Comparable sales (illustrative) and the monthly series
    for (let i = 0; i < a.market.comps.length; i++) {
      const [addr, closed, price, perUnit] = a.market.comps[i]; const units = parseInt((addr.match(/(\d+) units/) || [])[1]) || null;
      await db.query(`insert into gis.sale (municipality_id, address, asset_class, closed_on, price, units, source_id, source_record_id, attributes) values ($1,$2,'Multi-residential',$3,$4,$5,$6,$7,$8) on conflict (source_id, source_record_id) do update set price = excluded.price, closed_on = excluded.closed_on, attributes = excluded.attributes`,
        [muni, addr.split(' ·')[0], parseMonthYear(closed), Number(price.replace(/[$,M]/g, '')) * 1e6, units, illus, `${a.id}/sale/${i}`, JSON.stringify({ per_unit: perUnit, illustrative: true, linked_asset: id, closed_label: closed })]);
    }
    for (let i = 0; i < a.market.local.length; i++) {
      const month = new Date(TODAY.getFullYear(), TODAY.getMonth() - (23 - i), 1);
      await db.query(`insert into gis.market_metric (municipality_id, asset_class, month, avg_price_per_unit, cap_rate_pct, days_on_market, source_id) values ($1,'Multi-residential',$2,$3,$4,$5,$6) on conflict (municipality_id, asset_class, month) do update set avg_price_per_unit = excluded.avg_price_per_unit`,
        [muni, month, a.market.local[i], parseFloat(a.market.cap), parseInt(a.market.dom), illus]);
    }
  }
  // Alerts
  await db.query(`delete from app.alert where asset_id = any($1::uuid[])`, [Object.values(ids)]);
  for (const x of ALERTS) await db.query(`insert into app.alert (asset_id, layer_id, severity, category, title, body, occurred_at, read_at) values ($1,$2,$3,$4,$5,$6,$7,$8)`, [ids[x.asset], x.layer, x.sev, x.cat, x.title, x.desc, parseWhen(x.when, TODAY.getFullYear()) || TODAY, x.unread ? null : TODAY]);

  // Link to parcels (no-op until parcels are imported) and refresh application counts
  const linked = await db.query(`update app.asset set parcel_id = gis.parcel_at(location) where parcel_id is null returning id, parcel_id`);
  const summary = await db.query(`select name, municipality, parcel_id is not null as has_parcel, zoning_code, flood_risk, applications_500m, unread_alerts from app.asset_dashboard order by name`);
  console.log(`Assets: ${Object.keys(ids).length} · newly linked to parcels: ${linked.rows.filter(r => r.parcel_id).length}`);
  console.table(summary.rows);
  await db.close();
})().catch(async e => { console.error('FAILED:', e.message); await db.close().catch(() => {}); process.exit(1); });
