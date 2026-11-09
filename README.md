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
- [Design system](docs/design-system.md): shadcn preset, tokens, components, and reference page at `/design-system`.
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

The deployment target is Kubernetes operated through Radar. Keep Next.js, shadcn/ui, and Prisma. The team cluster is provisioned; container packaging, GitOps, live transport, and deployment are not yet implemented or verified. `pnpm dev` still runs the existing Next.js foundation locally.

The next checkpoint is **0A: Kubernetes deployment foundation**, followed by live captions in milestone 1. All four hackathon tracks are planned: Radar operations, Dash0 observability, Sonar/Gitar development review, and Elasticsearch as the core shared-content store and passage search layer. See the [deployment plan](docs/deployment.md) and [integration scope](docs/hackathon.md).

## Agent MCP servers

`.mcp.json` (Claude Code) and `.codex/config.toml` (Codex) configure one MCP server per hackathon tool. They hold URLs and environment variable names only; never add tokens, because the repository is public.

| Server          | Tool                  | Sign-in                                                                                                                 |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `radar-cloud`   | Radar Cloud           | Browser OAuth. Accept the Radar Cloud invite first, then choose **Cloud Native Hackathon** under "Organization access". |
| `dash0`         | Dash0 (AWS US West)   | Browser OAuth with your Dash0 team organization account.                                                                |
| `elasticsearch` | Elastic Agent Builder | API key in `ELASTIC_MCP_AUTHORIZATION`, formatted as `ApiKey <encoded key>`.                                            |

Gitar runs as a GitHub App and has no MCP server. Its review instructions live in `.gitar/review/`; CI is `.github/workflows/check.yml`. Open every feature as a pull request so Gitar reviews it.

- **Claude Code:** start a session in this repository and approve the project servers. Run `/mcp`, pick `radar-cloud` and `dash0`, and choose **Authenticate**.
- **Codex:** trust this project, then run `codex mcp login radar-cloud` and `codex mcp login dash0`.

### Elastic access

Each teammate needs access to the Elastic project and their own API key; Elastic Serverless OAuth requires a registered client, so the MCP server uses the key. In Kibana, create a key under **API keys** with an expiry before the event ends. Store it in the [`elastic` CLI](https://github.com/elastic/cli), which keeps it in the macOS Keychain and is also what the `elasticsearch-onboarding` skill uses:

```sh
npm install -g @elastic/cli@0.7.0
read -rs ES_API_KEY   # paste the key, press Enter
elastic config context add simon-says --es-url https://my-elasticsearch-project-fb0a5d.es.us-west-2.aws.elastic.cloud:443 --es-api-key "$ES_API_KEY"
unset ES_API_KEY
elastic config current-context set simon-says
elastic status
```

Then expose it to the MCP server from your shell profile, outside the repository, and restart the agent:

```sh
export ELASTIC_MCP_AUTHORIZATION="ApiKey $(security find-generic-password -s elastic-cli -a simon-says:elasticsearch.auth.api_key -w 2>/dev/null)"
```

## Agent skills

Official `ai-sdk`, `vercel-react-best-practices`, and `elasticsearch-onboarding` skills are vendored in `.agents/skills/` for Codex, with relative `.claude/skills/` symlinks for Claude Code. They are available from a fresh clone without installing app dependencies. Start a new agent session after changing skills.

See [agent skill provenance and updates](docs/agent-skills.md) for pinned sources, installation commands, and the retired Next.js best-practices skill. The AI SDK remains a [proposed implementation default](docs/decisions.md#proposed-implementation-defaults).
