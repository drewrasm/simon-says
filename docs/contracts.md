# Contracts

Status: storage ownership is confirmed; payload schemas and runtime behavior remain proposed. Implement runtime schemas in `packages/contracts`; derive types rather than maintaining duplicate interfaces. Times below are session-relative milliseconds.

## Records

| Record                    | Owning store                                    | Required concepts                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                  | Postgres                                        | Principal and authentication identity                                                                                                                                              |
| Session                   | Postgres                                        | Host, status, ingest epoch/lease, clock mapping, endedAt, retention deadlines, finalized-transcript offset                                                                         |
| Membership                | Postgres                                        | Session, principal, host/attendee role, permissions, revocation                                                                                                                    |
| AudioChunk                | Postgres metadata; private object storage bytes | Epoch, sequence, start/end, checksum, private object key, durable acknowledgment                                                                                                   |
| TranscriptSegment         | Elasticsearch                                   | Session, stable segment ID, epoch, `startMs`/`endMs`, words, every revision, live/repaired/corrected provenance, expiry                                                            |
| ScreenObservation         | Elasticsearch                                   | Session, epoch, capture time, frame ID, checksum, dimensions, capture state, slide glossary terms, private image object key, expiry                                                |
| ScreenFrame               | Private object storage                          | Image bytes; observations reference the object key, Postgres tracks retained selection references                                                                                  |
| Bookmark and private note | Postgres                                        | Owner, session, operation ID, live/paragraph anchor, clock uncertainty, requested/actual ranges, materialized evidence, segment revisions, frame IDs, note, revision, completeness |
| Recap                     | Postgres                                        | Owner, bookmark revisions, takeaways, evidence spans, frame references, status                                                                                                     |
| Job                       | Postgres                                        | Work kind, idempotency key, lease, retry state, durable cleanup progress                                                                                                           |

Elasticsearch on Elastic Cloud Serverless is the shared-content system of record. Postgres uses CloudNativePG via Prisma. Private bookmarks, notes, recaps, and identity-linked search queries never enter Elasticsearch. Images remain in private object storage; Elasticsearch stores only their object keys.

Track 2 writes segments and observations during ingest. Segment document IDs derive deterministically from session ID, ingest epoch, segment ID, and revision. Observation document IDs derive from session ID, epoch, and stable observation ID (retain distinct capture times even for identical frame checksums). Retries and replay reuse IDs; changed content at an existing revision conflicts. Preserve all segment revisions and provenance until lifecycle cleanup.

Every source read (search, bookmark resolution, replay, or snapshot) checks current membership and access in Postgres before querying Elasticsearch, including after revocation. Enforce current source revision, expiry, and redaction guards before delivery. Never expose raw Elasticsearch responses or unauthorized counts.

Bookmark resolution queries Elasticsearch by fixed requested `startMs`/`endMs` on the session clock, filtered to segment revisions and frames. Include the valid frame at range start and changes inside it. Later arrivals can fill evidence but cannot move the requested range.

Transcript time ranges use our source clock mapped from sent audio offsets, not provider timestamps. Optional milestone 2–3 correction writes new revisions using the existing `corrected` provenance and preserves original text; it never blocks live captions.

Session states: setup, live, degraded, ended, expired. Keep transport health, transcript finality, bookmark persistence, and evidence completeness separate.

## API

HTTP endpoints run as Next.js Route Handlers in `apps/web`. The proposed audio WebSocket uses a custom Node upgrade handler in the same application container; verify its packaging in checkpoint 0A and live routing in milestone 1. Endpoint paths below are logical contracts, not scaffolded routes.

