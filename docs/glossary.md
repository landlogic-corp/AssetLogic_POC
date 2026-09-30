# Glossary

Terms used in the application, the code and these documents.

## Planning and property (Ontario)

| Term | Meaning |
|---|---|
| **Official Plan (OP)** | A municipality's long-range land-use policy. Each property has a *designation* such as "Mixed Use Areas" or "High Rise Residential" that sets what kinds of development are intended |
| **Official Plan Amendment (OPA)** | A change to the Official Plan, either initiated by the municipality or requested for a site |
| **Secondary plan** | A more detailed plan for a specific area within a municipality, layered on the Official Plan |
| **Zoning by-law** | The regulation that sets what may be built on a property: permitted uses, height, density, setbacks. Each property has a *zone code* such as `RMU-40` |
| **Zoning By-law Amendment (ZBA)** | A change to the zoning for a site, often called a rezoning |
| **Site Plan** | The approval stage that deals with a project's detailed design and layout |
| **Committee of Adjustment (CoA)** | The body that decides minor variances from the zoning by-law and land severances |
| **Minor variance** | Permission to depart slightly from a zoning rule |
| **Development application** | A collective term for OPA, ZBA, site plan, subdivision and similar applications |
| **Building permit** | Permission to construct, alter or demolish, issued after planning approvals |
| **Ontario Land Tribunal (OLT)** | The provincial body that hears appeals of planning decisions. Formerly the Ontario Municipal Board (OMB) and the Local Planning Appeal Tribunal; older records still say OMB |
| **Heritage register** | A municipality's list of properties of cultural heritage value. *Listed* properties are recorded; *designated* properties (Part IV of the Ontario Heritage Act) are protected |
| **Heritage Conservation District (HCD)** | An area designated under Part V of the Ontario Heritage Act |
| **Conservation authority (CA)** | A watershed-based agency that regulates development in and near floodplains, valleys and shorelines. Examples: TRCA, GRCA, CVC |
| **Regulated area / floodplain** | Land where a conservation authority's permission is needed before development or site alteration |
| **Upper tier / lower tier** | In two-tier regions, the region is the upper tier and the city or township is the lower tier. Some cities are single-tier |
| **Parcel** | A legally defined piece of land; the polygon the application draws for a property |
| **PIN** | Property Identification Number: the nine-digit identifier for a parcel in Ontario's land registry |
| **ARN / roll number** | Assessment Roll Number: the 15-digit identifier used for property assessment and tax |
| **MPAC** | The Municipal Property Assessment Corporation, which assesses property values in Ontario |
| **Purpose-built rental** | A residential building constructed to be rented, as opposed to condominium units that happen to be rented |
| **Multi-residential** | The asset class for buildings with many dwelling units |
| **Cap rate** | Capitalisation rate: a property's net operating income divided by its value |
| **Comparables ("comps")** | Recent sales of similar properties, used to estimate value |
| **FSI** | Floor Space Index: total floor area divided by lot area; a measure of density |

## Product

| Term | Meaning |
|---|---|
| **Asset** | A property a user is monitoring |
| **Watchlist** | The set of assets a user monitors |
| **Layer** | A category of information that can be monitored for an asset, such as zoning, heritage or flood hazard |
| **Snapshot** | The set of facts recorded for an asset at one moment |
| **Alert / flag** | A notification that something about an asset or its surroundings changed |
| **Alert rule** | A user's instruction about what should raise an alert, within what distance, and how to be told |
| **Re-check** | Taking a new snapshot of an asset and comparing it with the last one |
| **Carried forward** | A fact kept from the previous snapshot because the layer that would derive it has not been loaded |
| **Illustrative** | Placeholder data chosen to be plausible, not sourced. Labelled as such |

## Technical

| Term | Meaning |
|---|---|
| **The page** | `asset-monitor.html` and the `index.html` generated from it |
| **Function** | A server-side handler in `netlify/functions/`, reachable at `/.netlify/functions/<name>` |
| **Build** | Running `scripts/build-index.js` to produce `index.html` |
| **Build stamp** | The commit identifier written into the page at build time; how the publish script knows a deploy is live |
| **Netlify** | The hosting service: serves the page, runs the functions, deploys on every push |
| **CDN** | Content delivery network: the servers that deliver the static page and cache some responses |
| **PostgreSQL** | The database system |
| **PostGIS** | The PostgreSQL extension that adds geometry types and spatial queries |
| **Schema** (database) | A named group of tables inside a database. Also used loosely for the overall structure |
| **Cloud SQL** | Google Cloud's managed PostgreSQL service |
| **Connector** | The library that opens an encrypted, identity-checked connection to the database without exposing it to the network |
| **Service account** | A non-human identity used by software to authenticate to a cloud provider |
| **Environment variable** | A named configuration value supplied to a program from outside its code |
| **Mapbox GL JS** | The browser library that renders the map |
| **Style** (Mapbox) | The definition of how the basemap looks |
| **Geocoding** | Turning an address into coordinates |
| **GeoJSON** | A JSON format for geographic features |
| **WGS84** | The coordinate system of plain longitude and latitude |
| **Bounding box (bbox)** | A rectangle given as west, south, east, north; used to ask for the parcels in a map view |
| **Spatial join** | Combining records based on how their shapes relate, for example which zone polygon contains a parcel |
| **Upsert** | Insert a record, or update it if it already exists |
| **Parameterised query** | A query where values are passed separately from the SQL text, preventing injection |
| **ERD** | Entity-relationship diagram: a picture of tables and how they relate |
