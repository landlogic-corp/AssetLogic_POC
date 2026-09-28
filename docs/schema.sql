-- AssetLogic · database schema (v2, DRAFT for review; nothing has been created yet)
-- Target: Google Cloud SQL for PostgreSQL 16 with PostGIS.
--
-- Three schemas:
--   ref  · reference data and provenance: municipalities, data sources, ingest runs
--   gis  · spatial data: whole-city parcels and the policy/hazard layers assets are checked against
--   app  · the product: users, monitored assets, their fact snapshots, layers, alert rules, alerts
--
-- Design rules
--   * Every gis and app record that comes from outside carries source_id + source_record_id +
--     source_updated_at, so the same tables can be filled by file imports today and by the LandLogic
--     database API / MCP later without changing shape.
--   * Every gis table has an `attributes jsonb` column for source columns we do not model yet.
--   * Geometry is stored as geography(…, 4326) (WGS84). Distance queries are in metres.
--   * Adding a property live = geocode → find parcel → app.snapshot_asset() spatially joins the
--     parcel against the gis layers and writes an app.asset_snapshot row. The page reads snapshots.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS gis;
CREATE SCHEMA IF NOT EXISTS app;

-- =============================================================================
-- ref · reference & provenance
-- =============================================================================
CREATE TABLE ref.municipality (
  id                      serial PRIMARY KEY,
  name                    text NOT NULL,                  -- 'Toronto', 'Waterloo'
  province                char(2) NOT NULL DEFAULT 'ON',
  upper_tier              text,                           -- 'Region of Waterloo', 'City of Toronto (single-tier)'
  conservation_authority  text,                           -- 'Grand River Conservation Authority (GRCA)'
  official_plan_name      text,
  zoning_bylaw_name       text,
  boundary                geography(MultiPolygon, 4326),  -- optional; lets us tell which municipality a point is in
  UNIQUE (name, province)
);

-- Where data comes from. One row per feed: a parcel file, a municipal open-data API, the LandLogic DB API/MCP.
CREATE TABLE ref.data_source (
  id           serial PRIMARY KEY,
  code         text NOT NULL UNIQUE,                      -- 'toronto-parcels-2026', 'landlogic-db-api', 'waterloo-zoning-opendata'
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('file', 'api', 'mcp', 'manual')),
  provider     text,                                      -- 'LandLogic', 'City of Toronto', 'Region of Waterloo'
  base_url     text,
  licence      text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Log of every import or sync, so we can answer "how fresh is this layer?" and re-run safely.
CREATE TABLE ref.ingest_run (
  id            bigserial PRIMARY KEY,
  source_id     int NOT NULL REFERENCES ref.data_source(id),
  target_table  text NOT NULL,                            -- 'gis.parcel'
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  rows_written  bigint DEFAULT 0,
  message       text,
  parameters    jsonb                                     -- file name, bbox, since-date, etc.
);

-- =============================================================================
-- gis · spatial layers
-- =============================================================================

