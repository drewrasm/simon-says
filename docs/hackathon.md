# Hackathon integrations

Status: the team selected technology from all four sponsor tracks on November 9, 2026. Integrations are planned, not implemented or verified. Cluster access is being arranged. The [implementation plan](implementation-plan.md) is the completion record; the [building tracks](building-tracks.md) assign the three builders.

## Required scope and evidence

The [hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources) identify Sonar/Gitar, Dash0, Radar, and Elasticsearch. The table defines our delivery scope, not a guarantee of prize eligibility.

| Sponsor track                      | Simon Says use                                                                                                             | Owner and timing                                                                 | Evidence required                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sonar: Never Merge Broken          | Gitar review of feature PRs using project-specific conventions                                                             | Track 1 coordinates setup in 0A; all builders use it from their first feature PR | A real review, a finding assessed by a builder, and verification of any resulting fix                                                    |
| Dash0: Stop Flying Blind           | Content-free OpenTelemetry for caption lag, disconnects, indexing, saves, and recap failures; Agent0 and MCP for diagnosis | Track 2 starts in 0A/1; track 3 extends as features land                         | Real app traces/metrics, inspected payloads with no captured content, and an Agent0/MCP diagnosis tied to an observed request or problem |
| Radar: AI SRE                      | Kubernetes deployment operations, rollout health, and investigations                                                       | Track 2 drives 0A and subsequent releases                                        | Running app, verified deployed image, Radar UI/MCP operations, and a real investigation with a recorded conclusion                       |
| Elasticsearch: Find the Right Talk | Keyword and semantic search of session passages, followed by explicit private selection                                    | Track 3 backend and track 1 UI in 2A                                             | Real indexed passages, useful queries, source-linked selections, and verified access/deletion behavior                                   |

Collect evidence during ordinary development. Do not invent incidents or claim a configured SDK proves a working integration. Search stays within sessions the attendee can access; this plan does not introduce a public conference catalog.

## Accounts and access

| Service                                                | Needed access                                                                                      | Status                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| GitHub/GHCR                                            | Repository administration for app installation, CI, image publication, and GitOps read/pull access | Repository exists; deployment permissions and package access unverified |
| [Radar team environment](https://join.cnh.radarhq.io/) | Team invites, assigned cluster ID, namespace, hostname, and authenticated MCP                      | User is arranging access                                                |
| [Dash0](https://www.dash0.com/)                        | Team organization, dataset, OTLP endpoint/token, Agent0, and MCP access                            | Pending verification                                                    |
| [Gitar](https://app.gitar.ai/)                         | Repository administrator installs the GitHub App for this repo after reviewing permissions         | Pending explicit enablement                                             |
| [Elastic Cloud](https://cloud.elastic.co/)             | Search project, scoped API key, and inference endpoint                                             | Pending; Serverless is proposed                                         |
| Transcription and recap providers                      | Account, processing/retention settings, keys, and budget                                           | Providers remain open; Deepgram and AI SDK are proposals                |
| Database and object storage                            | Persistent Postgres and private object access from the cluster                                     | CloudNativePG proposed; object storage undecided                        |

Store runtime credentials in cluster Secrets or an approved secret manager. Keep values out of chat, git, images, build arguments, and browser bundles. An account does not establish quota, connectivity, or permission to deploy.

## Gitar enablement boundary

The [Gitar quickstart](https://docs.gitar.ai/quickstart) describes GitHub App installation and automatic PR review comments. Our coding-agent policy prohibits posting PR comments. The repository administrator must explicitly approve the separate Gitar bot's review behavior before activation. Do not install it silently or claim a comment-free mode exists without verifying one.

Prepare `.gitar/review/` instructions during authorized implementation for source timestamps, owner isolation, epoch fencing, durable replay, and documentation consistency. Keep auto-apply, automatic pushes, and merges disabled unless separately authorized. Agents can read findings and implement authorized fixes without replying on PRs. SonarQube Cloud is not an additional requirement in this plan.

## Data and failure boundaries

Dash0 receives allowlisted metadata only. Inspect auto-instrumentation for SQL parameters, request bodies, query strings, headers, provider payloads, and exception messages before real capture. Search queries can reveal sensitive content and must not enter telemetry. Radar logs and investigations must follow the same content rules; share only sanitized evidence.

Elasticsearch stores finalized shared passages, never private notes or recaps. It is a derived index with durable revision updates and deletion retries. Postgres access and lifecycle checks apply before every result and selection. Caption delivery and private saves remain usable during search or telemetry outages.

Propose keyword search plus `semantic_text` with an explicit inference endpoint. Confirm Jina availability, cost, and processing settings in the selected Elastic project before choosing it. The [Elastic semantic search guide](https://www.elastic.co/docs/solutions/search/semantic-search/semantic-search-semantic-text) explains ingestion-time embeddings and endpoint selection. Model selection remains open; do not treat the service default as a confirmed Jina integration.

## Completion record

For each integration, record the tested revision, environment, evidence link, observed result, and remaining limitations in the implementation plan. Include no credentials or private captured content. Four-track delivery requires all four rows above; extra dashboards, autonomous fixes, and advanced search filters remain optional.
