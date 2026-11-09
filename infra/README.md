# Local services

Run the repository's `services:up` command to start PostgreSQL. The Compose project is `simon-says`; its published port binds to localhost.

- PostgreSQL: `127.0.0.1:54329`, database and user `simon_says`, password `local-simon-says`.

These credentials are for local development only. The named volume retains data when the service stops. Do not use `docker compose down --volumes` unless you intend to delete local data.

The deployment target is Kubernetes operated through Radar. Deployed PostgreSQL uses CloudNativePG. This local service does not establish deployed retention or access guarantees.

## Kubernetes files (offline only)

See the [deployment plan](../docs/deployment.md) and [local commands](../README.md#local-container-and-transport-probes). `k8s/` contains the Deployment, Service, starter HTTPRoute, CloudNativePG Cluster, migration Job, and kustomization for `team-simon-says`. Render without loading this machine's production kubeconfig:

```sh
KUBECONFIG=/dev/null kubectl kustomize infra/k8s
```

Run from the repository root. Rendering does not contact a cluster or validate installed CRDs. Never apply against the machine's default context. The kustomization pins the app image to a published full-SHA tag; deploy PRs update it. Main-only Actions publication and deploy PRs are described in the [release flow](../docs/deployment.md#release-flow-c1a). An operator must make the GHCR package public; no visibility change is automated.

The starter says the host routes `simon-says.cnh.radarhq.io` to Service `app`, port 80. Its HTTPRoute is retained for convention but is inert inside the vcluster, which has no Gateway.

App + database steady-state requests total 350m CPU / 768Mi, limits 1.5 CPU / 1536Mi, with one 1Gi PVC. During a one-pod app surge these total 600m / 1280Mi requests and 2.5 CPU / 2560Mi limits. This leaves space inside the 2 CPU / 4Gi requests, 4 CPU / 8Gi limits, four-PVC budget for later jobs; re-budget before adding workers or storage. No privileged or host access is requested.

CloudNativePG creates `db-rw:5432` and Secret `db-app` with `uri`. The app references that Secret for `DATABASE_URL`; provider and probe settings reference `app-credentials` by key name only. These are optional. `SESSION_SECRET` is required: it comes from Secret `simon-says-session`, key `session-secret`, and new app pods do not start until it exists. Create it through Radar before the first sync that includes this reference; see [first release steps](../docs/deployment.md#first-release-and-one-time-operator-steps). No Secret values are committed.

`k8s/migration-job.yaml` is Job `db-migrate`, an Argo CD `Sync` hook that runs `prisma migrate deploy` from the app image after the database and before the app rollout; see [database migrations](../docs/deployment.md#database-migrations). It requests 100m CPU / 128Mi with limits of 500m / 512Mi while it runs. `argocd/application.yaml` sits outside the kustomization, with automated sync, pruning, and self-healing enabled. It is applied; re-applying or changing it requires separate explicit authorization through Radar on cluster `kiTZ7VFRruo`. Preserve local Compose for development.
