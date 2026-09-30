// GET    /.netlify/functions/assets            → { ok, assets: [...], alerts: [...] }
// GET    /.netlify/functions/assets?id=<uuid>  → { ok, asset }
// DELETE /.netlify/functions/assets?id=<uuid>  → archives the asset (removes it from the watchlist)
const { json, bad, fail, isUuid, adminId, loadAssets, loadAlerts, db } = require('./_lib');

exports.handler = async (event) => {
  try {
    const owner = await adminId();
    const id = event.queryStringParameters && event.queryStringParameters.id;
    if (event.httpMethod === 'GET') {
      if (id) { if (!isUuid(id)) return bad('invalid id'); const [asset] = await loadAssets(owner, id); return asset ? json(200, { ok: true, asset }) : json(404, { ok: false, error: 'not found' }); }
      const [assets, alerts] = await Promise.all([loadAssets(owner), loadAlerts(owner)]);
      return json(200, { ok: true, assets, alerts, generatedAt: new Date().toISOString() });
    }
    if (event.httpMethod === 'DELETE') {
      if (!isUuid(id)) return bad('invalid id');
      const r = await db.query(`update app.asset set archived_at = now() where id = $1 and owner_id = $2 and archived_at is null returning id`, [id, owner]);
      return r.rowCount ? json(200, { ok: true }) : json(404, { ok: false, error: 'not found' });
    }
    return json(405, { ok: false, error: 'method not allowed' });
  } catch (e) { return fail(e); }
};
