// Shared helpers for the API functions: JSON responses, input checks, and the queries that build
// the asset shape the page renders. Every query is parameterised; nothing here logs credentials.
const db = require('../../scripts/db');

const ADMIN_EMAIL = 'admin@landlogic.ai'; // single hard-coded user for this version

const json = (status, body) => ({ statusCode: status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const bad = (msg) => json(400, { ok: false, error: msg });
const fail = (e) => json(500, { ok: false, error: String(e && e.message || e).replace(/password[^ ]*/gi, '[redacted]') });
const parseBody = (event) => { try { return JSON.parse(event.body || '{}'); } catch { return null; } };
const str = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;
const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function adminId() { const r = await db.query(`select id from app.app_user where email = $1`, [ADMIN_EMAIL]); if (!r.rowCount) throw new Error('admin user missing'); return r.rows[0].id; }

const APP_SEV = s => /OMB|OLT|Appeal/i.test(s) ? 'crit' : /Under Review|In Circulation|Recommendation/i.test(s) ? 'warn' : /Passed|Adopted|Approved/i.test(s) ? 'good' : 'info';
const fmtMonth = d => d ? new Date(d).toLocaleString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const money = n => '$' + Math.round(Number(n)).toLocaleString('en-CA');
function checkedLabel(ts) { if (!ts) return 'Not yet'; const d = new Date(ts), now = new Date(); const hm = d.toLocaleString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Toronto' }); return d.toDateString() === now.toDateString() ? `Today, ${hm}` : d.toLocaleString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' }) + `, ${hm}`; }
function ago(ts) { const ms = Date.now() - new Date(ts).getTime(); const days = Math.floor(ms / 86400000); if (days <= 0) return 'Today'; if (days === 1) return 'Yesterday'; if (days < 7) return `${days} days ago`; return new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' }); }
function whenLabel(ts) { return new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' }) + ' · ' + new Date(ts).toLocaleString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Toronto' }); }
const FLOOD_LEVEL = { Low: 1, Medium: 2, High: 3, Unknown: 1 };
const SEV_OF_LEVEL = { Low: 'good', Medium: 'warn', High: 'crit' };

