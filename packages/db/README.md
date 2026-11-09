# Database

Prisma 7 owns the PostgreSQL schema and generated client. The first migration adds anonymous device principals, sessions, memberships, and private bookmarks for checkpoint C1.

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

Bookmark evidence is nullable JSON for materialized segment revisions and frame IDs. Ranges and `clockUncertaintyMs` use session-relative milliseconds as double precision, because caption times can be fractional. Live anchors store `markedAtMs`; paragraph anchors store `segmentId` and `segmentRevision`, so responses can return the anchor. New bookmarks start at revision 1 with pending completeness and no resolved range or evidence.

The access layer owns signed-cookie identity, token hashing, title limits, membership checks, range validation, and evidence validation. It must create a host membership together with its session; the schema does not enforce that the host principal has a host membership. Database ownership fields do not enforce API access isolation.

This migration excludes ingest leases, epochs, clock mapping, transcript offsets, and retention fields pending Track 2's requirements. Recap and job tables are deferred to a later migration. The shared contracts and the owning Shortcut story need these scope and verification notes when their owning lane updates them.

## Local verification

Verified on November 9, 2026 against local PostgreSQL: the initial migration applies, `migrate:deploy` has no pending migrations, and `prisma migrate status` reports the schema up to date. `pnpm check`, `pnpm db:validate`, `pnpm db:generate`, and `pnpm db:check` pass. Temporary synthetic records verified defaults, unique constraints, JSON evidence updates, principal deletion restrictions, and session cascades; the records were removed. Session endpoints, API access isolation, and cluster deployment remain unverified.
