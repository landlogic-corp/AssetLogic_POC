// POST /.netlify/functions/monitoring
//   { action: 'layer', assetId, layerId, enabled }                       toggle a monitored layer
//   { action: 'rule',  assetId, layerId, rule: {trigger, radius, channels, freq} | null }   set or remove an alert rule
//   { action: 'read',  alertId }  or  { action: 'read', all: true }      mark alerts read
//   { action: 'snapshot', assetId }                                     re-run the spatial check for one asset
const { json, bad, fail, parseBody, str, isUuid, adminId, db } = require('./_lib');
const LAYER_IDS = ['zoning', 'op', 'sp', 'coa', 'apps', 'permits', 'transit', 'heritage', 'flood', 'env', 'sales', 'rent', 'mpac'];
const RADIUS = { 'On property': 0, '250 m': 250, '500 m': 500, '1 km': 1000, '2 km': 2000 };
const CHANNELS = ['In-app', 'Email', 'SMS', 'Teams'];
const FREQ = ['Instantly', 'Daily digest (7:00 am)', 'Weekly digest (Monday)'];

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method not allowed' });
    const b = parseBody(event); if (!b) return bad('invalid JSON');
    const owner = await adminId();
    const owns = async id => isUuid(id) && (await db.query(`select 1 from app.asset where id = $1 and owner_id = $2 and archived_at is null`, [id, owner])).rowCount > 0;

    if (b.action === 'layer') {
      if (!(await owns(b.assetId)) || !LAYER_IDS.includes(b.layerId)) return bad('unknown asset or layer');
      await db.query(`insert into app.asset_layer (asset_id, layer_id, enabled) values ($1,$2,$3) on conflict (asset_id, layer_id) do update set enabled = excluded.enabled`, [b.assetId, b.layerId, !!b.enabled]);
      if (!b.enabled) await db.query(`delete from app.alert_rule where asset_id = $1 and layer_id = $2`, [b.assetId, b.layerId]);
      return json(200, { ok: true });
    }
    if (b.action === 'rule') {
      if (!(await owns(b.assetId)) || !LAYER_IDS.includes(b.layerId)) return bad('unknown asset or layer');
      await db.query(`delete from app.alert_rule where asset_id = $1 and layer_id = $2`, [b.assetId, b.layerId]);
      if (b.rule) {
        const r = b.rule; const trigger = str(r.trigger, 80); const radius = RADIUS[r.radius]; const channels = Array.isArray(r.channels) ? r.channels.filter(c => CHANNELS.includes(c)) : [];
        if (!trigger || radius === undefined || !channels.length || !FREQ.includes(r.freq)) return bad('incomplete rule');
        const ins = await db.query(`insert into app.alert_rule (asset_id, layer_id, trigger, radius_m, channels, frequency) values ($1,$2,$3,$4,$5,$6) returning id`, [b.assetId, b.layerId, trigger, radius, channels, r.freq]);
        return json(200, { ok: true, id: ins.rows[0].id });
      }
      return json(200, { ok: true });
    }
    if (b.action === 'read') {
      if (b.all) { await db.query(`update app.alert al set read_at = now() from app.asset a where a.id = al.asset_id and a.owner_id = $1 and al.read_at is null`, [owner]); return json(200, { ok: true }); }
      const id = Number(b.alertId); if (!Number.isInteger(id)) return bad('alertId required');
      await db.query(`update app.alert al set read_at = now() from app.asset a where a.id = al.asset_id and a.owner_id = $1 and al.id = $2 and al.read_at is null`, [owner, id]);
      return json(200, { ok: true });
    }
    if (b.action === 'snapshot') {
      if (!(await owns(b.assetId))) return bad('unknown asset');
      const r = await db.query(`select app.snapshot_asset($1) as id`, [b.assetId]);
      return json(200, { ok: true, snapshotId: Number(r.rows[0].id) });
    }
    return bad('unknown action');
  } catch (e) { return fail(e); }
};
