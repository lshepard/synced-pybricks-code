# Cloud sync

Shared project storage layered on top of the editor, so a team can save code
somewhere everyone can reach and pick up where someone else left off.

There are no accounts. A name identifies who saved what; it is attribution,
not authentication. Everything here assumes a private team, not the public
internet.

## What it does

- The dashboard at `/` lists projects. `/project/<slug>` opens one in the
  editor.
- **Save** snapshots every file in the project and appends it to that
  project's history. Nothing is ever overwritten or deleted, so saving is
  always safe, including saving on top of an old version loaded from the
  history.
- Opening a project replaces the editor's local files with its newest
  version. The editor stores one project at a time, so the dirty flag decides
  whether to ask first.
- A lock marks who is editing. It is advisory: someone else editing turns off
  saving and shows a banner, and "Edit anyway" takes the lock. Concurrent
  saves produce two versions rather than a conflict, which is a problem people
  can sort out and software cannot.

## Layout

| Path | What it is |
| --- | --- |
| `protocol.ts` | Types and length limits shared by both sides |
| `db.ts` | Every database query |
| `schema.sql` | The three tables |
| `routes/` | Serverless handlers, bundled into `/api` |
| `api.ts` | Browser client for those routes |
| `localFiles.ts` | Moves file sets in and out of the editor's storage |
| `identity.ts` | Name, per-tab session id, dirty flag |
| `*.tsx` | Dashboard, project page, save button, name gate, header |

`db.ts` holds the interesting decisions. Neon's HTTP driver sends every
statement in a transaction up front, so none can branch on an earlier one's
result. Each operation is therefore a single statement with its conditions in
SQL — the lock check is part of the insert, so there is no window between
checking and writing.

### The `/api` directory is generated

Vercel compiles each file under `/api` on its own and does not follow imports
out of that directory, so a route written there cannot use `db.ts`. Sources
live in `routes/` and `scripts/build-api.js` bundles them into `/api`.

`/api` is committed, because Vercel decides what functions a deployment has by
looking for that directory in the repository, before the build command runs.
Generate it during the build and the deployment has no functions at all: every
`/api` path falls through to the single page app, which answers with HTML and
a 200.

Because it is committed it can drift. `yarn check:api` regenerates and fails
if the result differs; CI runs it. After changing anything in `routes/` or
anything they import, run `yarn build:api` and commit the result.

Route files map to URLs, so `versions.ts` and `versions/[id].ts` are separate
files: a single-segment `[id]` does not also match the collection path.

## A database on your machine

For development and for the tests, rather than a Neon branch:

```
docker compose up -d
```

That is Postgres with `schema.sql` already applied, plus a proxy on port 4444
that speaks Neon's HTTP protocol in front of it. The driver expects an HTTPS
endpoint derived from the connection string's host, which a local Postgres
does not have, so `db.ts` points `localhost` and `127.0.0.1` at the proxy
instead. Nothing else changes: the same driver and the same queries run
against both.

The connection string is:

```
postgres://postgres:postgres@localhost:5432/main
```

The schema is applied when the volume is first created, so after editing
`schema.sql` either re-apply it by hand or run `docker compose down -v` to
start over.

## Running the API on your machine

`yarn start` serves the editor but not `/api`: those are Vercel functions. To
run both, and so to run the browser tests without a deployment:

```
vercel dev --listen 3000
```

It runs `yarn start` behind it, per `devCommand` in `vercel.json`, because
Vercel otherwise guesses `react-scripts start`, which this project does not
have. The functions read `DATABASE_URL` from `.env.development.local`, which is
gitignored, so point it at the local database:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/main
```

## Setting up the deployed database

Neon, through the Vercel integration, which injects the connection strings
into the project.

1. Add Neon from the Vercel dashboard (Storage → Neon) and connect it to this
   project.
2. Pull the credentials locally:

   ```
   vercel env pull .env.local
   ```

   `.env*` is gitignored.

3. Apply the schema. Use the unpooled URL, since pgbouncer's transaction
   pooling is not reliable for DDL:

   ```
   psql "$DATABASE_URL_UNPOOLED" -f src/cloud/schema.sql
   ```

   It is safe to re-run.

`DATABASE_URL` is pooled and is what the functions use. `DATABASE_URL_UNPOOLED`
is a direct connection, for schema changes.

## Running the tests

Most of the suite needs nothing. The database tests read `TEST_DATABASE_URL`
and skip when it is unset, so `yarn test` passes without a database.

To run them, point `TEST_DATABASE_URL` at a database **other than the one the
app uses**. They create and delete rows. A Neon project has one database on
its default branch, which is why they do not fall back to `DATABASE_URL`.

The local database above is the easy answer. Put it in `.env.test.local`,
which is gitignored:

```
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/main
```

A Neon branch works too: create one in the console, apply `schema.sql` to it,
and use its pooled connection string instead.

Then:

```
yarn test --testPathPattern=cloud
```

Each run names its projects with a unique prefix and deletes them afterwards.

## Deployment

Vercel builds from the `cloud-sync` branch. `vercel.json` sets the
cross-origin isolation headers the editor needs for Pyodide and the
mpy-cross workers; without them the editor breaks in ways that are hard to
trace back.

Preview deployments sit behind Vercel's deployment protection and need a
Vercel account to open, so a preview URL is not something to hand out. Turn
protection off, or use a custom domain, before pointing anyone at it.

## Things worth knowing

- **The marketing site's fonts are not used here.** It loads Space Grotesk and
  Inter from Google Fonts, which cross-origin isolation blocks. The palette is
  ported to Sass in `cloud.scss`; the fonts fall back to system ones.
  Self-hosting the woff2 files would fix it.
- **Nothing is deleted.** Archiving hides a project from the list and is
  reversible. Removing anything for real means going into the database.
- **Two tabs are two sessions.** The lock keys on a per-tab session id rather
  than the name, so a tab that lost its lock after a crash cannot use it, and
  cannot release the new holder's lock on the way out.
