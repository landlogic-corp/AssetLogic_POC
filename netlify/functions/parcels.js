// GET /.netlify/functions/parcels?bbox=minLng,minLat,maxLng,maxLat
// Returns the parcels in the current map view as GeoJSON. The box is capped so a city can never be
// requested in one call; the page only asks at street-level zoom.
const { json, bad, fail, db } = require('./_lib');
const MAX_SPAN_DEG = 0.03; // ~2.4 km east-west at Toronto's latitude

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const parts = String(q.bbox || '').split(',').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return bad('bbox must be minLng,minLat,maxLng,maxLat');
    const [minLng, minLat, maxLng, maxLat] = parts;
    if (maxLng <= minLng || maxLat <= minLat) return bad('bbox is empty');
    if (maxLng - minLng > MAX_SPAN_DEG || maxLat - minLat > MAX_SPAN_DEG) return json(200, { ok: true, tooWide: true, type: 'FeatureCollection', features: [] });
    const r = await db.query(`select id, pin, address, geojson from gis.parcels_in_bbox($1, $2, $3, $4, 4000)`, [minLng, minLat, maxLng, maxLat]);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/geo+json; charset=utf-8', 'cache-control': 'public, max-age=300', 'netlify-cdn-cache-control': 'public, max-age=3600, durable' },
      body: JSON.stringify({ ok: true, type: 'FeatureCollection', features: r.rows.map(p => ({ type: 'Feature', id: Number(p.id), properties: { id: Number(p.id), pin: p.pin, address: p.address }, geometry: p.geojson })) }),
    };
  } catch (e) { return fail(e); }
};
