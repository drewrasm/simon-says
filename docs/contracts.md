# Contracts

Status: storage ownership is confirmed; payload schemas and runtime behavior remain proposed. Implement runtime schemas in `packages/contracts`; derive types rather than maintaining duplicate interfaces. Times below are session-relative milliseconds.

## Records

| Record                    | Owning store                                    | Required concepts                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                  | Postgres                                        | Principal and authentication identity                                                                                                                                              |
| Session                   | Postgres                                        | Host, status, ingest epoch/lease, clock mapping, endedAt, retention deadlines, finalized-transcript offset                                                                         |
| Membership                | Postgres                                        | Session, principal, host/attendee role, permissions, revocation                                                                                                                    |
| AudioChunk                | Postgres metadata; private object storage bytes | Epoch, sequence, start/end, checksum, private object key, durable acknowledgment. Deferred for the hackathon; ingest acks are ring-buffer receipt until it exists                  |
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

## Live caption ingest and events

Implemented as schemas in `packages/contracts` and pure rules in `packages/domain`; the server pipeline and host capture module that use them are separate changes. Runtime behavior with a live provider is unverified.

**Audio frames.** The host sends binary WebSocket messages: a 16-byte little-endian header (version 1, kind 1 = PCM16 mono, reserved, epoch u32, sequence u32, sample offset u32) followed by PCM16 samples at 24 kHz. Frames normally carry 2,400 samples (100 ms) and at most 4,800. The sample offset counts samples since capture start and is the session source clock: `ms = sampleOffset / 24`. A u32 offset covers about 49 hours. The host keeps up to 120 s of unacknowledged frames for resend.

**Control messages.** After connecting, the host sends `hello` with its epoch, highest unacknowledged sequence, and sample rate. The server replies `ready` with the sequence it has acknowledged through; the host resends everything after it. `ack` confirms receipt into the server ring buffer, not durable storage. Raw-audio persistence (the `AudioChunk` record) is deferred for the hackathon: until it exists, an acknowledged frame lost in a pod restart cannot be replayed, and the range becomes a visible `caption.gap` with reason `audio_missing`. Transcript finalization stays separate from receipt. `rejected` carries `unauthorized`, `stale_epoch`, `session_ended`, `invalid_frame`, `sequence_conflict`, or `overloaded`, and whether retrying can help.

**Segments.** A `TranscriptSegment` carries session, epoch, the transcription window that produced it, a stable segment ID, revision, `startMs`/`endMs`, text, provenance (`live`, `corrected`, `repaired`), and timing. Live timing is always `estimated` with an `uncertaintyMs` half-width, because streaming text has no provider timestamps. The Elasticsearch document ID is `sessionId:epoch:segmentId:revision`.

**Shared caption events** (SSE, discriminated by `kind`, each with `cursor` and `sessionId`):

| Kind              | Meaning                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `caption.interim` | Live, unstored text for one window with its start and estimated end; each event replaces that window's previous interim text |
| `caption.final`   | Final timed segments for a window; supersedes its interim text                                                               |
| `caption.gap`     | A source range with no transcript, because transcription failed or audio is missing                                          |
| `capture.state`   | Session state, audio receipt (`receiving`, `stalled`, `stopped`), and caption lag                                            |
| `clock.heartbeat` | Latest source-clock time received from the host                                                                              |

**Window rotation.** One window is one provider streaming call. A window rotates at the first pause of at least 300 ms after 15 s; after 25 s it rotates at the first quiet unit or speech low point (quietest quarter of the last second and 3 dB under its median); at 27 s it rotates regardless. The next window is pre-opened 1 s before the minimum. Pauses are judged on 20 ms units against an adaptive noise floor. Every sample before a cut belongs to the earlier window.

**Timing estimate.** Interim text is placed at the audio offset sent when it arrived, minus measured lag. Final text is split into sentences; each sentence end maps to the delta arrival timeline by relative character position. Ranges are contiguous, inside the window, and the last sentence ends at the window end. Without deltas, sentences are spread linearly with uncertainty of half the window.

## Search and source durability

A search request carries query text, a bounded result limit, and an optional opaque cursor. Keep query text out of URLs and telemetry. Require current session membership before searching. Return passage IDs, segment IDs and revisions, source ranges, authorized excerpts, and an indexing state such as current, catching up, or unavailable. Do not treat stale or unavailable search as an authoritative empty result.

Keyword search plus `semantic_text` operates over shared segments and glossary terms in Elasticsearch. Confirm the inference endpoint and processing settings in the selected project before assuming Jina or another model. Return current segment revisions and source ranges, preserving earlier revisions for provenance.

Selecting a result creates an owner-scoped paragraph bookmark through the existing mutation contract. Validate current source access and revisions again at save time. Search scores never establish evidence or change source timestamps.

Elasticsearch source writes participate in durable acknowledgment. Do not advance the Postgres finalized-transcript offset or publish a durable source event before the corresponding content is durable. Milestone 1 must specify cross-store write ordering, retry/reconciliation, visibility, and crash recovery; audio receipt acknowledgment and transcript finalization remain separate. Elasticsearch failures visibly degrade captions and retain retryable source work or expose gaps, never silently lose content.

Use durable Postgres cleanup jobs and deletion tombstones/guards so delayed writes cannot restore redacted or expired documents. Verify interrupted Elasticsearch expiry, redaction, and deletion resume safely. Materialize permitted selected evidence before shared-source expiry. Revocation denies access immediately through Postgres checks even while cleanup is pending.

## Runtime and telemetry

Proposed `/healthz` reports process liveness; `/readyz` reports whether the pod can serve its core routes with required persistence. A Dash0 outage must not make live caption service unready. Elasticsearch is required persistence: expose its failure in readiness and caption health; define degraded ingest/retry behavior in milestone 1. Neither endpoint exposes configuration or credentials. On termination, stop admitting new streams and let clients reconnect within a bounded drain period.

Use allowlisted telemetry fields for operation, outcome, duration, source lag, retry count, and opaque correlation IDs. Never export query text, transcript, frame content, notes, prompt bodies, tokens, or signed URLs. Verify both manual spans and automatic instrumentation.
