-- AssetLogic POC · database schema (DRAFT for review, not yet created anywhere)
-- Target: Google Cloud SQL for PostgreSQL 16 with the PostGIS extension.
-- Coordinates are WGS84 (SRID 4326); distances are computed in metres via geography casts.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Reference: municipalities and the context shared by every asset in them
-- ---------------------------------------------------------------------------
CREATE TABLE municipality (
  id                     serial PRIMARY KEY,
  name                   text NOT NULL,                 -- 'Toronto', 'Waterloo'
  province               char(2) NOT NULL DEFAULT 'ON',
  upper_tier             text,                          -- 'Region of Waterloo', 'City of Toronto (single-tier)'
  conservation_authority text,                          -- 'Grand River Conservation Authority (GRCA)'
  official_plan_name     text,                          -- 'City of Waterloo Official Plan'
  zoning_bylaw_name      text,                          -- 'Zoning By-law 2018-050'
  UNIQUE (name, province)
);

-- ---------------------------------------------------------------------------
-- Users and the assets they watch
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  display_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES app_user(id),
  name            text NOT NULL,                       -- 'The Carrick'
  street_address  text NOT NULL,                       -- '194 Erb Street W'
  municipality_id int  NOT NULL REFERENCES municipality(id),
  postal_code     text,
  asset_class     text NOT NULL,                       -- 'Residential', 'Mixed-use', 'Commercial', 'Industrial', 'Agricultural'
  sub_type        text,                                -- 'Purpose-built rental apartment'
  pin             text,                                -- parcel identifier, when known
  location        geography(Point, 4326),              -- geocoded point
  parcel          geography(MultiPolygon, 4326),        -- parcel outline from GeoJSON, when available
  added_at        timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz
);
CREATE INDEX asset_location_gix ON asset USING gist (location);
CREATE INDEX asset_owner_ix ON asset (owner_id);

-- Planning, heritage and hazard facts for one asset, one row per retrieval so history is kept.
CREATE TABLE asset_planning (
  id                 bigserial PRIMARY KEY,
  asset_id           uuid NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  retrieved_at       timestamptz NOT NULL DEFAULT now(),
  zoning_code        text,          -- 'RMU-40', 'RES-7', 'Unavailable'
  zoning_bylaw       text,          -- 'Former City of Toronto By-law No. 438-86'
  zoning_note        text,          -- free text from the source
  op_designation     text,          -- 'Mixed-Use Medium Density Residential'
  secondary_plan     text,          -- 'Garrison Common North', NULL when none
  heritage_status    text,          -- 'No designations on site'
  heritage_note      text,          -- 'Adjacent to potential West Queen West HCD'
  flood_risk         text CHECK (flood_risk IN ('Low', 'Medium', 'High', 'Unknown')),
  flood_note         text,          -- 'Site is partly within floodplain.'
  source             text           -- 'LandLogic Site Assessment', 'manual'
);
CREATE INDEX asset_planning_asset_ix ON asset_planning (asset_id, retrieved_at DESC);

