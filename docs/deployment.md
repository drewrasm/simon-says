# Kubernetes deployment plan

Status: selected target, pending implementation and verification. The user is arranging cluster access. Milestone 0 remains locally verified; checkpoint 0A prepares this deployment. This document does not authorize provisioning, publishing, GitOps activation, or deployment.

## Target and platform facts

Keep this repository, its Next.js app, shadcn/ui, Prisma, and local Compose services. Adapt deployment examples from the [Radar starter](https://github.com/skyhook-io/cnh-starter) into the monorepo; do not replace the checkout or import unrelated starter application code.

The starter describes a team cluster with Radar, Argo CD, and CloudNativePG available. Its gateway routes the team hostname to Service `app`, port 80, in `team-<team-name>`. The sample process listens on port 8080 with `/healthz` and `/readyz`. Confirm these against the assigned environment before applying manifests.

The starter's default delivery uses public GitHub/GHCR access and Argo CD deployment from `main`. Do not change repository or image visibility without authorization; arrange read/pull credentials if private access is needed. Activating GitOps changes the effect of future pushes: a push can deploy.

The provided environment ends November 13, 2026 according to the starter. Verify the cutoff with organizers and arrange authorized export, migration, or teardown before it. Event infrastructure availability cannot guarantee our proposed 30-day selected-evidence retention. Record the actual cluster ID, namespace, hostname, quota, and access in operator setup notes without secrets.

## Proposed implementation

Track 2 owns runtime, image, manifests, and CI. Track 3 owns database schema, migration contents, storage requirements, and jobs. Track 1 verifies the delivered UI. These are implementation proposals to validate in checkpoint 0A:

1. Build from the repository root using the pinned Node/pnpm versions and frozen workspace lockfile. Generate Prisma and build Next.js. Package the required runtime files and workspace dependencies in a non-root Linux image; verify the cluster CPU architecture. Never include `.env` or provider credentials.
2. Use one custom Node entry point for Next.js HTTP and authenticated WebSocket upgrades. Compile/package that entry point explicitly. Next.js [custom-server guidance](https://nextjs.org/docs/app/guides/custom-server) warns that standalone output does not trace custom server files. Prove this combination before finalizing the Dockerfile. Preserve development HMR and add a real local ingest command when implemented.
3. Add liveness/readiness probes, resource requests/limits, runtime Secret references, and graceful termination. Start with one replica. Handle overlap during rolling updates through durable host fencing, shared replay, and source-clock continuity.
4. Keep manifests under `infra` and workflows under `.github/workflows`. Adapt the starter's service and GitOps wiring to these paths. Build/test before publishing immutable image tags/digests; deploy the verified image. Use one delivery writer and prevent manifest-update loops or competing CI releases.
5. Propose CloudNativePG with persistent storage for Postgres. Choose private object storage separately: managed S3-compatible storage or a verified persistent in-cluster service. Local SeaweedFS is not production configuration. Verify signed reads/writes, anonymous denial, restart persistence, capacity, and recovery for the chosen service.
6. Run versioned Prisma migrations once per release using a serialized Job before rollout. Do not migrate from every pod startup. Prefer additive changes compatible with the previous image; rollback cannot undo destructive schema changes. Verify backup/restore before real captured data.
7. Propose a Postgres-backed job worker from the same image for indexing and recaps, with durable leases and idempotent retries. Select its library before milestone 2. Cleanup uses durable progress and a scheduled Job/CronJob. Review total database connections and resource use for app, worker, and jobs.
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

Milestone 1 separately proves real audio, two caption readers, timestamps, durable replay, and stop fencing. Later milestones prove search, jobs, isolation, and lifecycle cleanup.

## Pending operator decisions

Confirm cluster identifiers and access, available quota/storage class, image registry permissions, object storage, backup destination, provider accounts, and the post-event data plan. Keep operator commands and environment-specific manifests pending until these values are verified. Record actual commands in README only after running them successfully.
