# Contracts

Status: proposed. Implement runtime schemas in `packages/contracts`; derive types rather than maintaining duplicate interfaces. Times below are session-relative milliseconds.

## Records

| Record            | Required concepts                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session           | Host, status, ingest epoch/lease, clock mapping, endedAt, retention deadlines                                                                               |
| Membership        | Session, principal, host/attendee role, permissions, revocation                                                                                             |
| AudioChunk        | Epoch, sequence, start/end, checksum, private object key, durable acknowledgment                                                                            |
| TranscriptSegment | Stable ID, epoch, time range, words, revision, live/repaired/corrected provenance                                                                           |
| ScreenObservation | Epoch, capture time, frame ID, checksum, dimensions, capture state                                                                                          |
| ScreenFrame       | Private image object and retention references                                                                                                               |
| Bookmark          | Owner, session, operation ID, live/paragraph anchor, clock uncertainty, requested/actual ranges, segment revisions, frame IDs, note, revision, completeness |
| Recap             | Owner, bookmark revisions, takeaways, evidence spans, frame references, status                                                                              |

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

Private bookmark and recap status never enters the shared caption channel. Use bounded polling of owner-only bookmark and recap reads while the relevant view is open, including stale-result changes. Validate membership on stream creation and enforce revocation while connected. Bound payload sizes, queue sizes, and session duration. Pod restart or rollout reconnects transport without ending the session. Persist leases and replay state outside pod memory; reject stale epochs across all pods. Provider reconnects retain source-clock mapping. Persist a finalized transcript offset separately from audio acknowledgments; replay retained, unfinalized audio with overlap deduplication. Report unrecoverable transcript gaps separately from audio gaps. Disable shared caching for member and owner responses.

Duplicate audio epoch/sequence with the same checksum acknowledges the existing chunk; changed content conflicts. Bookmark retries reuse an operation ID; a deliberate second mark gets a new ID. Stale edits conflict instead of overwriting. Save acknowledgments distinguish local pending data from server persistence.

Recap requests persist an owner-scoped recap and durable generation job, then return the recap ID for the existing status endpoint. Request retries use an operation ID to reuse the same recap and job. Recap generation binds to source revisions. Check them again before publishing the result. Edits, deletion, redaction, and expiry invalidate affected results. Empty or unresolved selections do not produce unsupported takeaways. Validate model source IDs and evidence excerpts before saving.

## Search and indexing

A search request carries query text, a bounded result limit, and an optional opaque cursor. Keep query text out of URLs and telemetry. Require current session membership before searching. Return passage IDs, segment IDs and revisions, source ranges, authorized excerpts, and an indexing state such as current, catching up, or unavailable. Do not treat stale or unavailable search as an authoritative empty result.

An indexed passage contains session ID, stable passage ID, segment revisions, source range, finalized text, and expiry. It excludes interim captions, private notes, bookmarks, recaps, audio, and images. Revalidate every candidate against Postgres before returning text; discard inaccessible, expired, redacted, or superseded results. Do not expose raw index responses or unauthorized counts.

Selecting a result creates an owner-scoped paragraph bookmark through the existing mutation contract. Validate current source access and revisions again at save time. Search scores never establish evidence or change source timestamps.

Write durable indexing work with transcript changes. Use idempotent revision-aware upserts and deletion tombstones so delayed jobs cannot restore redacted content. Retry failures, track index lag, and verify deletion through the search API and index. Revocation denies access immediately through Postgres checks even while index cleanup is pending.

## Runtime and telemetry

Proposed `/healthz` reports process liveness; `/readyz` reports whether the pod can serve its core routes with required persistence. A Dash0 or Elasticsearch outage must not make live caption service unready. Neither endpoint exposes configuration or credentials. On termination, stop admitting new streams and let clients reconnect within a bounded drain period.

Use allowlisted telemetry fields for operation, outcome, duration, source lag, retry count, and opaque correlation IDs. Never export query text, transcript, frame content, notes, prompt bodies, tokens, or signed URLs. Verify both manual spans and automatic instrumentation.
