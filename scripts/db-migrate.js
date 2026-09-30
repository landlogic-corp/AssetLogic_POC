// Creates the schema from docs/schema.sql (once) and seeds reference data (idempotent).
// Usage: node --use-system-ca scripts/db-migrate.js
const fs = require('fs');
const path = require('path');
const db = require('./db');

const MUNICIPALITIES = [
  // name, upper tier, conservation authority, official plan, zoning by-law
  ['Toronto', 'City of Toronto (single-tier)', 'Toronto and Region Conservation Authority (TRCA)', 'City of Toronto Official Plan', 'Zoning By-law 569-2013 / former City of Toronto By-law 438-86'],
  ['Mississauga', 'Region of Peel', 'Credit Valley Conservation (CVC)', 'Mississauga Official Plan', 'Mississauga Zoning By-law 0225-2007'],
  ['Waterloo', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', 'City of Waterloo Official Plan', 'City of Waterloo Zoning By-law 2018-050'],
  ['Kitchener', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', 'City of Kitchener Official Plan (2014)', 'City of Kitchener Zoning By-law 2019-051'],
  ['Cambridge', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', 'City of Cambridge Official Plan', 'City of Cambridge Zoning By-law 150-85'],
  ['Woolwich', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', 'Township of Woolwich Official Plan', 'Township of Woolwich Zoning By-law 55-86'],
  ['Wilmot', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', 'Township of Wilmot Official Plan', 'Township of Wilmot Zoning By-law 2006-024'],
  ['Wellesley', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', 'Township of Wellesley Official Plan', 'Township of Wellesley Zoning By-law'],
  ['North Dumfries', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', 'Township of North Dumfries Official Plan', 'Township of North Dumfries Zoning By-law'],
  ['Region of Waterloo', 'Region of Waterloo', 'Grand River Conservation Authority (GRCA)', null, null], // parcels with no lower-tier municipality (road allowances, rail corridors)
];
const SOURCES = [
  ['toronto-property-boundaries', 'Toronto Property Boundaries', 'file', 'City of Toronto', 'Parcel fabric (F_TYPE common/condo/reserve); no address or PIN'],
  ['mississauga-parcels', 'Mississauga Parcels', 'file', 'City of Mississauga', 'Parcel fabric with CITY_PIN and GIS_AREA; no address'],
  ['waterloo-region-parcels', 'Waterloo Region Parcels', 'file', 'Region of Waterloo', 'Parcel fabric with roll number, address, municipality, tax class, legal description'],
  ['mapbox-geocoding', 'Mapbox Geocoding v6', 'api', 'Mapbox', 'Address → coordinates for assets'],
  ['landlogic-sample-sheet', 'LandLogic sample apartment sheet (Sept 2026)', 'manual', 'LandLogic', 'Zoning, OP, secondary plan, heritage, flood and applications for the first eight assets'],
];
const LAYERS = [
  ['zoning', 'Planning Policies', 'Zoning by-law', 'Zone category, permitted uses, height & density', 1],
  ['op', 'Planning Policies', 'Official Plan designation', 'Land use designation and policies', 2],
  ['sp', 'Planning Policies', 'Secondary plans', 'Area-specific plans and precinct policies', 3],
  ['coa', 'Planning Policies', 'Committee of Adjustment', 'Minor variances and consents', 4],
  ['apps', 'Development Activities', 'Development applications', 'ZBA, OPA, site plan, plan of subdivision', 5],
  ['permits', 'Development Activities', 'Building permits', 'Issued and applied-for permits', 6],
  ['transit', 'Development Activities', 'Transit & infrastructure', 'Transit projects, road works, EA studies', 7],
  ['heritage', 'Heritage', 'Heritage register', 'Listed & designated properties, HCDs', 8],
  ['flood', 'Hazards & Conservation', 'Flood hazard', 'Conservation authority regulated areas', 9],
  ['env', 'Hazards & Conservation', 'Environmental records', 'Records of site condition, contaminated sites', 10],
  ['sales', 'Market', 'Sales comparables', 'Registered transfers, same asset class', 11],
  ['rent', 'Market', 'Rental rates', 'Asking rents, vacancy', 12],
  ['mpac', 'Market', 'MPAC assessment & tax', 'Assessed value, property tax rate', 13],
];
const ADMIN_USER = ['admin@landlogic.ai', 'LandLogic admin', 'LandLogic'];

(async () => {
  const exists = await db.query(`select 1 from pg_namespace where nspname = 'app'`);
  if (exists.rowCount) console.log('Schema already exists; skipping DDL.');
  else {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'schema.sql'), 'utf8');
    const t = Date.now(); await db.query(sql); console.log(`Schema created from docs/schema.sql in ${Date.now() - t} ms`);
  }
  for (const m of MUNICIPALITIES) await db.query(`insert into ref.municipality (name, province, upper_tier, conservation_authority, official_plan_name, zoning_bylaw_name) values ($1,'ON',$2,$3,$4,$5) on conflict (name, province) do update set upper_tier = excluded.upper_tier, conservation_authority = excluded.conservation_authority, official_plan_name = excluded.official_plan_name, zoning_bylaw_name = excluded.zoning_bylaw_name`, m);
  for (const s of SOURCES) await db.query(`insert into ref.data_source (code, name, kind, provider, notes) values ($1,$2,$3,$4,$5) on conflict (code) do update set name = excluded.name, notes = excluded.notes`, s);
  for (const l of LAYERS) await db.query(`insert into app.layer (id, group_name, name, description, sort_order) values ($1,$2,$3,$4,$5) on conflict (id) do update set group_name = excluded.group_name, name = excluded.name, description = excluded.description, sort_order = excluded.sort_order`, l);
  await db.query(`insert into app.app_user (email, display_name, organisation) values ($1,$2,$3) on conflict (email) do nothing`, ADMIN_USER);
  const counts = await db.query(`select (select count(*) from ref.municipality) m, (select count(*) from ref.data_source) s, (select count(*) from app.layer) l, (select count(*) from app.app_user) u, (select count(*) from gis.parcel) p, (select count(*) from app.asset) a`);
  const c = counts.rows[0]; console.log(`Seeded: ${c.m} municipalities, ${c.s} data sources, ${c.l} layers, ${c.u} user(s). Parcels: ${c.p}. Assets: ${c.a}.`);
  const tables = await db.query(`select table_schema, count(*) from information_schema.tables where table_schema in ('ref','gis','app') group by 1 order by 1`);
  console.log('Tables:', tables.rows.map(r => `${r.table_schema}=${r.count}`).join(', '));
  await db.close();
})().catch(async e => { console.error('FAILED:', e.message, e.position ? `(at position ${e.position})` : ''); await db.close().catch(() => {}); process.exit(1); });
