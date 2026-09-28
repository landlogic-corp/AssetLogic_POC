# Data sources

What each source file contains and how it maps into the schema (`docs/schema.sql`). Files live in
the git-ignored `parcels/` folder; they are imported into `gis.parcel`, never committed.

## Parcel files (inspected 2026-09-28)

| | Mississauga Parcels | Toronto Property Boundaries | Waterloo Region Parcels |
|---|---|---|---|
| Size | 99 MB | 257 MB | 119 MB |
| Features | 166,923 | 498,589 | 167,275 |
| CRS | EPSG:4326 | CRS84 (= WGS84) | CRS84 (= WGS84) |
| Geometry | Polygon (29 MultiPolygon) | MultiPolygon | Polygon (510 MultiPolygon) |
| Avg / max vertices | 13 / 1,308 | 9 / 2,717 | 9 / 1,769 |
| Extent | Mississauga city limits | Toronto city limits | whole Region of Waterloo |
| Unique id | `FID` | `OBJECTID` | `OBJECTID` |
| Parcel id | `CITY_PIN` (city's own id, not an Ontario PIN) | none | none |
| Roll number | none | none | `RollNumber` (15 digits, all rows) |
| Address | none | none | `Location` (99.2% of rows) |
| Other | `GIS_AREA` (m²) | `F_TYPE`: COMMON 492,046 · CONDO 3,591 · RESERVE 2,952 | `Municipality`, `RealtyTaxClass` (R, E, C, I, M …; 83% filled), `LegalDescription`, `Shape.STArea()`, `Shape.STLength()` |
| Duplicates / null geometry | none | none | none |

No reprojection is needed; all three are already longitude/latitude.

The Waterloo file covers seven municipalities: Kitchener 67,421 · Cambridge 42,297 · Waterloo 31,103 ·
Woolwich 10,232 · Wilmot 6,891 · North Dumfries 4,501 · Wellesley 3,528, plus 1,301 rows with no
municipality (typically road allowances and rail corridors). All are imported; the `municipality_id`
is set from the `Municipality` property, and the file's own municipality list is added to
`ref.municipality` so Cambridge and the townships are available when a property is added there.

### Column mapping into `gis.parcel`

| `gis.parcel` | Mississauga | Toronto | Waterloo Region |
|---|---|---|---|
| `source_record_id` | `FID` | `OBJECTID` | `OBJECTID` |
| `pin` | — | — | — |
| `arn` | — | — | `RollNumber` |
| `address` | — | — | `Location` |
| `land_use` | — | `F_TYPE` | `RealtyTaxClass` |
| `area_m2` | `GIS_AREA` | computed (`ST_Area`) | `Shape.STArea()` |
| `municipality_id` | Mississauga | Toronto | from `Municipality` |
| `attributes` | `CITY_PIN` | — | `LegalDescription`, `Shape.STLength()` |

### Consequences for the product

- **Address → parcel works everywhere by geometry.** Geocode the address, then `gis.parcel_at()`
  finds the polygon under the point. Verified for all eight sample buildings: each lands inside
  exactly one parcel, and in Waterloo Region the parcel's own roll number and address match
  (for example 66 Weber St E → roll 301203000419011, "66-82 Weber St E"; 194 Erb St W → the
  4,588 m² multi-residential parcel addressed "Dietz Ave", which is the assembled corner lot).
- **Waterloo Region parcels can also be found by address or roll number** without geocoding.
- **Toronto and Mississauga parcels carry no address or Ontario PIN.** To search those by address
  or PIN we need one more source per city: Toronto's *Address Points* open dataset (point per civic
  address) and Mississauga's address points, or the LandLogic database once it is reachable. Until
  then, Toronto and Mississauga go through geocoding, which is fine for adding assets.
- **Toronto `F_TYPE`:** `COMMON` is a normal parcel; `CONDO` is the shared condominium parcel;
  `RESERVE` is a 0.3 m reserve strip. Reserve strips are imported but flagged in `land_use` so
  `parcel_at()` can skip them when a point sits on a lot line.

## Still needed from the LandLogic side

Sources for the remaining columns, each becoming a `ref.data_source` row and a `gis` table:
zoning polygons, Official Plan designations, secondary plan boundaries, heritage register (points
and districts), conservation authority hazard mapping, development applications, building permits,
registered sales and the monthly market series. Any format works (GeoJSON, shapefile, GeoPackage,
CSV with coordinates, or an API/MCP endpoint); the import scripts follow the same pattern as the
parcel importer.
