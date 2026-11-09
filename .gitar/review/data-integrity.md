# Source timestamps, isolation, and durability

Source of truth: `docs/contracts.md`, `docs/architecture.md`.

- **Source clock:** transcript time ranges derive from our source clock mapped from sent audio offsets, never from provider timestamps. Session times are session-relative milliseconds (`startMs`/`endMs`).
- **Owner isolation:** every source read (search, bookmark resolution, replay, snapshot) checks current membership in Postgres before querying Elasticsearch, including after revocation. Bookmark, note, and recap reads and writes are owner-scoped. Never return raw Elasticsearch responses or unauthorized counts.
- **Epoch fencing:** ingest writes (audio, frames) require the current lease and ingest epoch. Ended sessions reject new audio and frames. Stale epochs must conflict, not overwrite.
- **Idempotency:** Elasticsearch document IDs derive deterministically (segments from session ID, epoch, segment ID, revision; observations from session ID, epoch, observation ID). Retries reuse IDs; changed content at an existing revision conflicts. Duplicate audio epoch/sequence with the same checksum acknowledges the existing chunk; changed content conflicts. Bookmark and recap retries reuse an operation ID.
- **Durable replay:** do not advance the Postgres finalized-transcript offset or publish a durable event before the content is durable in Elasticsearch. Audio receipt acknowledgment and transcript finalization stay separate. Missing audio is distinct from missing transcript. Failures degrade visibly or keep retryable work; they never silently drop content.
- **Revision and expiry guards:** bookmark saves and recap publishes re-check current source revisions, expiry, and redaction. Stale edits conflict. Cleanup jobs use tombstones so delayed writes cannot restore redacted or expired documents.
- Bound payload sizes, queue sizes, connection counts, and session duration.
