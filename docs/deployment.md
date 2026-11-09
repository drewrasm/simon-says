# Kubernetes deployment plan

Status: C1a adds GHCR publication and deploy-tag PRs; checkpoint 0A local runtime, image, and manifests are implemented; see [local evidence](implementation-plan.md#checkpoint-0a-local-evidence). The team cluster is provisioned; see [team environment](#team-environment). App deployment and provider connectivity remain unverified. This document does not authorize provisioning, publishing, GitOps activation, or deployment.

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

Inject server-only `ELASTICSEARCH_URL` and `ELASTICSEARCH_API_KEY` from a cluster Secret at runtime. Use the scoped descriptor and approval-gated operator steps below for index ingest, read, and document cleanup. Permit and verify TLS network egress from the app/worker/cleanup workloads to Elastic Cloud, including the chosen inference endpoint’s network requirements. Never put keys in images, build arguments, client props, or `NEXT_PUBLIC_` variables. Agent access to the project is verified; app key scope and cluster connectivity remain unverified.

## Elasticsearch setup (operator approval required)

C1b supplies mappings and local verification only. No cloud setup, cloud key creation, Secret change, cluster connection, or egress verification has been performed. Obtain explicit user approval for each external write below. Use Radar MCP with cluster id `kiTZ7VFRruo`; do not use kubectl/helm or the machine's default Kubernetes context.

1. Track 3 confirms the inference endpoint, availability, cost and processing/data handling settings. `.jina-embeddings-v5-text-small` is a configurable proposal. With approval to access the cloud project, load `ELASTICSEARCH_URL` with the team Elastic URL above, `ELASTICSEARCH_API_KEY` with a temporary operator credential from the secret manager, and `ELASTICSEARCH_INFERENCE_ID` with the confirmed endpoint. Setup needs index `manage` on the aliases and backing indices plus `create_index`; it does not create inference endpoints or keys. Never use this operator key in the app. `pnpm es:setup --dry-run` reads current mappings/aliases and prints the plan without writing. Review the plan, obtain approval, then run `pnpm es:setup` and repeat to verify idempotency. It fails on mapping drift without changing mappings or aliases; alias repair deliberately replaces filters/routing and all stale targets with the declared v1 write target.
2. After approval, create the app key in Kibana Dev Tools: run `POST /_security/api_key` with the exact JSON body from [`infra/elasticsearch/app-api-key.json`](../infra/elasticsearch/app-api-key.json). The operator must have `manage_own_api_key` (or `manage_api_key`) and the privileges being granted. Use the response's `encoded` value as `ELASTICSEARCH_API_KEY`; do not copy it into git, terminal history, PRs, or logs. The example expires after seven days; set an approved lifetime and rotate before expiry.
3. After approval, use Radar MCP against cluster `kiTZ7VFRruo`, namespace `team-simon-says`, to create or merge Secret `app-credentials`, preserving its other entries. Set `stringData.ELASTICSEARCH_API_KEY` to that encoded value and `stringData.ELASTICSEARCH_URL` to the team URL. Verify the existing Deployment's secret references and authorize its rollout separately. `ELASTICSEARCH_INFERENCE_ID` is an operator setup input; the selected endpoint is persisted in the index mapping.
4. With separate approval, verify app egress, synthetic ingest/search using the scoped key, and readiness from the team workload. Revoke the temporary operator key when done. Do not run `es:smoke` on the cloud: it accepts only `http://localhost:9200`.

The app descriptor grants `read`, `write` (including `create_doc`, updates and document deletes), and `view_index_metadata` on **only** `simon-says-segments`, `simon-says-observations`, `segments-v1`, and `observations-v1`. It grants no index creation, mapping/alias management, key management, or cluster privileges. No `monitor_inference` is granted: automatic inference through mapped `semantic_text` fields worked locally for indexing and semantic search with `cluster: []`. Direct calls to the [Inference API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-inference-inference) require `monitor_inference`; the app does not call that API directly. See [privileges](https://www.elastic.co/docs/reference/elasticsearch/security-privileges) and [automatic semantic inference](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/semantic-text). Cloud Jina/EIS permissions remain to be verified with approval; do not broaden privileges without evidence.

The tool pins `@elastic/elasticsearch` 9.5.1, the latest published v9 client available during implementation (9.7.0 was unavailable). It matches the server major version and uses APIs available before the documented cloud ES 9.7.0. Local ES is 9.5.6; this is not cloud compatibility verification. See the [storage contract](contracts.md#elasticsearch-v1-storage-boundary) for v2 reindex/cutover and key-scope updates.

## Caption provider configuration

OpenAI is the only model provider, paid with hackathon OpenAI credits. Inject server-only `OPENAI_API_KEY` from Secret `app-credentials` in namespace `team-simon-says`; configure `CAPTION_MODEL=gpt-realtime-whisper` and `CAPTION_DELAY=low` server-side. Never use `NEXT_PUBLIC_` variables. The browser connects only to our ingest server, never directly to OpenAI; no client secrets or ephemeral tokens.

Permit TLS/WebSocket egress to `api.openai.com`. When the key is issued, verify credits, quota, and cluster connectivity. Check OpenAI API data-retention terms for the capture/join disclosures before real recording. The first real transcription call happens in the cluster with the key in the Secret; key-free domain unit tests and fake transcription-model tests precede it. No provider call or key access is part of this documentation change.

Raw-audio object persistence is deferred today; the two-minute host resend and pod ring buffers bound recovery. Single-replica in-process SSE fan-out requires a shared event source before multi-replica delivery, including rolling overlap. Tune `delay` and window thresholds on a real microphone before milestone 1 acceptance.

## Local foundation

`apps/web/server/index.ts` owns HTTP and upgrades. Next builds normally (no standalone output); TypeScript explicitly compiles the server, and `pnpm deploy --prod --legacy` packages its production dependency closure. The runtime image contains the build and production dependencies, runs as UID/GID 1000, and excludes environment files. Node 22.22.0 and pnpm 11.24.0 are pinned. Prisma generation is a build step; the current shell does not import the database client, and the runtime is not a migration image.

Readiness currently means Next is prepared and shutdown has not started. Liveness means the HTTP process is alive, including during preparation. External providers and persistence are deliberately excluded until core routes require them. Optional Secret references do not verify provider configuration or connectivity. `PORT` and the opt-in probe credential are validated at startup without logging values. Provider validation belongs at each provider's future initialization boundary.

The content-free authenticated transport probes, bounds, commands, and shutdown behavior are documented in [README](../README.md#local-container-and-transport-probes). They prove transport only; product identity, membership, leases, replay, and revocation remain milestone 1 work. Unknown production upgrades are rejected before handshake. Development forwards Next's HMR upgrades after preparation.

`infra/k8s` renders the app, Service `app:80` → 8080, starter HTTPRoute, and a one-instance CloudNativePG database. `infra/argocd/application.yaml` points at this repository and `infra/k8s`, enables automated sync with pruning and self-healing, and has not been applied in C1a. The app preStop hook waits five seconds for endpoint removal to propagate before SIGTERM; this and the ten-second server drain fit inside the 20-second grace period. The delay is provisional until gateway rollout testing measures propagation. The migration outline is commented and excluded from kustomization. The consolidated `check.yml` keeps the `check` and `container` jobs: installs, checks, Next/server build, amd64 image build, local transport/shutdown probes, and offline rendering. PR jobs have read-only repository permissions; the gated main-only publish job has narrowly scoped write permissions.

## Release flow (C1a)

Choose deploy PRs (option a), preserving the rule that every change to `main` goes through CI and Gitar review. Unlike the [starter workflow](https://github.com/skyhook-io/cnh-starter/blob/main/.github/workflows/deploy.yaml), Actions never commits directly to `main`.

1. Merge a source PR to `main`. `check` and `container` must pass before the publish job builds Linux/amd64 and pushes `ghcr.io/drewrasm/simon-says:<full-commit-sha>` plus `:main` using `GITHUB_TOKEN`. Publication runs only on main pushes or a manual dispatch on main; PRs and dispatches on feature/deploy branches cannot publish. No image is pushed locally.
2. After successful publication, Actions opens `deploy/<full-commit-sha>` changing only `images[].newName/newTag` in `infra/k8s/kustomization.yaml`, with a `deploy:` commit. It dispatches `check.yml` on that branch because `GITHUB_TOKEN` PR creation does not trigger ordinary PR workflows. Both required checks run on the branch SHA. Obtain Gitar review explicitly if the bot-created PR does not trigger the GitHub App; an operator can close/reopen the PR to generate a human PR event.
3. Review and merge the deploy PR. A push changing only the kustomization is ignored, so it cannot publish itself in a loop. For recovery after a skipped or failed release, manually run `check.yml` with `workflow_dispatch` on `main` (Actions → check → Run workflow → Branch: main); this checks and publishes the current main SHA. Do not include source changes in a deploy PR. Close superseded deploy PRs; merging an older one later rolls back the image. Main runs are serialized. Both freshness checks fetch full history when shallow and compare the source SHA with current `origin/main`, excluding only `infra/k8s/kustomization.yaml`. They skip only when other files changed. If main advanced only through deploy commits, publication continues for the original source SHA and the deploy branch starts from current `origin/main`. Each skip or kustomization-only rebase decision emits a `::warning::` annotation and a job-summary line.
4. Once the Application is applied, Argo CD watches `main` and syncs the committed SHA automatically. Source merges start the release process; rollout waits for the deploy PR merge. Reverting an image reference through a PR rolls back runtime only, not database migrations.

Repository inspection on November 9 found `allow_auto_merge: false`. An administrator may enable **Settings → General → Pull Requests → Allow auto-merge** and configure required `check`, `container`, and Gitar review gates. An operator may then select auto-merge on each deploy PR; the workflow deliberately does not merge or bypass review. Until enabled, merge deploy PRs manually after review. Enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** (subject to owner policy). No PAT or provider API key is needed; the workflow uses `contents: write`, `packages: write`, `pull-requests: write`, and `actions: write` only in the publish job. If a setting blocks PR creation or dispatch, fix it and rerun the failed job; an existing PR is reused.

### Data-bearing resource protection

Automated sync and `selfHeal: true` remain enabled. The CloudNativePG `Cluster` `db`, which provisions the database PVC, carries `argocd.argoproj.io/sync-options: Prune=false,Delete=false`. Argo CD [combines resource sync options with commas](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/): `Prune=false` retains a resource removed or renamed in Git, and `Delete=false` retains it during Application deletion. Apply the same annotation to every future data-bearing or PVC-bearing resource in `infra/k8s`, including explicit PVCs and workloads that own persistent storage. The database Cluster is currently the only such resource.

Data-bearing resources must never be pruned or deleted by Argo CD. Removing them requires a separate manual, explicitly approved operation through Radar on cluster `kiTZ7VFRruo`, after backup/export and recovery review. A removed protected manifest leaves the Application out of sync; investigate it rather than overriding the protection. Keep the annotation in place. Application `syncPolicy.syncOptions` also includes `PruneLast=true`, delaying eligible stateless pruning until the final sync wave after other resources are healthy; this ordering does not replace data protection.

### First release and one-time operator steps

The initial `:main` manifest reference is a bootstrap reference, not a verified existing image. Merging C1a runs checks, publishes the first SHA and `main` tags, and opens the first deploy PR. Wait for that run to succeed and merge the SHA deploy PR **before applying the Application**. Do not apply this bootstrap state early. GHCR publication, package visibility, and the deployed user flow remain unverified until observed after merge.

1. After the first publish, the package owner opens the repository's **Packages → simon-says → Package settings → Change visibility → Public**, if not already public. Public source does not guarantee a public GHCR package. Verify anonymous pulls are allowed. This is a separate operator visibility change; C1a does not perform it.
2. Confirm the immutable deploy PR is merged and obtain the user's explicit approval for the cluster write. Use Radar MCP **`apply_resource`** with cluster **`kiTZ7VFRruo`** and the contents of `infra/argocd/application.yaml`. Never use this machine's default kube context. The Application is named `app` in namespace `team-simon-says`, project `team-simon-says`, source `infra/k8s`, revision `main`; Argo CD discovers Applications in team namespaces.
3. Applying it enables automatic sync, `prune: true`, and `selfHeal: true`. It adopts/updates the existing starter Deployment `app`, Service `app`, and HTTPRoute `app` by name, retaining the starter selector `app: app` and routing to port 8080 through Service port 80. It changes the starter's two replicas to one and rolls its image to Simon Says with our probes/security/resources. It also creates CloudNativePG Cluster `db` (one instance, one 1Gi PVC); the operator supplies `db-app`. It does not create a namespace or Gateway. The HTTPRoute remains inert in the vcluster; host routing stays organizer-managed. Pruning applies only to resources tracked by this Application; unrelated organizer resources and manually created Secrets are not targeted. Data-bearing resources are never pruned or deleted by Argo CD; see [data-bearing resource protection](#data-bearing-resource-protection). If live tracking/ownership differs from the documented starter, inspect it through Radar before approval.
4. Through Radar, verify the rollout, database readiness, deployed SHA image, `/healthz`, `/readyz`, HTTPS/static assets, and SSE/WebSocket transport on `https://simon-says.cnh.radarhq.io`. Record live evidence separately; offline rendering does not validate installed CRDs or deployment health.

App plus Postgres requests are 350m CPU / 768Mi and limits 1.5 CPU / 1536Mi; with one app surge pod, requests are 600m / 1280Mi and limits 2.5 CPU / 2560Mi. Against the total budget this leaves 1.4 CPU / 2816Mi requests, 1.5 CPU / 5632Mi limits, and three PVCs during surge, before other namespace workloads. Reserve room for frame storage and re-budget before adding it.

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
