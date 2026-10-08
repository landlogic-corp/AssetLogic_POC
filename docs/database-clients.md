# Connecting a database client

How to open the database in a desktop tool such as DataGrip, pgAdmin or `psql` for ad-hoc queries.
You need a connection string from the project administrator; it is the same kind of value the
application uses.

## What is in a connection string

```
postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

Desktop tools ask for the pieces separately. Read them off the string:

| Field in the tool | Where it is in the string |
|---|---|
| Host | between `@` and the next `/` |
| Port | `5432` unless the string says otherwise |
| Database | after the last `/`, before `?` |
| User | between `//` and `:` |
| Password | between `:` and `@` |
| SSL | required |

Ask the administrator for the **direct** string rather than the pooled one. The pooled endpoint is
tuned for short-lived application connections; a desktop tool holds a session open and works better
on the direct one. If the host name contains `-pooler`, it is the pooled endpoint.

## DataGrip

1. **New data source.** In the Database tool window click **+**, then **Data Source**, then
   **PostgreSQL**.
2. **Driver.** If DataGrip shows *Download missing driver files*, click it once.
3. **General tab.** Fill in Host, Port, User, Password and Database from the string. Name the
   connection `AssetLogic`.
4. **SSH/SSL tab.** Tick **Use SSL** and set Mode to **require**. Leave the certificate fields empty;
   the server's certificate is publicly trusted.
5. **Test Connection.** It should report the PostgreSQL version. If it times out, see below.
6. **Schemas tab.** By default DataGrip introspects only the `public` schema, which is empty here.
   Tick **ref**, **gis** and **app** (or *All schemas*), then OK.
7. In the tree, expand the data source. The tables appear under each schema.

Try it:

```sql
select name, municipality, zoning_code, flood_risk from app.asset_dashboard order by name;
select count(*) from gis.parcel;
```

Geometry columns display as well-known binary. To read them, use `ST_AsText(geom)` or
`ST_AsGeoJSON(geom)` in the query, or open the row and use DataGrip's geo viewer where available.

## pgAdmin

*Register → Server*. General: a name. Connection: host, port, database, user, password. SSL tab: SSL
mode **Require**. Save. Then expand *Databases → the database → Schemas*.

## psql

```bash
psql "<the connection string>"
```

Then `\dn` lists schemas and `\dt gis.*` lists the spatial tables.

## Things to know

- **The first query after a quiet period takes a second or two.** The database sleeps when idle and
  wakes on demand. This is normal and costs nothing.
- **The login you are given owns the schema.** You can change anything, including structure. Prefer
  `select` for exploring; make structural changes only through the reviewed schema file.
- **The database is shared.** Writes are visible to the application immediately.
- **Never commit a connection string**, paste it into chat, or put it in a screenshot. Treat it like
  a password. See [security.md](security.md).

## If the connection fails

| Message | Cause | Fix |
|---|---|---|
| Password authentication failed | A character was lost when copying | Copy the whole string again; check for a trailing space |
| SSL required | SSL not enabled in the tool | Turn on SSL / set mode to require |
| Timed out | Network blocks port 5432, or a security product is interfering | Try another network; see [troubleshooting.md](troubleshooting.md) |
| Database does not exist | Wrong database name | Use the name from the string, not `postgres` |
| Only `public` schema visible | Schemas not selected for introspection | DataGrip: Schemas tab, tick the three schemas |
