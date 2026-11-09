# Database

Prisma 7 owns the PostgreSQL schema and generated client. The first migration adds anonymous device principals, sessions, memberships, and private bookmarks; later migrations add recaps and bookmark CHECK constraints.

From the repository root, generate the client before typechecking or building. Prisma CLI commands and the database check load the root `.env`; application server code receives `DATABASE_URL` from its environment.

Apply committed migrations to local PostgreSQL and verify the database:

```sh
pnpm services:up
pnpm --filter @simon-says/db migrate:deploy
pnpm db:generate
pnpm db:validate
pnpm db:check
pnpm --filter @simon-says/db exec prisma migrate status
```

To create a migration after editing the schema, run `pnpm --filter @simon-says/db migrate:dev --name <name>`. Track 3 owns migration contents. In the cluster, Argo CD Job `db-migrate` runs `prisma migrate deploy` from this package's production closure in the app image. `prisma` and `dotenv` are production dependencies for that reason. CI applies migrations and runs `pnpm db:check` against a Postgres service before tests.

Import `createDatabaseClient` from `@simon-says/db/client` in server code. The module is guarded by `server-only`; close clients when their owner shuts down. The check command runs with the `react-server` condition so Node can use that guard outside Next.js.

Generate Prisma during the image build. Inject `DATABASE_URL` at runtime from a Secret, and never run competing migrations in every app pod. See the [deployment plan](../../docs/deployment.md).

The connection check runs `SELECT 1` through Prisma and closes the connection. It proves connectivity, not migrations, product persistence, or access isolation.

## Schema boundaries

IDs use PostgreSQL UUID columns with Prisma-generated UUID defaults. Tables map to `principals`, `sessions`, `memberships`, and `bookmarks`. Deleting a session cascades to its memberships and bookmarks. Referenced principals cannot be deleted.

Each session stores a unique host-link token hash and invite code. Raw host-link tokens are never stored. A principal has at most one membership per session; a revoked membership keeps its row. Bookmark operation IDs are unique per owner across sessions. The owner/session index supports private card reads.

Bookmark evidence is nullable JSON for materialized segment revisions and frame IDs. Ranges and `clockUncertaintyMs` use session-relative milliseconds as double precision, because caption times can be fractional. Live anchors store `markedAtMs`; paragraph anchors store `segmentId` and `segmentRevision`, so responses can return the anchor. CHECK constraints in migration SQL enforce that each anchor kind sets exactly its own columns, that requested and actual ranges are non-negative and not inverted, that the actual range is all-or-nothing, and that `clockUncertaintyMs` is non-negative; Prisma cannot express these in the schema. Parse stored evidence with `bookmarkEvidenceSchema`. New bookmarks start at revision 1 with pending completeness and no resolved range or evidence.

The access layer owns signed-cookie identity, token hashing, title limits, membership checks, range validation, and evidence validation. It must create a host membership together with its session. The `host` membership role is the only record of who hosts a session; a session can have several hosts after host-link claims. The deprecated `sessions.hostPrincipalId` column is nullable and still written on create for rollback compatibility, but never read; later releases stop writing it and then drop it. Database ownership fields do not enforce API access isolation.

The schema has no ingest leases, epochs, clock mapping, transcript offsets, retention fields, or job tables; Track 2's requirements define the ingest fields.
