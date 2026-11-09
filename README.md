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
- [Hackathon integrations](docs/hackathon.md): four sponsor tracks, accounts, owners, and evidence.
- [Deployment plan](docs/deployment.md): Kubernetes through Radar, prerequisites, and release checks.
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

`pnpm check` runs lint, formatting, type checking, and tests. `pnpm db:check` checks the database connection. The workspace uses Next.js and shadcn/ui for the application, with Prisma for PostgreSQL. See the implementation plan for completed verification and remaining work.

## Deployment and hackathon scope

The deployment target is Kubernetes operated through Radar. Keep Next.js, shadcn/ui, and Prisma. Cluster access is being arranged; container packaging, GitOps, live transport, and deployment are not yet implemented or verified. `pnpm dev` still runs the existing Next.js foundation locally.

The next checkpoint is **0A: Kubernetes deployment foundation**, followed by live captions in milestone 1. All four hackathon tracks are planned: Radar operations, Dash0 observability, Sonar/Gitar development review, and Elasticsearch passage search. See the [deployment plan](docs/deployment.md) and [integration scope](docs/hackathon.md).

## Agent skills

Official `ai-sdk` and `vercel-react-best-practices` skills are vendored in `.agents/skills/` for Codex, with relative `.claude/skills/` symlinks for Claude Code. They are available from a fresh clone without installing app dependencies. Start a new agent session after changing skills.

See [agent skill provenance and updates](docs/agent-skills.md) for pinned sources, installation commands, and the retired Next.js best-practices skill. The AI SDK remains a [proposed implementation default](docs/decisions.md#proposed-implementation-defaults).
