# Contracts

Runtime boundary schemas and derived types. Import modules by path; there is no barrel.

- `@simon-says/contracts/audio-frame`: binary PCM16 host audio frame codec and source-clock helpers.
- `@simon-says/contracts/ingest`: JSON control messages on the host ingest WebSocket.
- `@simon-says/contracts/caption`: transcript segments, deterministic segment document IDs, and the shared caption event feed.
- `@simon-says/contracts/session`: session creation, invitation join, membership roles, and session status.
- `@simon-says/contracts/bookmark`: live/paragraph anchors, fixed source ranges, private evidence, and revision conflicts.
- `@simon-says/contracts/search`: bounded POST search requests, source passages, and indexing status.
- `@simon-says/contracts/recap`: revision-bound generation requests, cited takeaways, status, and Markdown export format.

See [contracts](../../docs/contracts.md#live-caption-ingest-and-events) for behavior.
See [Track 3 payload decisions](../../docs/contracts.md#track-3-payloads) for the private API schemas.