| Operation                                            | Contract                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /api/sessions`                                 | Authorized host creates a session                                                |
| `POST /api/sessions/:id/join`                        | Exchange invitation for attendee membership                                      |
| `POST /api/sessions/:id/end`                         | Host-only, idempotent stop; fence ingest and persist end/expiry times            |
| `WS /api/sessions/:id/ingest`                        | Host audio/clock messages; require current lease and epoch                       |
| `POST /api/sessions/:id/frames`                      | Timestamped images; require host role, current lease and epoch                   |
| `GET /api/sessions/:id/events`                       | Member-only, reconnectable SSE with replay cursor and snapshot fallback          |
| `POST /api/sessions/:id/search`                      | Member-only bounded query; return authorized source passages and indexing status |
| `PUT /api/bookmarks/:id`                             | Owner-only idempotent create/update with expected revision                       |
| `GET /api/me/bookmarks?sessionId=...`                | Return the current attendee's selections                                         |
| `DELETE /api/bookmarks/:id`                          | Owner deletion plus recap invalidation                                           |
| `POST /api/sessions/:id/recaps`                      | Generate for current owner from expected bookmark revisions                      |
| `GET /api/me/recaps/:id`                             | Owner-only takeaways, evidence, generation status, and staleness                 |
| `GET /api/me/recaps/:id/export`                      | Authorized portable HTML or Markdown                                             |
| `DELETE /api/sessions/:id/memberships/:membershipId` | Host-only revocation; terminate member access                                    |
| `POST /api/sessions/:id/redactions`                  | Host-only source-range redaction and dependent-result invalidation               |

Specify lifecycle payload schemas alongside their implementation. Ended sessions reject new audio and frames; ending does not prematurely revoke permitted recap access. Complete revocation and redaction before a public pilot.

## Event and mutation rules

Each session event carries a cursor, session ID, event kind, entity ID/revision, and source time where applicable. Event kinds include transcript update, frame observation, capture state, and clock heartbeat. Use a discriminated schema per kind.

Private bookmark and recap status never enters the shared caption channel. Use bounded polling of owner-only bookmark and recap reads while the relevant view is open, including stale-result changes. Validate membership on stream creation and enforce revocation while connected. Bound payload sizes, queue sizes, and session duration. Pod restart or rollout reconnects transport without ending the session. Persist leases and replay state outside pod memory; reject stale epochs across all pods. Provider reconnects retain source-clock mapping. Persist a finalized transcript offset and separate audio acknowledgments in Postgres; replay retained, unfinalized audio with overlap deduplication. Report unrecoverable transcript gaps separately from audio gaps. Disable shared caching for member and owner responses.

Duplicate audio epoch/sequence with the same checksum acknowledges the existing chunk; changed content conflicts. Bookmark retries reuse an operation ID; a deliberate second mark gets a new ID. Stale edits conflict instead of overwriting. Save acknowledgments distinguish local pending data from server persistence.

Recap requests persist an owner-scoped recap and durable generation job, then return the recap ID for the existing status endpoint. Request retries use an operation ID to reuse the same recap and job. Recap generation binds to source revisions. Check them again before publishing the result. Edits, deletion, redaction, and expiry invalidate affected results. Empty or unresolved selections do not produce unsupported takeaways. Validate model source IDs and evidence excerpts before saving.

## Search and source durability

A search request carries query text, a bounded result limit, and an optional opaque cursor. Keep query text out of URLs and telemetry. Require current session membership before searching. Return passage IDs, segment IDs and revisions, source ranges, authorized excerpts, and an indexing state such as current, catching up, or unavailable. Do not treat stale or unavailable search as an authoritative empty result.

Keyword search plus `semantic_text` operates over shared segments and glossary terms in Elasticsearch. Confirm the inference endpoint and processing settings in the selected project before assuming Jina or another model. Return current segment revisions and source ranges, preserving earlier revisions for provenance.

Selecting a result creates an owner-scoped paragraph bookmark through the existing mutation contract. Validate current source access and revisions again at save time. Search scores never establish evidence or change source timestamps.

Elasticsearch source writes participate in durable acknowledgment. Do not advance the Postgres finalized-transcript offset or publish a durable source event before the corresponding content is durable. Milestone 1 must specify cross-store write ordering, retry/reconciliation, visibility, and crash recovery; audio receipt acknowledgment and transcript finalization remain separate. Elasticsearch failures visibly degrade captions and retain retryable source work or expose gaps, never silently lose content.

Use durable Postgres cleanup jobs and deletion tombstones/guards so delayed writes cannot restore redacted or expired documents. Verify interrupted Elasticsearch expiry, redaction, and deletion resume safely. Materialize permitted selected evidence before shared-source expiry. Revocation denies access immediately through Postgres checks even while cleanup is pending.

## Runtime and telemetry

Checkpoint 0A implements `/healthz` as process liveness and `/readyz` as Next.js prepared and not shutting down (200/503). Persistence is not required by the current shell. Elasticsearch is required persistence for milestone 1: expose its failure in readiness and caption health, and define degraded ingest/retry behavior when core routes need it. A Dash0 outage must not make live caption service unready. Neither endpoint exposes configuration or credentials. SIGTERM stops admission, ends SSE, closes WebSockets with 1012, and drains within 10 seconds (20-second pod grace).

0A transport probes are separate from product APIs: opt-in `PROBE_TOKEN` authentication, `/api/probe/ws` accepts only text `ping` and replies `pong`, and `/api/probe/sse` emits one constant heartbeat per second without compression/buffering. They share a 16-connection cap and 30-second lifetime; WS payloads are limited to 32 bytes and 30 messages. Missing configuration disables probe access; invalid credentials reject before streaming/upgrade. They do not establish product identity or durable replay. See [runtime details](deployment.md#local-foundation).

Use allowlisted telemetry fields for operation, outcome, duration, source lag, retry count, and opaque correlation IDs. Never export query text, transcript, frame content, notes, prompt bodies, tokens, or signed URLs. Verify both manual spans and automatic instrumentation.
