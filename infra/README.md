# Local services

Run the repository's `services:up` command to start PostgreSQL and SeaweedFS. The Compose project is `simon-says`; all published ports bind to localhost.

- PostgreSQL: `127.0.0.1:54329`, database and user `simon_says`, password `local-simon-says`.
- S3 endpoint: `http://127.0.0.1:19000`, region `us-east-1`, bucket `simon-says`.
- S3 access key: `simon-says-local`; secret key: `local-simon-says-storage`.

These credentials are for local development only. The bucket initializer is idempotent. The S3 gateway requires signed requests; anonymous access is denied. The gateway is the only storage port published to the host. Named volumes retain data when services stop. Do not use `docker compose down --volumes` unless you intend to delete local data.

With the services running, `./infra/check-storage.sh` verifies signed object writes and reads, rejects an anonymous read, and removes its probe object.

The deployment target is Kubernetes operated through Radar. CloudNativePG is proposed for deployed PostgreSQL; private object storage remains undecided. These local services do not establish deployed retention or access guarantees.

See the [deployment plan](../docs/deployment.md) for checkpoint 0A. Container packaging, cluster manifests, CI delivery, Secrets, and migration Jobs are planned, not present. Preserve local Compose for development.
