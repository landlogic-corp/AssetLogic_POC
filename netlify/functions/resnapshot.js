// Scheduled daily (see netlify.toml): re-runs app.snapshot_asset() for every active asset and turns
// differences between the new and previous snapshot into alerts. Also callable by hand:
//   POST /.netlify/functions/resnapshot   (no body)
const { json, fail, db } = require('./_lib');

const FIELDS = [
  ['zoning_code', 'zoning', 'planning', 'crit', 'Zoning changed'],
  ['op_designation', 'op', 'planning', 'crit', 'Official Plan designation changed'],
  ['secondary_plan', 'sp', 'planning', 'warn', 'Secondary plan changed'],
  ['heritage_status', 'heritage', 'planning', 'warn', 'Heritage status changed'],
  ['flood_risk', 'flood', 'risk', 'warn', 'Flood risk changed'],
  ['applications_500m', 'apps', 'development', 'warn', 'Development applications within 500 m changed'],
  ['permits_500m', 'permits', 'development', 'info', 'Building permits within 500 m changed'],
];

exports.handler = async () => {
  const started = Date.now();
  try {
    const assets = (await db.query(`select id, name from app.asset where archived_at is null`)).rows;
    let alerts = 0;
    for (const a of assets) {
      const prev = (await db.query(`select * from app.asset_snapshot where asset_id = $1 order by taken_at desc limit 1`, [a.id])).rows[0];
      const snapId = (await db.query(`select app.snapshot_asset($1) as id`, [a.id])).rows[0].id;
      const next = (await db.query(`select * from app.asset_snapshot where id = $1`, [snapId])).rows[0];
      if (!prev) continue;
      const enabled = new Set((await db.query(`select layer_id from app.asset_layer where asset_id = $1 and enabled`, [a.id])).rows.map(r => r.layer_id));
      for (const [field, layer, category, severity, title] of FIELDS) {
        const before = prev[field], after = next[field];
        if (String(before ?? '') === String(after ?? '') || !enabled.has(layer)) continue;
        await db.query(`insert into app.alert (asset_id, layer_id, severity, category, title, body, snapshot_id) values ($1,$2,$3,$4,$5,$6,$7)`,
          [a.id, layer, severity, category, title, `${a.name}: ${field.replace(/_/g, ' ')} changed from "${before ?? 'none'}" to "${after ?? 'none'}".`, snapId]);
        alerts++;
      }
    }
    return json(200, { ok: true, assets: assets.length, alerts, ms: Date.now() - started });
  } catch (e) { return fail(e); }
};
