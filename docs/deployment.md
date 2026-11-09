# Kubernetes deployment plan

Status: checkpoint 0A local runtime, image, manifests, and build-only CI implemented; see [local evidence](implementation-plan.md#checkpoint-0a-local-evidence). The team cluster is provisioned; see [team environment](#team-environment). App deployment and provider connectivity remain unverified. This document does not authorize provisioning, publishing, GitOps activation, or deployment.

## Target and platform facts

Keep this repository, its Next.js app, shadcn/ui, Prisma, and local Compose services. Adapt deployment examples from the [Radar starter](https://github.com/skyhook-io/cnh-starter) into the monorepo; do not replace the checkout or import unrelated starter application code.

The starter describes a team cluster with Radar, Argo CD, and CloudNativePG available. Its gateway routes the team hostname to Service `app`, port 80, in `team-<team-name>`. The sample process listens on port 8080 with `/healthz` and `/readyz`. Confirm these against the assigned environment before applying manifests.

The starter's default delivery uses public GitHub/GHCR access and Argo CD deployment from `main`. Do not change repository or image visibility without authorization; arrange read/pull credentials if private access is needed. Activating GitOps changes the effect of future pushes: a push can deploy.

The provided environment ends November 13, 2026 according to the starter. Verify the cutoff with organizers and arrange authorized export, migration, or teardown before it. Event infrastructure availability cannot guarantee our proposed 30-day selected-evidence retention. The verified cluster ID, namespace, hostname, quota, and access are recorded below under [team environment](#team-environment), without secrets.

## Team environment

Verified through the Radar MCP on November 9, 2026:

- Radar Cloud organization **Cloud Native Hackathon**, cluster `simon-says` (id `kiTZ7VFRruo`), namespace `team-simon-says`, URL `https://simon-says.cnh.radarhq.io`. Pass the cluster id on every Radar MCP call; never target `cnh` or another team's cluster.
- The namespace runs the organizers' starter Deployment `app`; no Argo CD Application exists yet. Radar reports only the known CoreDNS rewrite issue shared by every team cluster.
- Budget across all namespaces: 2 CPU and 4 GiB of requests, 4 CPU and 8 GiB of limits, 4 PVCs, and 20 GiB of storage. The host refuses privileged, hostPath, hostNetwork, and hostPID pods.
- The Dash0 Kubernetes operator does not fit: its collector DaemonSet always mounts `/var/log/pods` through hostPath. Export telemetry from the app over OTLP instead.

External services verified on the same date:

- Dash0 organization in AWS US West (`us-west-2`); MCP access works through browser OAuth. App telemetry export is not implemented.
- Elastic Cloud Serverless Elasticsearch project in AWS `us-west-2`, Elasticsearch 9.7.0: `https://my-elasticsearch-project-fb0a5d.es.us-west-2.aws.elastic.cloud` with Kibana at the matching `.kb.` host. It has no indices yet. The `elastic` CLI and Agent Builder MCP work with a per-person API key.

Project MCP configuration lives in `.mcp.json` (Claude Code) and `.codex/config.toml` (Codex); the [README](../README.md#agent-mcp-servers) has sign-in steps. The files hold URLs and environment variable names only.

## Content persistence and network access

Elasticsearch on Elastic Cloud Serverless, using the hackathon trial, is the confirmed core shared-content store from milestone 1. CloudNativePG/Postgres via Prisma owns identity, sessions, membership, lease/epoch, private bookmarks/notes/recaps, finalized-transcript offset, audio acknowledgments, and job queue. Private object storage holds screen images; Elasticsearch holds observation metadata and object keys.

The team cluster budget is 2 CPU / 4 GiB requests and 4 CPU / 8 GiB limits total. Elasticsearch cannot fit beside the app and Postgres; run it on Elastic Cloud. The assigned quota is recorded under [team environment](#team-environment). This also makes Elasticsearch the core data layer required by its hackathon track.

Inject server-only `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY` from a cluster Secret at runtime. Scope the key to the required project/index ingest, read, and cleanup operations; confirm exact privileges before milestone 1. Permit and verify TLS network egress from the app/worker/cleanup workloads to Elastic Cloud, including the chosen inference endpoint’s network requirements. Never put keys in images, build arguments, client props, or `NEXT_PUBLIC_` variables. Agent access to the project is verified; app key scope and cluster connectivity remain unverified.

## Local foundation

`apps/web/server/index.ts` owns HTTP and upgrades. Next builds normally (no standalone output); TypeScript explicitly compiles the server, and `pnpm deploy --prod --legacy` packages its production dependency closure. The runtime image contains the build and production dependencies, runs as UID/GID 1000, and excludes environment files. Node 22.22.0 and pnpm 11.24.0 are pinned. Prisma generation is a build step; the current shell does not import the database client, and the runtime is not a migration image.

Readiness currently means Next is prepared and shutdown has not started. Liveness means the HTTP process is alive, including during preparation. External providers and persistence are deliberately excluded until core routes require them. Optional Secret references do not verify provider configuration or connectivity. `PORT` and the opt-in probe credential are validated at startup without logging values. Provider validation belongs at each provider's future initialization boundary.

The content-free authenticated transport probes, bounds, commands, and shutdown behavior are documented in [README](../README.md#local-container-and-transport-probes). They prove transport only; product identity, membership, leases, replay, and revocation remain milestone 1 work. Unknown production upgrades are rejected before handshake. Development forwards Next's HMR upgrades after preparation.

`infra/k8s` renders the app, Service `app:80` → 8080, starter HTTPRoute, and a one-instance CloudNativePG database. `infra/argocd/application.yaml` points at this repository and `infra/k8s` but has **no automatic sync policy** and has never been applied. The app preStop hook waits five seconds for endpoint removal to propagate before SIGTERM; this and the ten-second server drain fit inside the 20-second grace period. The delay is provisional until gateway rollout testing measures propagation. The migration outline is commented and excluded from kustomization. CI on PRs and pushes installs, checks, builds Next/server and the image, and renders offline; it has read-only repository permissions and no publishing or deployment steps.

## Delivery responsibilities

Track 2 owns runtime, image, manifests, and CI. Track 3 owns database schema, migration contents, storage requirements, and jobs. Track 1 verifies the delivered UI. The following includes local implementation and pending operator/product work:

1. Build from the repository root using the pinned Node/pnpm versions and frozen workspace lockfile. Generate Prisma and build Next.js. Package the required runtime files and workspace dependencies in a non-root Linux image; verify the cluster CPU architecture. Never include `.env` or provider credentials.
2. Use one custom Node entry point for Next.js HTTP and authenticated WebSocket upgrades. Compile/package that entry point explicitly. Next.js [custom-server guidance](https://nextjs.org/docs/app/guides/custom-server) warns that standalone output does not trace custom server files. Prove this combination before finalizing the Dockerfile. Preserve development HMR and add a real local ingest command when implemented.
3. Add liveness/readiness probes, resource requests/limits, runtime Secret references, and graceful termination. Start with one replica. Handle overlap during rolling updates through durable host fencing, shared replay, and source-clock continuity.
4. Keep manifests under `infra` and workflows under `.github/workflows`. Adapt the starter's service and GitOps wiring to these paths. Build/test before publishing immutable image tags/digests; deploy the verified image. Use one delivery writer and prevent manifest-update loops or competing CI releases.
5. Use CloudNativePG with persistent storage for Postgres; verify provisioning and recovery. Choose private object storage separately: managed S3-compatible storage or a verified persistent in-cluster service. Local SeaweedFS is not production configuration. Verify signed reads/writes, anonymous denial, restart persistence, capacity, and recovery for the chosen service.
6. Run versioned Prisma migrations once per release using a serialized Job before rollout. Do not migrate from every pod startup. Prefer additive changes compatible with the previous image; rollback cannot undo destructive schema changes. Verify backup/restore before real captured data.
7. Propose a Postgres-backed job worker from the same image for source cleanup and recaps, with durable leases and idempotent retries. Select its library before milestone 2. Cleanup uses durable progress and a scheduled Job/CronJob. Review total database connections and resource use for app, worker, and jobs.
8. Inject Dash0 OTLP and external service credentials at runtime. Scope Elastic keys and separate telemetry from capture content. Verify network access to each provider. No captured media belongs on ephemeral app disk.

[Next.js self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting) covers proxying, runtime environment variables, streaming, and cache behavior. Configure the gateway for WebSocket upgrades and unbuffered SSE. Member and owner responses must not use shared caches. Verify HTTPS and origin/cookie settings on the actual hostname.

## Checkpoint 0A acceptance

Local verification comes first: build and run the image, serve the app, pass probes, exercise WebSocket and SSE transport probes, and verify graceful shutdown. These probes establish transport feasibility, not working transcription.

After deployment authorization, verify the assigned cluster:

- Deployed revision and immutable image match the tested build; app and static assets load over HTTPS.
- Radar reports healthy resources; readiness and liveness have distinct, correct behavior.
- Gateway passes WebSocket and SSE traffic without buffering; reconnect works after pod replacement.
- Prisma reaches the database; migrations run once; private storage persists and denies anonymous reads.
- Runtime Secrets stay out of images, responses, logs, and telemetry; Dash0 receives a content-free test operation.
- A failed rollout can return to a known working image without losing durable data. Record schema compatibility limits.

Milestone 1 separately proves real audio, two caption readers, timestamps, durable Elasticsearch segment/observation writes, Postgres offsets/acknowledgments, replay, and stop fencing. Resolve write ordering and crash recovery before acceptance. Elasticsearch outages visibly degrade captions without silently dropping content. Milestone 2 proves resolution/search; later milestones complete jobs, isolation, and resumable lifecycle cleanup.

## Pending operator decisions

Confirm cluster identifiers and access, available quota/storage class, image registry permissions, object storage, backup destination, provider accounts, and the post-event data plan. Keep operator commands and environment-specific manifests pending until these values are verified. Record actual commands in README only after running them successfully.

## S4 private frame storage proposal (not applied)

`infra/k8s/object-storage.yaml` proposes SeaweedFS 3.80 as one pod with master, volume, filer, and S3 gateway and a single 5 Gi PVC. It is deliberately absent from `kustomization.yaml`, pending Track 3's storage/retention agreement (decision due C1). A ClusterIP exposes only S3 port 8333; there is no public route. An operator must supply Secret `frame-storage` key `s3.json` with credentialed identities scoped to bucket `simon-says`, no anonymous identity, and create that bucket with a signed request. Neither credentials nor a bucket policy granting public access are included. PVC permissions, image UID compatibility, persistence/recovery, and anonymous denial must be verified before activation. This proposal has not been deployed.

SeaweedFS requests 100m CPU / 256 MiB, limits 500m / 512 MiB. With the app and Postgres, steady-state totals are 450m / 1024 MiB requests and 2 CPU / 2048 MiB limits. One app rollout surge raises totals to 700m / 1536 MiB requests and 3 CPU / 3072 MiB limits, below 2 CPU / 4 GiB requests and 4 CPU / 8 GiB limits. Two PVCs consume 6 GiB (Postgres 1 GiB plus frames 5 GiB), leaving two PVCs and 14 GiB within the four-PVC / 20-GiB budget. This excludes unimplemented workers/jobs; re-budget those before deployment. Volume files are capped at 512 MB each, at most six, leaving headroom for filer/master metadata; capacity and retention are not yet load-tested.

Server-only storage names match local Compose: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`. Proposed cluster endpoint is `http://frame-storage:8333`, bucket `simon-says`, path style true. Runtime credentials must come from a Secret; app manifest wiring is intentionally deferred. Local Next development reads these from `apps/web/.env.local`. `CAPTIONS_DEV_SESSION` and optional `CAPTIONS_DEV_EPOCH` enable only the local frame prototype and must not be used as production authorization. Production frame upload remains disabled until the real access/epoch adapter and durable observation sink are wired.
