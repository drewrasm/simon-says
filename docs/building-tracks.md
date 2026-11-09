# Building tracks

Status: milestone 0 foundation is complete with local verification for the three-builder app in one Next.js app. See the [implementation plan](implementation-plan.md) for verification and remaining work. Feature tracks are not implemented yet. Checkpoint 0A adds Kubernetes deployment; cluster access is pending. Three builder tracks share responsibility for all four sponsor tracks.

## Divide ownership

| Track                            | Owns                                                                                                               | Main locations                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. UI and attendee experience    | Host controls, QR join, captions, private cards, search UI, recap display, Gitar setup coordination                | Pages and components in `apps/web`; `packages/ui`                                                                                                  |
| 2. Capture and transcription     | Browser capture, source clock, ingest, transcription, shared feed, host stop, Radar deployment, Dash0 setup        | Capture module in `apps/web`; ingest and event modules in `apps/web/src/server`; timeline rules in `packages/domain`; `infra`; `.github/workflows` |
| 3. Private highlights and recaps | Identity, membership, private selections, evidence alignment, search/indexing, generation, exports, data lifecycle | Access, bookmark, and recap modules in `apps/web/src/server`; selection rules in `packages/domain`; `packages/db`                                  |

[Architecture](architecture.md) defines package boundaries. [Contracts](contracts.md) defines shared records and operations. Keep provider SDKs, database access, and credentials in server code.

## Establish the shared foundation

1. Preserve completed milestone 0 and verify setup on the other builders' machines. Track 2 drives checkpoint 0A runtime and deployment, with track 3 reviewing persistence/migrations and track 1 verifying the served app. Do not replace this repository with the Radar starter.
2. Agree on the first runtime schemas together: session and membership identity, source clock and ingest epoch, transcript revisions, screen observations, and event cursors. Define bookmark and recap schemas before their milestones.
3. Agree on the capture module's start, stop, permission, preview, and health interface. Track 2 implements the module; track 1 connects the host controls.
4. Name one migration writer, initially track 3. Track 2 supplies transcript and media requirements. Sequence shared schema edits and migrations rather than editing the same definitions independently.

Before milestone 1 capture, tracks 2 and 3 confirm provider retention settings and the storage policy that track 1 presents in the disclosures.

Each track owns its feature tests and contract changes. Affected builders review shared changes before adopting them. Keep schemas in `packages/contracts`; do not copy types between tracks. Fixtures can unblock work after setup, but label them and use the agreed schemas. Fixtures do not complete live integration gates.

## Track 1: UI and attendee experience

Build the screens in this order:

1. **Join and read, milestone 1.** Add host setup, capture previews, processing and retention disclosures, QR invitations, attendee join, captions, and stop controls. Show capture and connection health. Preserve reader scroll position and provide **Return to live**.
2. **Save and inspect, milestone 2.** Add **Keep that**, paragraph selection, private cards, notes, range editing, and deletion. Distinguish local pending, durably saved, and incomplete evidence. Disable live marks when clock sync is stale; keep paragraph marks available.
3. **Search and select, milestone 2A.** Add passage search, source preview, and explicit save actions using track 3's API. Show indexing delay, no matches, and unavailable states. Preserve live captions and private cards during search failure.
4. **Read and export, milestone 3.** Show recap progress, failure, staleness, source passages, images, and export actions. Use bounded polling of owner-only reads while the relevant view is open. Keep saved evidence usable when generation fails.
5. **Handle lifecycle and verify, milestones 4–5.** Display ended sessions, lost access, redacted evidence, and expiry. Verify keyboard access, focus, readable captions, and narrow attendee screens. Own the browser flow tests with service support from the other tracks.

Dependencies: track 2 supplies capture and shared events. Track 3 supplies session, membership, bookmark, and recap APIs. Attendee devices never capture audio or run transcription.

First working slice: two attendees join one session and read real shared captions.

## Track 2: Capture and transcription

Build the source timeline and shared feed in this order:

1. **Deploy the foundation, checkpoint 0A.** Own the Node entry point, container, health checks, CI image build, Kubernetes manifests, and Radar operations. Coordinate Secrets, migrations, and storage with track 3. Establish content-free Dash0 telemetry and hand each builder a span convention. Verify the local image before an authorized cluster release.
2. **Capture and stream, milestone 1.** Implement browser mic/screen capture, source clock, durable host lease and epoch validation, audio ingest, and the proposed Deepgram adapter. Publish interim and final captions through one transcription stream per session. Ingest a real timestamped frame. Implement host stop with ingest fencing and persisted end/expiry times.
3. **Verify transport, milestone 1.** Prove gateway WebSocket routing, unbuffered SSE, pod-restart recovery, and shared caption delivery across overlapping pods. Verify the proposed Postgres event log and polling latency. Deliver content-free Dash0 ingest and caption telemetry, a useful Agent0 diagnosis, and MCP access. Use Radar for rollout health and a real investigation. Persist audio acknowledgments, transcript revisions, finalized transcript progress, frame observations, and replay cursors with track 3's migrations. Replay unfinalized audio without duplicate words and preserve the session clock across provider reconnects. Runtime feasibility remains unverified until these checks pass.
4. **Supply bookmark evidence, milestone 2.** Expose stable source IDs, ranges, revisions, and capture health for bookmark resolution. Complete authorized snapshot fallback and reconnect handling for the selection flow.
5. **Recover and verify, milestones 4–5.** Test duplicates, out-of-order messages, stale hosts, capture loss, and gaps. Apply revocation to connected streams. Extend the milestone 1 telemetry with recovery diagnostics in milestone 4. In milestone 5, test the target laptop, mic route, and browser; inspect caption errors, slide transitions, and screenshot legibility.

