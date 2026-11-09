# Simon Says

One conference session feed. Personal, illustrated takeaways.

The host captures the speaker's microphone and screen once. Attendees join by QR code, read live captions, and save moments. Each attendee gets a private recap with source passages and aligned screenshots.

**Status:** milestone 0 foundation is implemented and locally verified; evidence is tracked in the [implementation plan](docs/implementation-plan.md). Product flows and provider integrations are not implemented.

## Start here

- [Product](docs/product.md): experience, MVP, and limits.
- [Architecture](docs/architecture.md): monorepo ownership, data flow, and invariants.
- [Contracts](docs/contracts.md): records, APIs, and event semantics.
- [Implementation plan](docs/implementation-plan.md): ordered milestones and acceptance checks.
- [Building tracks](docs/building-tracks.md): three-builder ownership, handoffs, and first working slices.
- [Decisions](docs/decisions.md): confirmed choices, proposals, and open questions.
- [Agent instructions](AGENTS.md): how to work in this repository.

## Local setup

Use Node.js 22.22.0, pnpm 11.24.0, and Docker with Compose. From the repository root:

```sh
cp .env.example .env
pnpm install --frozen-lockfile
pnpm services:up
pnpm db:generate
pnpm db:validate
pnpm db:check
pnpm storage:check
pnpm check
pnpm build
pnpm dev
```

Open the local URL printed by Next.js. Run `pnpm services:down` to stop the local services. The Compose configuration uses PostgreSQL and a private SeaweedFS S3 bucket with local credentials. The root `.env` configures the database scripts; Next.js loads app-specific settings from `apps/web/.env.local` when needed. Do not use local credentials for deployed services.

`pnpm check` runs lint, formatting, type checking, and tests. `pnpm db:check` checks the database connection. The workspace uses Next.js and shadcn/ui for the Vercel application, with Prisma for PostgreSQL. See the implementation plan for completed verification and remaining work.

## Vercel and live transport

The Vercel project root is `apps/web`. Install from the workspace lockfile and generate Prisma before the Next.js build. Hosted credentials and provisioning remain separate setup work.

`pnpm dev` runs ordinary Next.js development. The proposed WebSocket upgrade route requires `vercel dev`; that route and local CLI compatibility are milestone 1 work and are not verified by this foundation. No deployment has been created.
