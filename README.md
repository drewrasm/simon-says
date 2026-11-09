# Simon Says

One conference session feed. Personal takeaways.

The host captures the speaker's microphone once. Attendees join by QR code, read live captions, and save moments. Each attendee gets a private recap with source passages.

## Try it

The app is deployed at <https://simon-says.cnh.radarhq.io>. No account is needed.

1. **Host:** open `/host/new`, name the session, and select **Open lobby**. On the host page, choose a microphone and start captions. The host page shows a QR code and a join link.
2. **Join:** on a second device or in a private window, scan the QR code or open the link. Live captions appear as the host speaks.
3. **Save a moment:** select **Clip last 30s**, or select caption lines and clip them. Add a note if you want one.
4. **Review:** open **My notes** to see your clips, search the talk by idea, and select **Generate recap**. **Ask about this talk** on the session page answers questions from the captions.

To run the app yourself, see [Local setup](#local-setup). For what a local run shows with and without provider keys, see [What works without provider keys](#what-works-without-provider-keys). For current gaps, see [Known limits](#known-limits).

## Start here

Planned work, status, blockers, and evidence are tracked in the [simon-says Shortcut workspace](https://app.shortcut.com/simon-says). Its planning docs:

- [Delivery plan](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzA4LWQ4YWUtNDE2NS1hNzg0LTI4MmQ4YWVmNDNkZCI=): **start here today** — deadline, cut, per-track checkpoints, and working agreement. Status lives on each track's stories.
- [Implementation plan](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzODUyLTVmY2MtNGU0YS05Y2IwLTNlMjc4MGY4M2UxOSI=): ordered milestones, acceptance checks, and evidence recorded before the move to Shortcut.
- [Building tracks](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzlmLWMzMDMtNGUwYy1hOTBhLWM4MzJjZGU3ZDQwNSI=): three-builder ownership, handoffs, and first working slices.
- [Hackathon integrations](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzc1LTA2YmQtNDllNS04NjZhLTg0NmY2NTczYzk5NyI=): four sponsor tracks, accounts, owners, and evidence.

In this repository:

- [Product](docs/product.md): experience, MVP, and limits.
- [Architecture](docs/architecture.md): monorepo ownership, data flow, and invariants.
- [Contracts](docs/contracts.md): records, APIs, and event semantics.
- [Deployment plan](docs/deployment.md): Kubernetes through Radar, prerequisites, and release checks.
- [Design system](docs/design-system.md): shadcn preset, tokens, components, and reference page at `/design-system`.
- [Decisions](docs/decisions.md): confirmed choices, proposals, and open questions.
- [Agent instructions](AGENTS.md): how to work in this repository, including the Shortcut workflow.

## Local setup

Use Node.js 22.22.0, pnpm 11.24.0, and Docker with Compose. From the repository root:

```sh
cp .env.example .env
sed -i.bak '/^ELASTICSEARCH_.*=$/d' .env && rm .env.bak
pnpm install --frozen-lockfile
pnpm services:up
pnpm db:generate
pnpm db:validate
pnpm db:check
pnpm --filter @simon-says/db migrate:deploy
pnpm check
pnpm build
set -a; . ./.env; set +a
pnpm dev
```

Open `http://localhost:8080`. If port 8080 is in use, run `PORT=8081 pnpm dev` instead.

Notes on the steps:

- The `sed` line removes the empty `ELASTICSEARCH_*` entries from your `.env`. The server refuses to start when `ELASTICSEARCH_URL` is exported but empty. Skip the line if you fill those values in.
- `pnpm services:up` starts PostgreSQL with local credentials. `pnpm services:down` stops it. Do not use local credentials for deployed services.
- `migrate:deploy` applies the committed migrations and installs or upgrades the `pgboss` schema for recap jobs. The database scripts read the root `.env` themselves.
- `pnpm dev` does not read `.env`. The `set -a` line exports `DATABASE_URL` and `SESSION_SECRET` into the shell that starts the server. Without them the pages load but session creation and joining fail.
- `pnpm check` runs lint, formatting, type checking, and tests. `pnpm db:check` checks the database connection.

To try a session locally, open `/host/new` in one window and the join link in a private window. Use `localhost`: the device cookie is `Secure` on any other host, so a phone on a LAN IP over HTTP cannot join. Test phones against the deployed HTTPS URL.

The workspace uses Next.js and shadcn/ui for the application, with Prisma for PostgreSQL.

### What works without provider keys

The steps above set no provider keys. The app starts and degrades visibly. Add keys to your `.env` (ignored by Git), then run the `set -a; . ./.env; set +a` line again and restart `pnpm dev`. The server reads keys only from its shell environment. Never commit a key or put one in a `NEXT_PUBLIC_` variable.

| Configuration                                                      | What you see                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No keys                                                            | Hosting and joining work by QR code or link. No captions appear; the host page reports that transcription is not configured. A saved moment stays pending with no source passage. Search and Ask report that search is unavailable. Recap generation fails. |
| `OPENAI_API_KEY`                                                   | Live captions appear. They are held in memory only, and the host page reports that transcript storage is not configured. Saved moments, search, Ask, and recaps behave as with no keys, because they read captions from Elasticsearch.                      |
| `OPENAI_API_KEY`, `ELASTICSEARCH_URL`, and `ELASTICSEARCH_API_KEY` | The full flow: captions are stored, saved moments resolve to source passages, and search, Ask, and recaps work. Create the indices first with `pnpm es:setup`; see the next section for a local Elasticsearch.                                              |

`OPENAI_API_KEY` is used for live captions, recaps, and Ask. `CAPTION_MODEL` and `RECAP_MODEL` are optional overrides.

### Local Elasticsearch mappings and smoke check

Use Elastic start-local in Docker, separately from the repository's Postgres Compose service. If installed at `~/simon-says-elastic-local`, start it there with `./start.sh`. Load its local credentials without printing them (the generated `.env` uses shell variable expansion):

```sh
set -a
. "$HOME/simon-says-elastic-local/.env"
set +a
export ELASTICSEARCH_URL=http://localhost:9200
export ELASTICSEARCH_API_KEY="$ES_LOCAL_API_KEY"
export ELASTICSEARCH_INFERENCE_ID=.multilingual-e5-small-elasticsearch
pnpm es:setup --dry-run
pnpm es:setup
pnpm es:setup
pnpm es:smoke
unset ELASTICSEARCH_API_KEY ES_LOCAL_API_KEY ES_LOCAL_PASSWORD
```

Setup creates `segments-v1` and its `simon-says-segments` write alias, verifies the mapping on rerun, fails on drift, and repairs aliases atomically. `--dry-run` performs reads only. Smoke accepts only `http://localhost:9200` and the local E5 endpoint; it writes three synthetic finalized segments under reserved session `es-smoke-c1b`, checks overlap/semantic queries, duplicate IDs, create conflicts and strict fields, then deletes only those reserved documents. Do not use that session ID for application data or run the smoke concurrently. The first E5 inference may need a model download/deployment and adequate Docker memory; failures are reported, not replaced with fake vectors. No cloud connection is part of local verification.

The mappings' inference endpoint is parameterized and defaults to `.jina-embeddings-v5-text-small`, which Track 3 [decided](docs/decisions.md#confirmed-by-the-track-3-owner). See [storage contracts](docs/contracts.md#elasticsearch-v1-storage-boundary) and [approval-gated operator setup](docs/deployment.md#elasticsearch-setup-operator-approval-required).

## Known limits

- **One replica.** The deployment runs one app replica. Caption fan-out, replay, and the cap of four concurrent recap generations are in-process, so they do not survive a restart or span replicas.
- **No accounts.** Each browser gets an anonymous device cookie. Notes and recaps belong to that browser; another browser or device is a different attendee.
- **Recaps are not durable jobs.** A recap is generated in the web process after the request returns. If the process restarts first, the recap is marked failed and you generate a new one.
- **No screen sharing.** The host shares the microphone only, and saved moments carry caption passages only.
- **The hosted environment is temporary.** The hackathon cluster is scheduled to end on November 13, 2026. The live URL stops working then.

## Deployment and hackathon scope

The deployment target is Kubernetes operated through Radar. The app ships as an explicitly compiled Next.js custom server in a non-root container; `infra/k8s` holds its manifests, and Argo CD syncs them from `main`. Cluster writes require separate authorization; see the [deployment plan](docs/deployment.md).

All four hackathon tracks are in scope: Radar operations, Dash0 observability, Sonar/Gitar development review, and Elasticsearch as the core shared-content store and passage search layer. See the [integration scope](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzc1LTA2YmQtNDllNS04NjZhLTg0NmY2NTczYzk5NyI=).

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

`pnpm dev` uses the custom entry point with Next HMR (default port 8080; override with `PORT`). Server TypeScript changes require restarting it. `pnpm build` generates Prisma, builds Next, and compiles the server into `apps/web/dist`; `pnpm start` runs it without `tsx`. No standalone output is used. SIGTERM commits caption tail windows within five seconds (or emits gaps), then ends caption SSE; probes close with code 1012. The process drains for at most 10 seconds inside the manifest's 20-second grace period.

## Agent MCP servers

`.mcp.json` (Claude Code) and `.codex/config.toml` (Codex) configure one MCP server per hackathon tool, plus Shortcut for project tracking. They hold URLs and environment variable names only; never add tokens, because the repository is public.

| Server          | Tool                  | Sign-in                                                                                                                 |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `radar-cloud`   | Radar Cloud           | Browser OAuth. Accept the Radar Cloud invite first, then choose **Cloud Native Hackathon** under "Organization access". |
| `dash0`         | Dash0 (AWS US West)   | Browser OAuth with your Dash0 team organization account.                                                                |
| `elasticsearch` | Elastic Agent Builder | API key in `ELASTIC_MCP_AUTHORIZATION`, formatted as `ApiKey <encoded key>`.                                            |
| `shortcut`      | Shortcut              | Browser OAuth with your Shortcut workspace account.                                                                     |

Gitar runs as a GitHub App and has no MCP server. Its review instructions live in `.gitar/review/`; CI is `.github/workflows/check.yml`. Never commit to `main`: open every change as a pull request so CI and Gitar review it, with the sole exception of [guarded machine-generated deploy-tag PRs](docs/decisions.md#c1a-release-tags).

- **Claude Code:** start a session in this repository and approve the project servers. Run `/mcp`, pick `radar-cloud`, `dash0`, and `shortcut`, and choose **Authenticate**.
- **Codex:** trust this project, then run `codex mcp login radar-cloud`, `codex mcp login dash0`, and `codex mcp login shortcut`.

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

See [agent skill provenance and updates](docs/agent-skills.md) for pinned sources, installation commands, and the retired Next.js best-practices skill. Live captions are confirmed as OpenAI `gpt-realtime-whisper` through server-only AI SDK streaming windows ([Plan B](docs/architecture.md#transcription-and-text-passes)).

## S3 offline caption verification

`pnpm exec vitest run apps/web/src/server/captions/pipeline.test.ts` exercises the real AI SDK with a fake transcription model plus local WebSocket/SSE clients. It needs no provider configuration or services. `pnpm check` checks the full workspace; `pnpm build` builds Next and bundles the custom Node server. `pnpm dev` rebuilds the server entry point before starting Next development mode; restart it after editing server modules.

Without `DATABASE_URL`, the caption transport is disabled unless a single `CAPTIONS_DEV_SESSION` is explicitly configured outside production. Missing provider configuration reports degraded state. Tests inject a model directly and never call OpenAI. The segment sink uses Elasticsearch when configured, with an in-memory development fallback. Acknowledgments, epoch fencing, and SSE replay are process-local: they do not survive restarts or span replicas. With `DATABASE_URL`, caption access uses the real membership check in every environment. See [S3 configuration](docs/deployment.md#s3-caption-configuration-server-only) and [pipeline architecture](docs/architecture.md#transcription-and-text-passes).

## Local capture sink

Run `pnpm exec tsx scripts/capture-sink.ts` beside `pnpm dev` for a local-only WebSocket sink at `ws://127.0.0.1:8787`. Pass that URL to `HostCapture` in a host integration harness; Track 1's host controls are a separate integration. The sink acknowledges binary frames and prints only frame counts, arrival rate, last sequence/sample offset, and validation errors on disconnect. It has no authentication, persistence, or transcription and binds only to loopback.

## Local Elasticsearch segment integration

With Elastic start-local running at `http://localhost:9200` and its credentials in `~/simon-says-elastic-local/.env`, run:

```sh
pnpm es:test:local
```

This command refuses other origins, overrides ambient ES credentials with the local key, runs `pnpm es:setup` with `.multilingual-e5-small-elasticsearch`, then tests fake-model caption persistence, deterministic IDs, real 409 replay, and time-range overlap. Synthetic documents are removed afterward. An unreachable local server prints an explicit skip; start it with `cd ~/simon-says-elastic-local && ./start.sh`. Ordinary `pnpm test` skips this opt-in integration. No OpenAI request is made. For local app runtime persistence, supply server-only `ELASTICSEARCH_URL` / `ELASTICSEARCH_API_KEY` in the app environment; missing configuration visibly degrades the development feed.