-- Whole-city parcel fabric. This is the anchor: assets link to a parcel, and facts are derived from
-- what the parcel intersects.
CREATE TABLE gis.parcel (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  pin                text,                                -- Ontario PIN (9 digits) when present
  arn                text,                                -- assessment roll number when present
  address            text,                                -- civic address as published
  street_number      text,
  street_name        text,
  unit               text,
  postal_code        text,
  land_use           text,                                -- source land-use / property code if provided
  area_m2            numeric(14, 2),
  frontage_m         numeric(10, 2),
  geom               geography(MultiPolygon, 4326) NOT NULL,
  centroid           geography(Point, 4326),
  attributes         jsonb NOT NULL DEFAULT '{}',         -- every other column from the source file
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,                                -- feature id / OBJECTID in the source
  source_updated_at  timestamptz,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX parcel_geom_gix     ON gis.parcel USING gist (geom);
CREATE INDEX parcel_centroid_gix ON gis.parcel USING gist (centroid);
CREATE INDEX parcel_pin_ix       ON gis.parcel (pin) WHERE pin IS NOT NULL;
CREATE INDEX parcel_muni_ix      ON gis.parcel (municipality_id);
CREATE INDEX parcel_address_ix   ON gis.parcel USING gin (to_tsvector('simple', coalesce(address, '')));

-- Zoning polygons (one row per zone polygon, as published by the municipality).
CREATE TABLE gis.zoning_area (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  zone_code          text NOT NULL,                       -- 'RMU-40', 'RES-7', 'RA4-42', 'R (d0.6) (x820)'
  zone_category      text,                                -- 'Residential Mixed-Use'
  bylaw              text,                                -- 'Zoning By-law 2018-050'
  exception_ref      text,                                -- exception / site-specific number
  permitted_uses     text,
  max_height_m       numeric(8, 2),
  max_density        text,                                -- FSI or units/ha as published
  geom               geography(MultiPolygon, 4326) NOT NULL,
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  valid_from         date,
  valid_to           date,                                -- NULL = current
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX zoning_geom_gix ON gis.zoning_area USING gist (geom);

-- Official Plan land-use designations.
CREATE TABLE gis.official_plan_area (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  designation        text NOT NULL,                       -- 'Mixed Use Areas', 'High Rise Residential'
  plan_name          text,
  policy_ref         text,
  geom               geography(MultiPolygon, 4326) NOT NULL,
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  valid_from         date,
  valid_to           date,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX op_geom_gix ON gis.official_plan_area USING gist (geom);

-- Secondary plan / area-specific plan boundaries.
CREATE TABLE gis.secondary_plan_area (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  name               text NOT NULL,                       -- 'Garrison Common North', 'Central Frederick Neighbourhood Plan'
  plan_number        text,                                -- '14'
  status             text,                                -- 'In force', 'Under review', 'Proposed'
  geom               geography(MultiPolygon, 4326) NOT NULL,
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX sp_geom_gix ON gis.secondary_plan_area USING gist (geom);

-- Heritage: individual properties (points or parcels) and districts (polygons) in one table.
CREATE TABLE gis.heritage_feature (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  feature_type       text NOT NULL CHECK (feature_type IN ('property', 'district')),
  name               text,
  address            text,
  status             text NOT NULL,                       -- 'Listed', 'Designated Part IV', 'HCD Part V', 'Potential HCD', 'Cultural Heritage Landscape'
  bylaw              text,
  geom               geography(Geometry, 4326) NOT NULL,   -- Point for properties, MultiPolygon for districts
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX heritage_geom_gix ON gis.heritage_feature USING gist (geom);

-- Natural hazards: floodplains, conservation-authority regulated areas, erosion hazards.
CREATE TABLE gis.hazard_area (
  id                 bigserial PRIMARY KEY,
  authority          text NOT NULL,                       -- 'GRCA', 'TRCA', 'CVC'
  hazard_type        text NOT NULL,                       -- 'regulatory floodplain', 'regulated area', 'erosion hazard', 'flood fringe'
  name               text,
  geom               geography(MultiPolygon, 4326) NOT NULL,
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX hazard_geom_gix ON gis.hazard_area USING gist (geom);

-- Development applications (points; matched to assets by distance).
CREATE TABLE gis.development_application (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  address            text NOT NULL,
  application_type   text NOT NULL,                       -- 'Zoning By-law Amendment', 'Site Plan', 'Official Plan Amendment', ...
  status             text NOT NULL,                       -- as published: 'Under Review', 'Under OMB Appeal', 'Adopted', ...
  status_date        date,
  description        text,
  file_number        text,
  applicant          text,
  proposed_units     int,
  proposed_storeys   int,
  geom               geography(Point, 4326),
  parcel_id          bigint REFERENCES gis.parcel(id),
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX devapp_geom_gix ON gis.development_application USING gist (geom);

-- Keeps every status a file has had, so "status changed" alerts are exact.
CREATE TABLE gis.development_application_status (
  id               bigserial PRIMARY KEY,
  application_id   bigint NOT NULL REFERENCES gis.development_application(id) ON DELETE CASCADE,
  status           text NOT NULL,
  observed_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devapp_status_ix ON gis.development_application_status (application_id, observed_at DESC);

CREATE TABLE gis.building_permit (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  address            text NOT NULL,
  permit_type        text NOT NULL,                       -- 'Building', 'Demolition'
  status             text NOT NULL,                       -- 'Applied', 'Issued', 'Closed'
  status_date        date,
  description        text,
  permit_number      text,
  geom               geography(Point, 4326),
  parcel_id          bigint REFERENCES gis.parcel(id),
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX permit_geom_gix ON gis.building_permit USING gist (geom);

-- Registered sales (comparables).
CREATE TABLE gis.sale (
  id                 bigserial PRIMARY KEY,
  municipality_id    int NOT NULL REFERENCES ref.municipality(id),
  address            text NOT NULL,
  asset_class        text NOT NULL,                       -- 'Residential', 'Multi-residential', 'Commercial', ...
  closed_on          date NOT NULL,
  price              numeric(14, 2) NOT NULL,
  units              int,
  floor_area_sqft    numeric(12, 1),
  land_area_m2       numeric(14, 2),
  geom               geography(Point, 4326),
  parcel_id          bigint REFERENCES gis.parcel(id),
  attributes         jsonb NOT NULL DEFAULT '{}',
  source_id          int NOT NULL REFERENCES ref.data_source(id),
  source_record_id   text,
  source_updated_at  timestamptz,
  ingested_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX sale_geom_gix ON gis.sale USING gist (geom);

-- Monthly market series per municipality and asset class (KPI and chart).
CREATE TABLE gis.market_metric (
  municipality_id     int NOT NULL REFERENCES ref.municipality(id),
  asset_class         text NOT NULL,
  month               date NOT NULL,                      -- first day of the month
  avg_price_per_unit  numeric(12, 2),
  avg_price_per_sqft  numeric(10, 2),
  avg_rent_1bed       numeric(10, 2),
  cap_rate_pct        numeric(5, 2),
  days_on_market      int,
  source_id           int REFERENCES ref.data_source(id),
  PRIMARY KEY (municipality_id, asset_class, month)
);

-- =============================================================================
-- app · the product
-- =============================================================================
CREATE TABLE app.app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  display_name  text,
  organisation  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A monitored property. Linked to a parcel when one is found; location always set (geocode or centroid).
CREATE TABLE app.asset (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES app.app_user(id),
  name             text NOT NULL,                         -- 'The Carrick'
  street_address   text NOT NULL,                         -- '194 Erb Street W'
  municipality_id  int NOT NULL REFERENCES ref.municipality(id),
  postal_code      text,
  asset_class      text NOT NULL,                         -- 'Residential', 'Mixed-use', 'Commercial', 'Industrial', 'Agricultural'
  sub_type         text,                                  -- 'Purpose-built rental apartment'
  parcel_id        bigint REFERENCES gis.parcel(id),
  location         geography(Point, 4326) NOT NULL,
  geocode_accuracy text,                                  -- 'rooftop', 'parcel', 'street', 'manual'
  added_at         timestamptz NOT NULL DEFAULT now(),
  last_checked_at  timestamptz,
  archived_at      timestamptz
);
CREATE INDEX asset_location_gix ON app.asset USING gist (location);
CREATE INDEX asset_owner_ix     ON app.asset (owner_id) WHERE archived_at IS NULL;

-- The facts shown for an asset, as of a moment in time. A new row is written whenever a check runs;
-- comparing the two latest rows is what produces "changed" alerts. Each fact records how it was
-- obtained so a value from the LandLogic API and a value from a spatial join are distinguishable.
CREATE TABLE app.asset_snapshot (
  id                 bigserial PRIMARY KEY,
  asset_id           uuid NOT NULL REFERENCES app.asset(id) ON DELETE CASCADE,
  taken_at           timestamptz NOT NULL DEFAULT now(),
  method             text NOT NULL CHECK (method IN ('spatial', 'api', 'mcp', 'file', 'manual')),
  source_id          int REFERENCES ref.data_source(id),
  zoning_code        text,
  zoning_bylaw       text,
  zoning_note        text,
  zoning_area_id     bigint REFERENCES gis.zoning_area(id),
  op_designation     text,
  op_area_id         bigint REFERENCES gis.official_plan_area(id),
  secondary_plan     text,
  secondary_plan_id  bigint REFERENCES gis.secondary_plan_area(id),
  heritage_status    text,                                -- 'No designations on site', 'Listed', ...
  heritage_note      text,                                -- nearby districts / properties within 100 m
  flood_risk         text CHECK (flood_risk IN ('Low', 'Medium', 'High', 'Unknown')),
  flood_note         text,
  applications_500m  int,
  permits_500m       int,
  extra              jsonb NOT NULL DEFAULT '{}'          -- any further fact the LandLogic API returns
);
CREATE INDEX asset_snapshot_ix ON app.asset_snapshot (asset_id, taken_at DESC);

CREATE TABLE app.layer (
  id           text PRIMARY KEY,                          -- 'zoning', 'op', 'sp', 'coa', 'apps', 'permits', 'transit', 'heritage', 'flood', 'env', 'sales', 'rent', 'mpac'
  group_name   text NOT NULL,
  name         text NOT NULL,
  description  text,
  sort_order   int NOT NULL
);

CREATE TABLE app.asset_layer (
  asset_id  uuid NOT NULL REFERENCES app.asset(id) ON DELETE CASCADE,
  layer_id  text NOT NULL REFERENCES app.layer(id),
  enabled   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (asset_id, layer_id)
);

CREATE TABLE app.alert_rule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid NOT NULL REFERENCES app.asset(id) ON DELETE CASCADE,
  layer_id    text NOT NULL REFERENCES app.layer(id),
  trigger     text NOT NULL,                              -- 'Application submitted', 'Amendment appealed (OLT)', ...
  radius_m    int  NOT NULL DEFAULT 500,                  -- 0 = on the property only
  channels    text[] NOT NULL DEFAULT '{In-app,Email}',
  frequency   text NOT NULL DEFAULT 'Instantly',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_rule_asset_ix ON app.alert_rule (asset_id);

CREATE TABLE app.alert (
  id              bigserial PRIMARY KEY,
  asset_id        uuid NOT NULL REFERENCES app.asset(id) ON DELETE CASCADE,
  layer_id        text NOT NULL REFERENCES app.layer(id),
  rule_id         uuid REFERENCES app.alert_rule(id) ON DELETE SET NULL,
  severity        text NOT NULL CHECK (severity IN ('info', 'good', 'warn', 'crit')),
  category        text NOT NULL,                          -- 'planning', 'development', 'risk', 'market'
  title           text NOT NULL,
  body            text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz,
  application_id  bigint REFERENCES gis.development_application(id),
  permit_id       bigint REFERENCES gis.building_permit(id),
  sale_id         bigint REFERENCES gis.sale(id),
  snapshot_id     bigint REFERENCES app.asset_snapshot(id)
);
CREATE INDEX alert_asset_ix ON app.alert (asset_id, occurred_at DESC);

-- =============================================================================
-- Derivation: the "add a property live" mechanism
-- =============================================================================

-- Find the parcel under a point (or the nearest within 30 m when the point sits on a road).
CREATE OR REPLACE FUNCTION gis.parcel_at(p geography(Point, 4326))
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT id FROM gis.parcel
  WHERE ST_Intersects(geom, p)
  UNION ALL
  (SELECT id FROM gis.parcel WHERE ST_DWithin(geom, p, 30) ORDER BY ST_Distance(geom, p) LIMIT 1)
  LIMIT 1;
$$;

-- Build a snapshot for an asset by spatially joining its parcel (or location) against the gis layers.
-- Returns the new snapshot id. Fields stay NULL when a layer has no data for that municipality yet;
-- the page shows those as "Not available" rather than inventing a value.
CREATE OR REPLACE FUNCTION app.snapshot_asset(p_asset uuid)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  a        app.asset%ROWTYPE;
  g        geography;
  snap_id  bigint;
  z        gis.zoning_area%ROWTYPE;
  o        gis.official_plan_area%ROWTYPE;
  s        gis.secondary_plan_area%ROWTYPE;
  h_on     text;
  h_near   text;
  f_risk   text;
  f_note   text;
BEGIN
  SELECT * INTO a FROM app.asset WHERE id = p_asset;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset % not found', p_asset; END IF;
  SELECT geom INTO g FROM gis.parcel WHERE id = a.parcel_id;   -- parcel outline when linked …
  IF g IS NULL THEN g := a.location; END IF;                     -- … otherwise the geocoded point

  SELECT * INTO z FROM gis.zoning_area
   WHERE municipality_id = a.municipality_id AND valid_to IS NULL AND ST_Intersects(geom, g)
   ORDER BY ST_Area(ST_Intersection(geom, g)) DESC LIMIT 1;
  SELECT * INTO o FROM gis.official_plan_area
   WHERE municipality_id = a.municipality_id AND valid_to IS NULL AND ST_Intersects(geom, g)
   ORDER BY ST_Area(ST_Intersection(geom, g)) DESC LIMIT 1;
  SELECT * INTO s FROM gis.secondary_plan_area
   WHERE municipality_id = a.municipality_id AND ST_Intersects(geom, g) LIMIT 1;

  SELECT string_agg(DISTINCT status, ', ') INTO h_on
    FROM gis.heritage_feature WHERE municipality_id = a.municipality_id AND ST_Intersects(geom, g);
  SELECT string_agg(coalesce(name, address) || ' (' || status || ')', '; ') INTO h_near
    FROM gis.heritage_feature WHERE municipality_id = a.municipality_id AND NOT ST_Intersects(geom, g) AND ST_DWithin(geom, g, 100);

  SELECT CASE WHEN bool_or(hazard_type ILIKE '%floodplain%') THEN 'High'
              WHEN count(*) > 0 THEN 'Medium' ELSE 'Low' END,
         string_agg(DISTINCT authority || ': ' || hazard_type, '; ')
    INTO f_risk, f_note
    FROM gis.hazard_area WHERE ST_Intersects(geom, g);

  INSERT INTO app.asset_snapshot (asset_id, method, zoning_code, zoning_bylaw, zoning_area_id,
      op_designation, op_area_id, secondary_plan, secondary_plan_id, heritage_status, heritage_note,
      flood_risk, flood_note, applications_500m, permits_500m)
  VALUES (a.id, 'spatial', z.zone_code, z.bylaw, z.id, o.designation, o.id, s.name, s.id,
      coalesce(h_on, 'No designations on site'), h_near,
      coalesce(f_risk, 'Low'), coalesce(f_note, 'Outside mapped hazard areas'),
      (SELECT count(*) FROM gis.development_application d WHERE d.geom IS NOT NULL AND ST_DWithin(d.geom, g, 500)),
      (SELECT count(*) FROM gis.building_permit b WHERE b.geom IS NOT NULL AND ST_DWithin(b.geom, g, 500)))
  RETURNING id INTO snap_id;

  UPDATE app.asset SET last_checked_at = now() WHERE id = a.id;
  RETURN snap_id;
END $$;

-- One row per asset with its latest facts: what the dashboard table reads.
CREATE OR REPLACE VIEW app.asset_dashboard AS
SELECT a.id, a.owner_id, a.name, a.street_address, m.name AS municipality, m.province, m.upper_tier,
       a.postal_code, a.asset_class, a.sub_type, a.parcel_id, a.added_at, a.last_checked_at,
       ST_Y(a.location::geometry) AS lat, ST_X(a.location::geometry) AS lng,
       sn.taken_at AS snapshot_at, sn.method AS snapshot_method,
       sn.zoning_code, sn.zoning_bylaw, sn.zoning_note, sn.op_designation, sn.secondary_plan,
       sn.heritage_status, sn.heritage_note, sn.flood_risk, sn.flood_note,
       sn.applications_500m, sn.permits_500m,
       (SELECT count(*) FROM app.alert al WHERE al.asset_id = a.id AND al.read_at IS NULL) AS unread_alerts
FROM app.asset a
JOIN ref.municipality m ON m.id = a.municipality_id
LEFT JOIN LATERAL (
  SELECT * FROM app.asset_snapshot x WHERE x.asset_id = a.id ORDER BY x.taken_at DESC LIMIT 1
) sn ON true
WHERE a.archived_at IS NULL;

-- Parcels for the current map view (the page asks for a bounding box; never the whole city).
CREATE OR REPLACE FUNCTION gis.parcels_in_bbox(min_lng double precision, min_lat double precision,
                                               max_lng double precision, max_lat double precision, max_rows int DEFAULT 4000)
RETURNS TABLE (id bigint, pin text, address text, geojson json) LANGUAGE sql STABLE AS $$
  SELECT p.id, p.pin, p.address, ST_AsGeoJSON(p.geom::geometry, 6)::json
  FROM gis.parcel p
  WHERE p.geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  LIMIT max_rows;
$$;

-- =============================================================================
-- Roles: the site connects as a least-privilege user; imports run as the owner
-- =============================================================================
-- CREATE ROLE assetlogic_app LOGIN PASSWORD '…';          -- created in the Cloud SQL console, not here
GRANT USAGE ON SCHEMA ref, gis, app TO assetlogic_app;
GRANT SELECT ON ALL TABLES IN SCHEMA ref, gis TO assetlogic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO assetlogic_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO assetlogic_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app, gis TO assetlogic_app;