Dependencies: track 3 supplies host identity and membership checks. Track 2 owns capture behavior inside `apps/web`; track 1 owns its presentation. Private bookmark and recap events never enter the shared feed. Automatic repair transcription remains optional.

First working slice: one real microphone feeds two caption views, a frame shares the source clock, and host stop rejects further audio and frames.

## Track 3: Private highlights and recaps

Build access and saved evidence before generation:

1. **Establish access, milestone 1.** Implement host identity, session creation, invitations, and distinct attendee memberships. Supply authorization checks for ingest, events, private APIs, and media. Coordinate the initial database schema and private storage setup with track 2.
2. **Save private evidence, milestone 2.** Implement owner-only bookmark writes and reads, operation IDs, revision conflicts, notes, range edits, and deletion. Resolve live and paragraph anchors against fixed source ranges. Align transcript revisions and screen observations by source time. Preserve incomplete states and separate notes when selections overlap.
3. **Index and search, milestone 2A.** Own the Elastic client, passage mapping, durable indexing/deletion jobs, keyword and semantic queries, and membership/source revalidation. Implement source lifecycle guards and invalidation now; complete lifecycle endpoints and scheduling in milestone 4. Supply track 1 with a bounded search API. Keep private content out of the index and prove redaction, expiry, revocation, revision updates, and outage behavior.
4. **Generate and export, milestone 3.** Reuse durable job execution with retries and timeout recovery. Generate from resolved selections only. Validate evidence excerpts and references, recheck revisions before saving, and expose owner-only status and staleness reads. Export HTML with embedded images and text-only Markdown. Empty selections make no model call; failures preserve saved evidence.
5. **Enforce lifecycle, milestone 4.** Implement revocation, host redaction, scheduled expiry, selected-evidence materialization, reference cleanup, and recap invalidation. Cleanup must resume after interruption. Track 2 applies access changes to active streams; track 1 displays their effects. Add content-free save and recap telemetry.
6. **Verify isolation, milestone 5.** Extend earlier ownership checks into end-to-end coverage. Prove that attendees cannot read each other's notes or recaps and that host access does not bypass ownership. Cover API reads, media, exports, and invalidation during generation.

Dependencies: track 2 supplies timestamped source records and capture health. Track 1 consumes the private APIs. Disable shared caching for member and owner responses.

First working slice: two attendees save different source intervals and retrieve only their own aligned text, images, and notes.

## Integrate at shared checkpoints

| Checkpoint                      | Handoff                                                                                           | Proof                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Foundation, milestone 0         | Setup driver provides tooling, local services, and documented commands                            | All three builders can install, check, and build                                      |
| Deployment, checkpoint 0A       | Track 2 packages and deploys; track 3 verifies persistence; track 1 verifies app delivery         | Authorized cluster release, probes, image identity, restart/rollback, and telemetry   |
| Shared captions, milestone 1    | Track 3 provides access; track 2 provides capture and feed; track 1 connects screens              | Real host, two readers, timestamped frame, working stop, and verified pod recovery    |
| Private highlights, milestone 2 | Track 2 provides durable sources; track 3 resolves bookmarks; track 1 displays evidence           | Different marks produce correctly aligned evidence with cross-user access denied      |
| Search, milestone 2A            | Track 3 provides retrieval and indexing; track 1 provides query and selection UI                  | Real keyword/semantic results with source references, access checks, and private save |
| Recaps, milestone 3             | Track 3 provides generation, private status reads, and export; track 1 connects them              | Distinct recaps cite selected passages and images; failure preserves cards            |
| Lifecycle, milestone 4          | Track 3 invalidates access and evidence; track 2 enforces stream changes; track 1 reflects status | Faults, revocation, redaction, and expiry pass the plan's acceptance checks           |
| Delivery, milestone 5           | Track 2 maintains delivery CI; each track contributes tests and runs the integrated flow          | Clean-checkout setup and a real target-device demo, with limitations recorded         |

The implementation plan remains the single milestone checklist and verification record. Track 2 owns the cluster release and runtime manifests. Track 3 owns persistence requirements and migration contents. Sequence shared manifest and migration edits. After deployment authorization, track 2 runs transport checks in the assigned cluster; local checks leave milestone 1 open.

## Sponsor ownership

| Sponsor track | Primary builder | Supporting work                                                                                                              |
| ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sonar/Gitar   | Track 1         | Coordinate repository-admin enablement and planned `.gitar/review/` instructions; every builder uses feedback on feature PRs |
| Dash0         | Track 2         | Track 3 adds indexing, save, recap, and cleanup telemetry; track 1 exposes safe health states                                |
| Radar         | Track 2         | Track 3 owns database/storage requirements; every builder contributes real operating evidence                                |
| Elasticsearch | Track 3         | Track 1 owns search and source-selection UI; track 2 supplies finalized source revisions                                     |

See [hackathon integrations](hackathon.md) for accounts and acceptance evidence. Gitar setup does not grant coding agents permission to post PR comments or enable automatic fixes.

## Keep the scope manageable

Tracks divide responsibility, not equal effort. Track 2 has deployment and live transport work early; track 3 has access early and search/recaps later. Track 1 can prepare Gitar conventions, synthetic UI states, and browser tests while those services develop. Once capture is stable, track 2 helps with indexing recovery and lifecycle checks.

Resolve the [open decisions](implementation-plan.md#resolve-before-the-affected-milestone) before dependent work. Defer voice, OCR, repair transcription, advanced search filters, and extra sponsor features if the core flow is behind. One working use of each selected sponsor remains required; renegotiate scope explicitly if needed. Preserve ownership checks, source timing, and visible capture gaps.
