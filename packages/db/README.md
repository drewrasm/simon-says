# Database

Prisma 7 owns the PostgreSQL schema and generated client. Application models and migrations begin in milestone 1; the foundation deliberately has no product tables.

From the repository root, generate the client before typechecking or building. Prisma CLI commands and the database check load the root `.env`; application server code receives `DATABASE_URL` from its environment.

Import `createDatabaseClient` from `@simon-says/db/client` in server code. The module is guarded by `server-only`; close clients when their owner shuts down. The check command runs with the `react-server` condition so Node can use that guard outside Next.js.

The connection check runs `SELECT 1` through Prisma and closes the connection. It proves connectivity, not migrations, product persistence, or access isolation.