-- ---------------------------------------------------------------------------
-- Things that happen near assets
-- ---------------------------------------------------------------------------
CREATE TABLE development_application (
  id               bigserial PRIMARY KEY,
  municipality_id  int NOT NULL REFERENCES municipality(id),
  address          text NOT NULL,                      -- '99 Sudbury St'
  application_type text NOT NULL,                      -- 'Zoning By-law Amendment', 'Site Plan', 'Official Plan & Zoning By-law Amendment'
  status           text NOT NULL,                      -- 'Under OMB Appeal', 'Under Review', 'Adopted' (as published by the municipality)
  status_date      date,
  description      text,
  file_number      text,                               -- municipal reference, when known
  location         geography(Point, 4326),
  source_url       text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dev_app_location_gix ON development_application USING gist (location);

CREATE TABLE building_permit (
  id               bigserial PRIMARY KEY,
  municipality_id  int NOT NULL REFERENCES municipality(id),
  address          text NOT NULL,
  permit_type      text NOT NULL,                      -- 'Building', 'Demolition'
  status           text NOT NULL,                      -- 'Applied', 'Issued', 'Closed'
  status_date      date,
  description      text,
  permit_number    text,
  location         geography(Point, 4326),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX permit_location_gix ON building_permit USING gist (location);

CREATE TABLE sale_comparable (
  id               bigserial PRIMARY KEY,
  municipality_id  int NOT NULL REFERENCES municipality(id),
  address          text NOT NULL,
  asset_class      text NOT NULL,
  closed_on        date NOT NULL,
  price            numeric(14, 2) NOT NULL,
  units            int,                                -- multi-res unit count
  floor_area_sqft  numeric(12, 1),
  location         geography(Point, 4326),
  source           text
);
CREATE INDEX sale_location_gix ON sale_comparable USING gist (location);

-- Monthly market series per municipality and asset class (feeds the KPI and chart).
CREATE TABLE market_metric (
  municipality_id     int NOT NULL REFERENCES municipality(id),
  asset_class         text NOT NULL,
  month               date NOT NULL,                   -- first day of month
  avg_price_per_unit  numeric(12, 2),
  avg_price_per_sqft  numeric(10, 2),
  avg_rent_1bed       numeric(10, 2),
  cap_rate_pct        numeric(5, 2),
  days_on_market      int,
  PRIMARY KEY (municipality_id, asset_class, month)
);

-- ---------------------------------------------------------------------------
-- Monitoring configuration and the alerts it produces
-- ---------------------------------------------------------------------------
CREATE TABLE layer (
  id          text PRIMARY KEY,                        -- 'zoning', 'op', 'sp', 'coa', 'apps', 'permits', 'transit', 'heritage', 'flood', 'env', 'sales', 'rent', 'mpac'
  group_name  text NOT NULL,                           -- 'Planning Policies', 'Development Activities', ...
  name        text NOT NULL,
  description text,
  sort_order  int NOT NULL
);

CREATE TABLE asset_layer (
  asset_id  uuid NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  layer_id  text NOT NULL REFERENCES layer(id),
  enabled   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (asset_id, layer_id)
);

CREATE TABLE alert_rule (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    uuid NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  layer_id    text NOT NULL REFERENCES layer(id),
  trigger     text NOT NULL,                           -- 'Application submitted', 'Amendment appealed (OLT)', ...
  radius_m    int  NOT NULL DEFAULT 500,               -- 0 = on the property only
  channels    text[] NOT NULL DEFAULT '{In-app,Email}',
  frequency   text NOT NULL DEFAULT 'Instantly',       -- 'Instantly', 'Daily digest', 'Weekly digest'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_rule_asset_ix ON alert_rule (asset_id);

CREATE TABLE alert (
  id           bigserial PRIMARY KEY,
  asset_id     uuid NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  layer_id     text NOT NULL REFERENCES layer(id),
  rule_id      uuid REFERENCES alert_rule(id) ON DELETE SET NULL,
  severity     text NOT NULL CHECK (severity IN ('info', 'good', 'warn', 'crit')),
  category     text NOT NULL,                          -- 'planning', 'development', 'risk', 'market'
  title        text NOT NULL,
  body         text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz,
  -- optional link to the record that caused the alert
  application_id bigint REFERENCES development_application(id),
  permit_id      bigint REFERENCES building_permit(id),
  sale_id        bigint REFERENCES sale_comparable(id)
);
CREATE INDEX alert_asset_ix ON alert (asset_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Convenience view: everything the dashboard table needs, one row per asset
-- ---------------------------------------------------------------------------
CREATE VIEW asset_dashboard AS
SELECT a.id, a.name, a.street_address, m.name AS municipality, m.province, a.postal_code,
       a.asset_class, a.sub_type, a.added_at, a.last_checked_at,
       p.zoning_code, p.op_designation, p.secondary_plan, p.heritage_status, p.flood_risk,
       (SELECT count(*) FROM development_application d
         WHERE d.municipality_id = a.municipality_id
           AND a.location IS NOT NULL AND d.location IS NOT NULL
           AND ST_DWithin(d.location, a.location, 500)) AS applications_500m,
       (SELECT count(*) FROM building_permit b
         WHERE b.municipality_id = a.municipality_id
           AND a.location IS NOT NULL AND b.location IS NOT NULL
           AND ST_DWithin(b.location, a.location, 500)) AS permits_500m,
       (SELECT count(*) FROM alert al WHERE al.asset_id = a.id AND al.read_at IS NULL) AS unread_alerts
FROM asset a
JOIN municipality m ON m.id = a.municipality_id
LEFT JOIN LATERAL (
  SELECT * FROM asset_planning ap WHERE ap.asset_id = a.id ORDER BY ap.retrieved_at DESC LIMIT 1
) p ON true;
