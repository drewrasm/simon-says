# Simon Says

One conference session feed. Personal, illustrated takeaways.

The host captures the speaker's microphone and screen once. Attendees join by QR code, read live captions, and save moments. Each attendee gets a private recap with source passages and aligned screenshots.

**Status:** milestone 0 foundation is implemented and locally verified; evidence is tracked in the [implementation plan](docs/implementation-plan.md). Product flows and provider integrations are not implemented.

## Start here

- [Delivery plan](docs/delivery-plan.md): **start here today** — deadline, cut, per-track checkpoints, working agreement, and status board.
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

The deployment target is Kubernetes operated through Radar. The team cluster is provisioned. The local 0A foundation includes an explicitly compiled Next.js custom server, non-root container, offline manifests, and build-only CI. GitOps activation and cluster deployment require separate authorization. See the [0A evidence](docs/implementation-plan.md#checkpoint-0a-local-evidence) for verification and remaining gates.

### Local container and transport probes

```sh
docker build -t simon-says:checkpoint-0a .
docker run -d --name simon-says-0a -p 127.0.0.1:18080:8080 \
  -e DATABASE_URL=postgresql://dummy:dummy@127.0.0.1:5432/dummy \
  -e PROBE_TOKEN=local-checkpoint-0a-probe-token-12345 simon-says:checkpoint-0a
curl -f http://127.0.0.1:18080/healthz
curl -f http://127.0.0.1:18080/readyz
curl -f http://127.0.0.1:18080/
PROBE_TOKEN=local-checkpoint-0a-probe-token-12345 node scripts/probe.mjs http://127.0.0.1:18080
curl -N -H 'Authorization: Bearer local-checkpoint-0a-probe-token-12345' \
  http://127.0.0.1:18080/api/probe/sse
docker exec simon-says-0a id
docker stop --time 20 simon-says-0a
docker logs simon-says-0a
docker rm simon-says-0a
docker buildx build --platform linux/amd64 --load -t simon-says:checkpoint-0a-amd64 .
KUBECONFIG=/dev/null kubectl kustomize infra/k8s
```

Wait for `Next prepared` in container logs before probing readiness. The dummy database URL requires no running database for this app shell. `/healthz` checks process liveness; `/readyz` checks Next preparation and becomes unavailable during shutdown. Provider/database health is excluded until persistence-backed routes exist.

These are **transport probes**, not product capture APIs. Set server-only `PROBE_TOKEN` (32–128 URL-safe characters) to enable them; leave it unset to disable them. Use a fresh secret outside local development. SSE requires a Bearer header; WebSocket clients offer subprotocols `simon-probe` and `token.<PROBE_TOKEN>` (the server selects only `simon-probe`). Never put tokens in URLs or logs. Probes accept only fixed `ping` → `pong` and heartbeat messages, cap connections at 16 combined, and end after 30 seconds. SSE bypasses compression and sets `X-Accel-Buffering: no`. The Node 22 script checks unauthorized SSE and incremental delivery too.

`pnpm dev` uses the custom entry point with Next HMR (default port 8080; override with `PORT`). Server TypeScript changes require restarting it. `pnpm build` generates Prisma, builds Next, and compiles the server into `apps/web/dist`; `pnpm start` runs it without `tsx`. No standalone output is used. SIGTERM ends SSE, closes WebSockets with code 1012, and drains for at most 10 seconds inside the manifest's 20-second grace period.

The next checkpoint is **0A: Kubernetes deployment foundation**, followed by live captions in milestone 1. All four hackathon tracks are planned: Radar operations, Dash0 observability, Sonar/Gitar development review, and Elasticsearch as the core shared-content store and passage search layer. See the [deployment plan](docs/deployment.md) and [integration scope](docs/hackathon.md).

## Agent MCP servers

`.mcp.json` (Claude Code) and `.codex/config.toml` (Codex) configure one MCP server per hackathon tool. They hold URLs and environment variable names only; never add tokens, because the repository is public.

| Server          | Tool                  | Sign-in                                                                                                                 |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `radar-cloud`   | Radar Cloud           | Browser OAuth. Accept the Radar Cloud invite first, then choose **Cloud Native Hackathon** under "Organization access". |
| `dash0`         | Dash0 (AWS US West)   | Browser OAuth with your Dash0 team organization account.                                                                |
| `elasticsearch` | Elastic Agent Builder | API key in `ELASTIC_MCP_AUTHORIZATION`, formatted as `ApiKey <encoded key>`.                                            |

Gitar runs as a GitHub App and has no MCP server. Its review instructions live in `.gitar/review/`; CI is `.github/workflows/check.yml`. Never commit to `main`: open every change as a pull request so CI and Gitar review it.

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

See [agent skill provenance and updates](docs/agent-skills.md) for pinned sources, installation commands, and the retired Next.js best-practices skill. Live captions are confirmed as OpenAI `gpt-realtime-whisper` through server-only AI SDK streaming windows ([Plan B](docs/architecture.md#transcription-and-text-passes)); dependencies and runtime integration remain unimplemented and unverified.

## Local capture sink

Run `pnpm exec tsx scripts/capture-sink.ts` beside `pnpm dev` for a local-only WebSocket sink at `ws://127.0.0.1:8787`. Pass that URL to `HostCapture` in a host integration harness; Track 1's host controls are a separate integration. The sink acknowledges binary frames and prints only frame counts, arrival rate, last sequence/sample offset, and validation errors on disconnect. It has no authentication, persistence, or transcription and binds only to loopback.

## Local frame upload verification

After `pnpm services:up`, run `pnpm exec vitest run apps/web/src/server/frames/s3.integration.test.ts --reporter=verbose`. This stores synthetic WebP bytes through the upload handler, reads the object back with a signed request, checks anonymous denial, and removes the test object. It skips explicitly when the loopback gateway is unavailable; a reachable misconfigured gateway fails the test. It never reads cloud credentials or contacts a cloud endpoint.

For browser integration, supply the `.env.example` S3 settings and opt-in `CAPTIONS_DEV_SESSION` in `apps/web/.env.local`, then run `pnpm dev`. `ScreenCapture` is a passive module for the host UI: construct it with an epoch, `/api/sessions/<id>/frames`, and `hostCapture.getCaptureSampleOffset`; call `start()` from an explicit host gesture after audio starts and call `stop()` when the host stops. Use `subscribe`/`getSnapshot` for health. This PR does not add a host UI or production authorization.
