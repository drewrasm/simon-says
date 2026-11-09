# Contracts

Status: proposed. Implement runtime schemas in `packages/contracts`; derive types rather than maintaining duplicate interfaces. Times below are session-relative milliseconds.

## Records

| Record | Required concepts |
| --- | --- |
| Session | Host, status, ingest epoch/lease, clock mapping, endedAt, retention deadlines |
| Membership | Session, principal, host/attendee role, permissions, revocation |
| AudioChunk | Epoch, sequence, start/end, checksum, private object key, durable acknowledgment |
| TranscriptSegment | Stable ID, epoch, time range, words, revision, live/repaired/corrected provenance |
| ScreenObservation | Epoch, capture time, frame ID, checksum, dimensions, capture state |
| ScreenFrame | Private image object and retention references |
| Bookmark | Owner, session, operation ID, live/paragraph anchor, clock uncertainty, requested/actual ranges, segment revisions, frame IDs, note, revision, completeness |
| Recap | Owner, bookmark revisions, takeaways, evidence spans, frame references, status |

Session states: setup, live, degraded, ended, expired. Keep transport health, transcript finality, bookmark persistence, and evidence completeness separate.

## API

| Operation | Contract |
| --- | --- |
| `POST /api/sessions` | Authorized host creates a session |
| `POST /api/sessions/:id/join` | Exchange invitation for attendee membership |
| `POST /api/sessions/:id/end` | Host-only, idempotent stop; fence ingest and persist end/expiry times |
| `WS /api/sessions/:id/ingest` | Host audio/clock messages; require current lease and epoch |
| `POST /api/sessions/:id/frames` | Timestamped images; require host role, current lease and epoch |
| `GET /api/sessions/:id/events` | Member-only SSE with replay cursor and snapshot fallback |
| `PUT /api/bookmarks/:id` | Owner-only idempotent create/update with expected revision |
| `GET /api/me/bookmarks?sessionId=...` | Return the current attendee's selections |
| `DELETE /api/bookmarks/:id` | Owner deletion plus recap invalidation |
| `POST /api/sessions/:id/recaps` | Generate for current owner from expected bookmark revisions |
| `GET /api/me/recaps/:id` | Owner-only takeaways, evidence, generation status, and staleness |
| `GET /api/me/recaps/:id/export` | Authorized portable HTML or Markdown |
| `DELETE /api/sessions/:id/memberships/:membershipId` | Host-only revocation; terminate member access |
| `POST /api/sessions/:id/redactions` | Host-only source-range redaction and dependent-result invalidation |

Specify lifecycle payload schemas alongside their implementation. Ended sessions reject new audio and frames; ending does not prematurely revoke permitted recap access. Complete revocation and redaction before a public pilot.

## Event and mutation rules

Each session event carries a cursor, session ID, event kind, entity ID/revision, and source time where applicable. Event kinds include transcript update, frame observation, capture state, and clock heartbeat. Use a discriminated schema per kind.

Private bookmark and recap status never enters the shared caption channel. Use bounded polling of owner-only bookmark and recap reads while the relevant view is open, including stale-result changes. Validate membership on stream creation and enforce revocation while connected. Bound payload sizes, queue sizes, and session duration.

Duplicate audio epoch/sequence with the same checksum acknowledges the existing chunk; changed content conflicts. Bookmark retries reuse an operation ID; a deliberate second mark gets a new ID. Stale edits conflict instead of overwriting. Save acknowledgments distinguish local pending data from server persistence.

Recap generation binds to source revisions. Check them again before publishing the result. Edits, deletion, redaction, and expiry invalidate affected results. Empty or unresolved selections do not produce unsupported takeaways. Validate model source IDs and evidence excerpts before saving.
