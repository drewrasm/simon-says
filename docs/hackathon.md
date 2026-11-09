# Hackathon integrations

Status: the team selected technology from all four sponsor tracks on November 9, 2026. Integrations are planned, not implemented or verified. The Radar team cluster is provisioned, and Radar and Dash0 MCP access works; see [deployment](deployment.md#team-environment). The [implementation plan](implementation-plan.md) is the completion record; the [building tracks](building-tracks.md) assign the three builders.

## Required scope and evidence

The [hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources) identify Sonar/Gitar, Dash0, Radar, and Elasticsearch. The table defines our delivery scope, not a guarantee of prize eligibility.

| Sponsor track                      | Simon Says use                                                                                                  | Owner and timing                                                                 | Evidence required                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sonar: Never Merge Broken          | Gitar review of feature PRs using project-specific conventions                                                  | Track 1 coordinates setup in 0A; all builders use it from their first feature PR | A real review, a finding assessed by a builder, and verification of any resulting fix                                                    |
| Dash0: Stop Flying Blind           | Content-free telemetry, plus Agent0/MCP diagnosis                                                               | Track 2 starts in 0A/1; track 3 extends as features land                         | Real app traces/metrics, inspected payloads with no captured content, and an Agent0/MCP diagnosis tied to an observed request or problem |
| Radar: AI SRE                      | Cluster runs the app and Postgres, operated and investigated through Radar UI/MCP                               | Track 2 drives 0A and subsequent releases                                        | Running app, verified deployed image, Radar UI/MCP operations, and a real investigation with a recorded conclusion                       |
| Elasticsearch: Find the Right Talk | Core shared-content store on Elastic Cloud; keyword and semantic passage search with explicit private selection | Track 2 ingest in 1; track 3 resolution/search and track 1 UI in 2               | Durable segment revisions and frame observations, useful queries, source-linked selections, and verified access/deletion behavior        |

Collect evidence during ordinary development. Do not invent incidents or claim a configured SDK proves a working integration. Search stays within sessions the attendee can access; this plan does not introduce a public conference catalog.

## Accounts and access

| Service                                                | Needed access                                                                                      | Status                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub/GHCR                                            | Repository administration for app installation, CI, image publication, and GitOps read/pull access | Repository is public; image publication and package access unverified                                                                     |
| [Radar team environment](https://join.cnh.radarhq.io/) | Team invites, assigned cluster ID, namespace, hostname, and authenticated MCP                      | Cluster provisioned; MCP reads the team namespace; teammate invites open                                                                  |
| [Dash0](https://www.dash0.com/)                        | Team organization, dataset, OTLP endpoint/token, Agent0, and MCP access                            | Organization in AWS US West; MCP configured; ingest unverified                                                                            |
| [Gitar](https://app.gitar.ai/)                         | Repository administrator installs the GitHub App for this repo after reviewing permissions         | App connected to repo by owner; review instructions and CI added in PR, unverified until a PR is reviewed; auto-apply off                 |
| [Elastic Cloud](https://cloud.elastic.co/)             | Search project, scoped API key, and inference endpoint                                             | Serverless hackathon-trial project in AWS us-west-2; agent CLI and MCP access verified; app key scope and cluster connectivity unverified |
| Transcription and recap providers                      | Account, processing/retention settings, keys, and budget                                           | OpenAI only via AI SDK; hackathon credits; key, quota, retention, and runtime unverified; recap model open                                |
| Database and object storage                            | Persistent Postgres and private object access from the cluster                                     | CloudNativePG selected, unverified; object storage undecided                                                                              |

Store runtime credentials in cluster Secrets or an approved secret manager. Keep values out of chat, git, images, build arguments, and browser bundles. An account does not establish quota, connectivity, or permission to deploy.

## Caption provider configuration

OpenAI is the only model provider, paid with hackathon OpenAI credits. Inject server-only `OPENAI_API_KEY` from Secret `app-credentials` in namespace `team-simon-says`; configure `CAPTION_MODEL=gpt-realtime-whisper` and `CAPTION_DELAY=low` server-side. Never use `NEXT_PUBLIC_` variables. The browser connects only to our ingest server, never directly to OpenAI; no client secrets or ephemeral tokens.

Permit TLS/WebSocket egress to `api.openai.com`. When the key is issued, verify credits, quota, and cluster connectivity. Check OpenAI API data-retention terms for the capture/join disclosures before real recording. The first real transcription call happens in the cluster with the key in the Secret; key-free domain unit tests and fake transcription-model tests precede it. No provider call or key access is part of this documentation change.

Raw-audio object persistence is deferred today; the two-minute host resend and pod ring buffers bound recovery. Single-replica in-process SSE fan-out requires a shared event source before multi-replica delivery, including rolling overlap. Tune `delay` and window thresholds on a real microphone before milestone 1 acceptance.

## Gitar enablement boundary

The [Gitar quickstart](https://docs.gitar.ai/quickstart) describes GitHub App installation and automatic PR review comments. Our coding-agent policy prohibits posting PR comments. The repository administrator must explicitly approve the separate Gitar bot's review behavior before activation. Do not install it silently or claim a comment-free mode exists without verifying one.

`.gitar/review/` holds the review instructions (architecture boundaries, security and privacy, data integrity, documentation consistency), and `.github/workflows/check.yml` runs `pnpm check` and `pnpm build` on every PR so Gitar has CI results to diagnose. Neither has been exercised yet; the first reviewed PR is the evidence. Keep auto-apply, automatic pushes, and merges disabled unless separately authorized. Agents can read findings and implement authorized fixes without replying on PRs. SonarQube Cloud is not an additional requirement in this plan.

## Data and failure boundaries

Dash0 receives allowlisted metadata only. Inspect auto-instrumentation for SQL parameters, request bodies, query strings, headers, provider payloads, and exception messages before real capture. Search queries can reveal sensitive content and must not enter telemetry. Radar logs and investigations must follow the same content rules; share only sanitized evidence.

Elasticsearch on Elastic Cloud Serverless (hackathon trial) is the system of record for shared source content: every transcript segment revision with live/corrected/repaired provenance and screen observations with capture time, frame ID, checksum, glossary terms, and object key. Private object storage holds images. Track 2 writes content during ingest from milestone 1; track 3 resolves fixed session-clock bookmark ranges and search against it, with track 1 owning search UI in milestone 2.

Postgres (CloudNativePG via Prisma) owns identity, sessions, membership, lease/epoch, audio acknowledgments, finalized-transcript offset, bookmarks, private notes, recaps, and job queue. No private data or identity-linked search queries enter Elasticsearch. Every read, including search, resolution, and replay, first checks current Postgres membership and access, including after revocation. Expiry, redaction, and deletion require durable, resumable document cleanup; materialize selected evidence before shared-source expiry.

Elasticsearch outages visibly degrade captions and must not silently drop content. Milestone 1 must settle cross-store durable acknowledgment and write ordering. Search-only or telemetry outages leave captions and saved evidence usable when shared-content persistence is healthy. Elastic Cloud avoids an in-cluster Elasticsearch deployment that cannot fit beside the app and Postgres within the team budget (2 CPU / 4 GiB requests, 4 CPU / 8 GiB limits total). The Elastic track requires the core data layer, not a side feature.

Use keyword search plus `semantic_text` over segments and glossary terms with an explicit inference endpoint. The project lists Jina text embedding and reranking endpoints through the Elastic Inference Service, including `.jina-embeddings-v5-text-small` and `.jina-reranker-v3`. Confirm cost and processing settings before indexing real captured content. The [Elastic semantic search guide](https://www.elastic.co/docs/solutions/search/semantic-search/semantic-search-semantic-text) explains ingestion-time embeddings and endpoint selection. Model selection remains open; do not treat the service default as a confirmed Jina integration.

## Completion record

For each integration, record the tested revision, environment, evidence link, observed result, and remaining limitations in the implementation plan. Include no credentials or private captured content. Four-track delivery requires all four rows above; extra dashboards, autonomous fixes, and advanced search filters remain optional.
