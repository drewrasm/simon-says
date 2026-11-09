# Building tracks

Status: milestone 0 foundation is complete with local verification for the three-builder app in one Next.js app. See the [implementation plan](implementation-plan.md) for verification and remaining work. Feature tracks are not implemented yet. Checkpoint 0A adds Kubernetes deployment to the provisioned team cluster. Three builder tracks share responsibility for all four sponsor tracks.

## Divide ownership

| Track                            | Owns                                                                                                                                            | Main locations                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. UI and attendee experience    | Host controls, QR join, captions, private cards, search UI, recap display, Gitar setup coordination                                             | Pages and components in `apps/web`; `packages/ui`                                                                                                  |
| 2. Capture and transcription     | Browser capture, source clock, ingest, transcription, Elasticsearch segment/frame ingest, shared feed, host stop, Radar deployment, Dash0 setup | Capture module in `apps/web`; ingest and event modules in `apps/web/src/server`; timeline rules in `packages/domain`; `infra`; `.github/workflows` |
| 3. Private highlights and recaps | Identity, membership, private selections, Elasticsearch evidence resolution/search, generation, exports, data lifecycle                         | Access, bookmark, and recap modules in `apps/web/src/server`; selection rules in `packages/domain`; `packages/db`                                  |

Builders: Logan owns track 3 and Dylan owns track 2. Track 1's builder is not confirmed yet. The [delivery plan](delivery-plan.md) sets today's per-track checkpoints, path ownership, and status board.

[Architecture](architecture.md) defines package boundaries. [Contracts](contracts.md) defines shared records and operations. Keep provider SDKs, database access, and credentials in server code.

## Establish the shared foundation

1. Preserve completed milestone 0 and verify setup on the other builders' machines. Track 2 drives checkpoint 0A runtime and deployment, with track 3 reviewing persistence/migrations and track 1 verifying the served app. Do not replace this repository with the Radar starter.
2. Agree on the first runtime schemas together: session and membership identity, source clock and ingest epoch, transcript revisions, screen observations, and event cursors. Define bookmark and recap schemas before their milestones.
3. Agree on the capture module's start, stop, permission, preview, and health interface. Track 2 implements the module; track 1 connects the host controls.
4. Name one migration writer, initially track 3. Track 2 owns Elasticsearch segment and observation mappings/writes; track 3 coordinates Postgres schemas and reviews the shared-content contract. Sequence shared schema edits and migrations rather than editing the same definitions independently.

Before milestone 1 capture, tracks 2 and 3 confirm provider retention settings and the storage policy that track 1 presents in the disclosures. Elasticsearch is the shared-content store from milestone 1, with CloudNativePG/Postgres for access and private data and private object storage for images. Confirm the Elastic project, scoped API key, cluster connectivity, and cross-store acknowledgment ordering before milestone 1 acceptance.

Each track owns its feature tests and contract changes. Affected builders review shared changes before adopting them. Keep schemas in `packages/contracts`; do not copy types between tracks. Fixtures can unblock work after setup, but label them and use the agreed schemas. Fixtures do not complete live integration gates.

## Track 1: UI and attendee experience

Build the screens in this order:

1. **Join and read, milestone 1.** Add host setup, capture previews, processing and retention disclosures, QR invitations, attendee join, captions, and stop controls. Show capture and connection health. Preserve reader scroll position and provide **Return to live**.
2. **Save and inspect, milestone 2.** Add **Keep that**, paragraph selection, private cards, notes, range editing, and deletion. Distinguish local pending, durably saved, and incomplete evidence. Disable live marks when clock sync is stale; keep paragraph marks available.
3. **Search and select, milestone 2.** Add passage search, source preview, and explicit save actions using track 3's API. Show indexing delay, no matches, and unavailable states. Preserve live captions and private cards during search failure.
4. **Read and export, milestone 3.** Show recap progress, failure, staleness, source passages, images, and export actions. Use bounded polling of owner-only reads while the relevant view is open. Keep saved evidence usable when generation fails.
5. **Handle lifecycle and verify, milestones 4–5.** Display ended sessions, lost access, redacted evidence, and expiry. Verify keyboard access, focus, readable captions, and narrow attendee screens. Own the browser flow tests with service support from the other tracks.

Dependencies: track 2 supplies capture and shared events. Track 3 supplies session, membership, bookmark, and recap APIs. Attendee devices never capture audio or run transcription.

First working slice: two attendees join one session and read real shared captions.

## Track 2: Capture and transcription

Build the source timeline and shared feed in this order:

1. **Deploy the foundation, checkpoint 0A.** Own the Node entry point, container, health checks, CI image build, Kubernetes manifests, and Radar operations. Coordinate Secrets, migrations, and storage with track 3. Establish content-free Dash0 telemetry and hand each builder a span convention. Verify the local image before an authorized cluster release.
2. **Capture and stream, milestone 1.** Implement [Plan B](architecture.md#transcription-and-text-passes): 24 kHz PCM16 AudioWorklet capture in 100 ms frames with epoch/sequence/source offsets, a two-minute host resend buffer, backoff, and Node WebSocket ingest with Postgres lease/epoch checks, ring buffer, batched idempotent receipt acks, and checksum conflicts. Raw-audio object persistence is deferred today. Build pure pause detection, rotation planning, and timing estimation in `packages/domain`. In `apps/web/src/server/captions/`, use server-only AI SDK streaming with OpenAI `gpt-realtime-whisper`; WindowManager rotates at a 300 ms pause after 15 s or forces at 25 s, pre-opening the next window about 1 s early. CaptionAssembler replaces SSE-only interim text with sentence finals in window order, estimated ranges (`timing: { kind: "estimated", uncertaintyMs }`, about ±1–2 s), provenance `live`, revision 1, and idempotent ID `sessionId:epoch:segmentId:revision` (the segment carries its `windowId`). Write finals and timestamped screen observations to Elasticsearch; store images privately. Implement host stop with fencing and persisted end/expiry times.
3. **Verify transport, milestone 1.** Run domain unit tests and fake transcription-model tests without a key: source offsets, pause/forced cuts, ordered finals, interim replacement, duplicates, retries, gaps, and stop fencing. First real call happens in the cluster with `OPENAI_API_KEY` in Secret `app-credentials` in `team-simon-says`; verify credits, quota, egress, real-mic latency/word errors, `CAPTION_DELAY`, and window thresholds. Retry failed windows from the ring buffer up to twice, then emit `[startMs, endMs]` gaps. Resend unacked host frames; after pod restart resume at the first frame the host still holds and expose acknowledged-but-unfinalized audio as an `audio_missing` gap. Prove gateway WebSocket routing, unbuffered SSE, and reconnect recovery. Start with one replica for in-process fan-out; shared event delivery is required before multi-replica/rolling-overlap acceptance. Coordinate Postgres acks, finalized offsets, leases/epochs, and replay cursors with track 3. Settle Elasticsearch/Postgres write ordering and crash recovery; failures must visibly degrade captions without silent content loss. Deliver content-free Dash0 window spans and lag, rotation gap, duration, retries, errors, ingest backlog, reconnects, and Elasticsearch write latency; verify Agent0/MCP and Radar operations. Runtime feasibility remains unverified until these checks pass.
4. **Supply bookmark evidence, milestone 2.** Expose stable Elasticsearch source IDs, ranges, revisions, and capture health for track 3’s bookmark resolution. Every source read, replay, and snapshot first checks current access in Postgres, including after revocation. Complete authorized snapshot fallback and reconnect handling for the selection flow.
5. **Recover and verify, milestones 4–5.** Test duplicates, out-of-order messages, stale hosts, capture loss, and gaps. Apply revocation to connected streams. Extend the milestone 1 telemetry with recovery diagnostics in milestone 4. In milestone 5, test the target laptop, mic route, and browser; inspect caption errors, slide transitions, and screenshot legibility.

Dependencies: track 3 supplies host identity and membership checks. Track 2 owns capture behavior inside `apps/web`; track 1 owns its presentation. Private bookmark and recap events never enter the shared feed. Automatic repair transcription remains optional.

Proposed milestone 2–3 extension: OpenAI through the AI SDK for a changed-frame glossary and finalized-caption correction; choose the cheapest OpenAI model that passes the check at implementation. Track 2 supplies new `corrected` revisions and preserves original text; coordinate revision handling with track 3. Keep both passes off the live caption path and treat screen/transcript text as untrusted data. There are no live vocabulary hints. See [the confirmed decision](decisions.md#confirmed-by-the-track-2-owner).

First working slice: one real microphone feeds two caption views, a frame shares the source clock, and host stop rejects further audio and frames.

## Track 3: Private highlights and recaps

Build access and saved evidence before generation:

1. **Establish access, milestone 1.** Implement host identity, session creation, invitations, and distinct attendee memberships. Supply authorization checks for ingest, events, private APIs, and media. Coordinate the initial database schema and private storage setup with track 2.
2. **Save private evidence, milestone 2.** Implement owner-only bookmark writes and reads, operation IDs, revision conflicts, notes, range edits, and deletion. Resolve live and paragraph anchors with Elasticsearch session-clock `startMs`/`endMs` queries filtered to segment revisions and frames. Check current Postgres membership/access first. Later arrivals cannot move requested ranges. Align transcript revisions and screen observations by source time. Preserve incomplete states and separate notes when selections overlap.
3. **Search alongside highlights, milestone 2.** Own Elasticsearch resolution and keyword plus `semantic_text` queries over segments and glossary terms, with membership/source revalidation. Track 2 owns ingest mappings and writes from milestone 1; agree on the shared client boundary. The inference endpoint is `.jina-embeddings-v5-text-small`, confirmed in the project ([evidence](implementation-plan.md#elastic-cloud-setup-evidence)). Own durable cleanup jobs. Implement source lifecycle guards and invalidation now; complete lifecycle endpoints and scheduling in milestone 4. Supply track 1 with a bounded search API. Keep bookmarks, notes, recaps, and identity-linked queries out of Elasticsearch and prove redaction, expiry, revocation, revision updates, and outage behavior.
4. **Generate and export, milestone 3.** Reuse durable job execution with retries and timeout recovery. Generate from resolved selections only. Validate evidence excerpts and references, recheck revisions before saving, and expose owner-only status and staleness reads. Export HTML with embedded images and text-only Markdown. Empty selections make no model call; failures preserve saved evidence.
5. **Enforce lifecycle, milestone 4.** Implement revocation, host redaction, scheduled expiry, selected-evidence materialization, reference cleanup, and recap invalidation. Elasticsearch expiry/redaction/deletion and object cleanup must resume after interruption. Materialize permitted selected evidence before shared-source expiry. Track 2 applies access changes to active streams; track 1 displays their effects. Add content-free save and recap telemetry.
6. **Verify isolation, milestone 5.** Extend earlier ownership checks into end-to-end coverage. Prove that attendees cannot read each other's notes or recaps and that host access does not bypass ownership. Cover API reads, media, exports, and invalidation during generation.

Dependencies: track 2 supplies timestamped source records and capture health. Track 1 consumes the private APIs. Disable shared caching for member and owner responses.

First working slice: two attendees save different source intervals and retrieve only their own aligned text, images, and notes.

## Integrate at shared checkpoints

| Checkpoint                      | Handoff                                                                                             | Proof                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Foundation, milestone 0         | Setup driver provides tooling, local services, and documented commands                              | All three builders can install, check, and build                                      |
| Deployment, checkpoint 0A       | Track 2 packages and deploys; track 3 verifies persistence; track 1 verifies app delivery           | Authorized cluster release, probes, image identity, restart/rollback, and telemetry   |
| Shared captions, milestone 1    | Track 3 provides access; track 2 provides capture and feed; track 1 connects screens                | Real host, two readers, timestamped frame, working stop, and verified pod recovery    |
| Private highlights, milestone 2 | Track 2 provides durable sources; track 3 resolves bookmarks; track 1 displays evidence             | Different marks produce correctly aligned evidence with cross-user access denied      |
| Search, milestone 2             | Track 2 writes sources; track 3 provides resolution/search; track 1 provides query and selection UI | Real keyword/semantic results with source references, access checks, and private save |
| Recaps, milestone 3             | Track 3 provides generation, private status reads, and export; track 1 connects them                | Distinct recaps cite selected passages and images; failure preserves cards            |
| Lifecycle, milestone 4          | Track 3 invalidates access and evidence; track 2 enforces stream changes; track 1 reflects status   | Faults, revocation, redaction, and expiry pass the plan's acceptance checks           |
| Delivery, milestone 5           | Track 2 maintains delivery CI; each track contributes tests and runs the integrated flow            | Clean-checkout setup and a real target-device demo, with limitations recorded         |

The implementation plan remains the single milestone checklist and verification record. Track 2 owns the cluster release and runtime manifests. Track 3 owns persistence requirements and migration contents. Sequence shared manifest and migration edits. After deployment authorization, track 2 runs transport checks in the assigned cluster; local checks leave milestone 1 open.

## Sponsor ownership

| Sponsor track | Primary builder | Supporting work                                                                                                              |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sonar/Gitar   | Track 1         | Coordinate repository-admin enablement and planned `.gitar/review/` instructions; every builder uses feedback on feature PRs |
| Dash0         | Track 2         | Track 3 adds indexing, save, recap, and cleanup telemetry; track 1 exposes safe health states                                |
| Radar         | Track 2         | Track 3 owns database/storage requirements; every builder contributes real operating evidence                                |
| Elasticsearch | Tracks 2 and 3  | Track 2 owns core segment/frame ingest from milestone 1; track 3 owns resolution/search and cleanup; track 1 owns search UI  |

See [hackathon integrations](hackathon.md) for accounts and acceptance evidence. Gitar setup does not grant coding agents permission to post PR comments or enable automatic fixes.

## Keep the scope manageable

Tracks divide responsibility, not equal effort. Track 2 has deployment and live transport work early; track 3 has access early, resolution/search alongside highlights, and recaps later. Track 1 can prepare Gitar conventions, synthetic UI states, and browser tests while those services develop. Once capture is stable, track 2 helps with source-write recovery and lifecycle checks.

Resolve the [open decisions](implementation-plan.md#resolve-before-the-affected-milestone) before dependent work. Defer voice, OCR, repair transcription, advanced search filters, and extra sponsor features if the core flow is behind. One working use of each selected sponsor remains required; renegotiate scope explicitly if needed. Preserve ownership checks, source timing, and visible capture gaps.
