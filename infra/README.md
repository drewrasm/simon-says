# Local services

Run the repository's `services:up` command to start PostgreSQL and SeaweedFS. The Compose project is `simon-says`; all published ports bind to localhost.

- PostgreSQL: `127.0.0.1:54329`, database and user `simon_says`, password `local-simon-says`.
- S3 endpoint: `http://127.0.0.1:19000`, region `us-east-1`, bucket `simon-says`.
- S3 access key: `simon-says-local`; secret key: `local-simon-says-storage`.

These credentials are for local development only. The bucket initializer is idempotent. The S3 gateway requires signed requests; anonymous access is denied. The gateway is the only storage port published to the host. Named volumes retain data when services stop. Do not use `docker compose down --volumes` unless you intend to delete local data.

With the services running, `./infra/check-storage.sh` verifies signed object writes and reads, rejects an anonymous read, and removes its probe object.

The deployment target is Kubernetes operated through Radar. CloudNativePG is proposed for deployed PostgreSQL; private object storage remains undecided. These local services do not establish deployed retention or access guarantees.

## Kubernetes files (offline only)

See the [deployment plan](../docs/deployment.md) and [local commands](../README.md#local-container-and-transport-probes). `k8s/` contains the Deployment, Service, starter HTTPRoute, CloudNativePG Cluster, and kustomization for `team-simon-says`. Render without loading this machine's production kubeconfig:

```sh
KUBECONFIG=/dev/null kubectl kustomize infra/k8s
```

Run from the repository root. Rendering does not contact a cluster or validate installed CRDs. Never apply against the machine's default context. The image `example.invalid/simon-says/app:REPLACE_BEFORE_DEPLOY` must be replaced by an operator with an authorized immutable reference. No registry publication or visibility change is configured. CI only checks and builds.

The starter says the host routes `simon-says.cnh.radarhq.io` to Service `app`, port 80. Its HTTPRoute is retained for convention but is inert inside the vcluster, which has no Gateway. Actual HTTPS, upgrade routing, and buffering remain unverified.

App + database steady-state requests total 350m CPU / 768Mi, limits 1.5 CPU / 1536Mi, with one 1Gi PVC. During a one-pod app surge these total 600m / 1280Mi requests and 2.5 CPU / 2560Mi limits. This leaves space inside the 2 CPU / 4Gi requests, 4 CPU / 8Gi limits, four-PVC budget for later jobs; re-budget before adding workers or storage. No privileged or host access is requested.

CloudNativePG is expected to create `db-rw:5432` and Secret `db-app` with `uri`. The app references that Secret for `DATABASE_URL`; provider and probe settings reference `app-credentials` by key name only. All are optional for the current shell. No Secret values are committed. A future persistence-backed app must make its required configuration explicit. The current image does not run migrations or contain the Prisma CLI.

`k8s/migration-job.yaml.example` is a commented outline, excluded from rendering, awaiting Track 3 migrations and a dedicated image plus release serialization. `argocd/application.yaml` is a file only, outside kustomization, with automatic sync disabled. Do not apply it or enable GitOps without separate authorization. Private repository/image access, database/storage persistence, backups, migration execution, Dash0, rollout, and rollback remain pending. Preserve local Compose for development.

The S4 frame-storage proposal is in `k8s/object-storage.yaml`, excluded from kustomization pending Track 3 agreement. It uses one additional 5 Gi PVC; see [budget and prerequisites](../docs/deployment.md#s4-private-frame-storage-proposal-not-applied). Nothing in that proposal has been applied.