// Builds the full page-shaped record for one or all of the owner's assets.
async function loadAssets(ownerId, onlyId) {
  const rows = (await db.query(`select * from app.asset_dashboard where owner_id = $1 ${onlyId ? 'and id = $2' : ''} order by added_at desc`, onlyId ? [ownerId, onlyId] : [ownerId])).rows;
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const [snaps, layers, rules, apps, sales, parcels, metrics, munis] = await Promise.all([
    db.query(`select distinct on (asset_id) * from app.asset_snapshot where asset_id = any($1::uuid[]) order by asset_id, taken_at desc`, [ids]),
    db.query(`select asset_id, layer_id from app.asset_layer where enabled and asset_id = any($1::uuid[])`, [ids]),
    db.query(`select * from app.alert_rule where asset_id = any($1::uuid[]) order by created_at`, [ids]),
    db.query(`select a.id as asset_id, d.id, d.address, d.application_type, d.status, d.status_date, d.description, d.file_number, d.attributes,
                     ST_X(d.geom::geometry) lng, ST_Y(d.geom::geometry) lat, round(ST_Distance(d.geom, a.location)) dist_m
              from app.asset a join gis.development_application d on (d.attributes->>'linked_asset' = a.id::text) or (d.geom is not null and ST_DWithin(d.geom, a.location, 500))
              where a.id = any($1::uuid[]) order by a.id, d.status_date desc nulls last`, [ids]),
    db.query(`select attributes->>'linked_asset' as asset_id, address, closed_on, price, units, attributes from gis.sale where attributes->>'linked_asset' = any($1::text[]) order by closed_on desc`, [ids.map(String)]),
    db.query(`select a.id as asset_id, p.id parcel_id, p.pin, p.arn, p.address parcel_address, p.land_use, round(p.area_m2) area_m2, ST_AsGeoJSON(p.geom::geometry, 6)::json geojson
              from app.asset a join gis.parcel p on p.id = a.parcel_id where a.id = any($1::uuid[])`, [ids]),
    db.query(`select municipality_id, month, avg_price_per_unit, cap_rate_pct, days_on_market from gis.market_metric where asset_class = 'Multi-residential' order by municipality_id, month`),
    db.query(`select id, name, upper_tier, conservation_authority, official_plan_name, zoning_bylaw_name from ref.municipality`),
  ]);
  const by = (rs, k) => rs.rows.reduce((m, r) => ((m[r[k]] = m[r[k]] || []).push(r), m), {});
  const snapBy = Object.fromEntries(snaps.rows.map(s => [s.asset_id, s])), layersBy = by(layers, 'asset_id'), rulesBy = by(rules, 'asset_id'), appsBy = by(apps, 'asset_id'), salesBy = by(sales, 'asset_id'), parcelBy = Object.fromEntries(parcels.rows.map(p => [p.asset_id, p])), metricsBy = by(metrics, 'municipality_id');
  const muniByName = Object.fromEntries(munis.rows.map(m => [m.name, m]));

  return rows.map(r => {
    const s = snapBy[r.id] || {}; const x = s.extra || {}; const mk = x.market || {}; const muni = muniByName[r.municipality] || {}; const parcel = parcelBy[r.id];
    const series = (metricsBy[muni.id] || []).slice(-24); const local = series.map(m => Number(m.avg_price_per_unit)); while (local.length < 24) local.unshift(local[0] || 0);
    const city = local.map(v => Math.round(v * 0.97 / 500) * 500); // municipality average placeholder until a city-wide series is loaded
    const last = local[23] || 0, prev = local[11] || last; const yoy = prev ? (last / prev - 1) * 100 : 0;
    const appList = (appsBy[r.id] || []).map(d => ({ addr: d.address, type: d.application_type, status: d.status, sev: APP_SEV(d.status), date: fmtMonth(d.status_date), desc: d.description || '', dist: d.dist_m != null ? `${d.dist_m} m` : (d.attributes && d.attributes.distance_note) || '', ref: d.file_number || '', lnglat: d.lng != null ? [d.lng, d.lat] : null }));
    const flood = r.flood_risk || 'Unknown';
    return {
      id: r.id, name: r.name, address: r.street_address, city: r.municipality, province: r.province, postal: r.postal_code || '', cls: r.asset_class, sub: r.sub_type || '',
      added: new Date(r.added_at).toISOString().slice(0, 10), checked: checkedLabel(r.last_checked_at), lnglat: [r.lng, r.lat],
      parcel: parcel ? { id: parcel.parcel_id, pin: parcel.pin, arn: parcel.arn, address: parcel.parcel_address, land_use: parcel.land_use, area_m2: Number(parcel.area_m2), geojson: parcel.geojson } : null,
      zoning: { code: r.zoning_code || 'Not available', bylaw: s.zoning_bylaw || muni.zoning_bylaw_name || '', uses: s.zoning_note || '', height: '—', density: '—', amended: '—', status: /Unavailable|Not available/.test(r.zoning_code || '') ? 'warn' : 'good', statusLabel: x.zoning_status || (r.zoning_code ? 'No pending changes' : 'Layer not loaded') },
      op: { designation: r.op_designation || 'Not available', plan: muni.official_plan_name || '', secondary: r.secondary_plan || 'None', chapter: x.op_policy || '', status: x.op_status && !/No pending|Stable|force|Baseline/.test(x.op_status) ? 'warn' : 'good', statusLabel: x.op_status || 'No pending changes' },
      heritage: { status: r.heritage_status || 'Not available', hcd: (r.heritage_note || '').split('; ')[0] || 'None', nearest: (r.heritage_note || '').split('; ').slice(1).join('; ') || (r.heritage_note || 'None'), level: /No data/.test(r.heritage_status || '') ? 'neutral' : r.heritage_note ? 'warn' : 'good' },
      flood: { status: (r.flood_note || '').split('.')[0] || flood, authority: muni.conservation_authority || '', level: FLOOD_LEVEL[flood] || 1, detail: r.flood_note || '' },
      env: { status: 'Not yet screened', level: 'neutral' },
      appsTotal: Number(r.applications_500m || appList.length), apps: appList, permits: [],
      pipeline: { active: Number(r.applications_500m || appList.length), appealed: appList.filter(a => a.sev === 'crit').length, approved: appList.filter(a => a.sev === 'good').length },
      hazards: x.hazards || [['Erosion hazard', 'good', 'None mapped'], ['Rail / pipeline setback', 'good', 'None within 300 m'], ['Noise & vibration', 'good', 'Local streets']],
      market: { unit: '$/unit', unitShort: '/unit', metric: 'Avg. sale · multi-res, 5 km', radius: '5 km', local, city, avgPrice: money(last), yoy: (yoy < 0 ? '−' : '+') + Math.abs(yoy).toFixed(1) + '%', dom: mk.days_on_market || '—', rent: mk.rent || '—', rentSub: mk.rent_note || '', cap: mk.cap_rate || '—',
        comps: (salesBy[r.id] || []).map(c => [c.address + (c.units ? ` · ${c.units} units` : ''), (c.attributes && c.attributes.closed_label) || fmtMonth(c.closed_on), '$' + (Number(c.price) / 1e6).toFixed(1) + 'M', (c.attributes && c.attributes.per_unit) || money(Number(c.price) / (c.units || 1))]) },
      layers: (layersBy[r.id] || []).map(l => l.layer_id),
      rules: Object.fromEntries((rulesBy[r.id] || []).map(q => [q.layer_id, { id: q.id, trigger: q.trigger, radius: q.radius_m === 0 ? 'On property' : q.radius_m >= 1000 ? `${q.radius_m / 1000} km` : `${q.radius_m} m`, channels: q.channels, freq: q.frequency }])),
      map: { seed: 1, angle: 0, muni: r.municipality, streets: [], pins: appList.filter(a => a.lnglat).map(a => ({ t: 'app', lnglat: a.lnglat, l: a.addr, s: `${a.type} · ${a.status}`, hot: a.sev === 'crit' })) },
      unread: Number(r.unread_alerts || 0), snapshotAt: s.taken_at, snapshotMethod: s.method, floodSev: SEV_OF_LEVEL[flood] || 'good',
    };
  });
}

async function loadAlerts(ownerId) {
  const r = await db.query(`select al.* from app.alert al join app.asset a on a.id = al.asset_id where a.owner_id = $1 and a.archived_at is null order by al.occurred_at desc limit 200`, [ownerId]);
  const TAB = { planning: 'planning', development: 'development', risk: 'risk', market: 'market' };
  return r.rows.map(x => ({ id: x.id, asset: x.asset_id, layer: x.layer_id, cat: x.category, sev: x.severity, when: whenLabel(x.occurred_at), ago: ago(x.occurred_at), title: x.title, desc: x.body || '', unread: !x.read_at, tab: TAB[x.category] || 'activity' }));
}

module.exports = { db, json, bad, fail, parseBody, str, isUuid, adminId, loadAssets, loadAlerts };
