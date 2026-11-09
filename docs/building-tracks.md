# Building tracks

Status: milestone 0 foundation is complete with local verification for the three-builder app in one Next.js app. See the [implementation plan](implementation-plan.md) for verification and remaining work. Feature tracks are not implemented yet.

## Divide ownership

| Track                            | Owns                                                                                              | Main locations                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. UI and attendee experience    | Host controls, QR join, captions, private cards, recap display                                    | Pages and components in `apps/web`; `packages/ui`                                                                    |
| 2. Capture and transcription     | Browser capture, source clock, ingest, transcription, shared feed, host stop                      | Capture module in `apps/web`; ingest and event modules in `apps/web/src/server`; timeline rules in `packages/domain` |
| 3. Private highlights and recaps | Identity, membership, private selections, evidence alignment, generation, exports, data lifecycle | Access, bookmark, and recap modules in `apps/web/src/server`; selection rules in `packages/domain`; `packages/db`    |

[Architecture](architecture.md) defines package boundaries. [Contracts](contracts.md) defines shared records and operations. Keep provider SDKs, database access, and credentials in server code.

## Establish the shared foundation

1. Complete milestone 0: root tooling, the lockfile, local services, and setup documentation. The other builders review and verify setup.
2. Agree on the first runtime schemas together: session and membership identity, source clock and ingest epoch, transcript revisions, screen observations, and event cursors. Define bookmark and recap schemas before their milestones.
3. Agree on the capture module's start, stop, permission, preview, and health interface. Track 2 implements the module; track 1 connects the host controls.
4. Name one migration writer, initially track 3. Track 2 supplies transcript and media requirements. Sequence shared schema edits and migrations rather than editing the same definitions independently.

Before milestone 1 capture, tracks 2 and 3 confirm provider retention settings and the storage policy that track 1 presents in the disclosures.

Each track owns its feature tests and contract changes. Affected builders review shared changes before adopting them. Keep schemas in `packages/contracts`; do not copy types between tracks. Fixtures can unblock work after setup, but label them and use the agreed schemas. Fixtures do not complete live integration gates.

## Track 1: UI and attendee experience

Build the screens in this order:

1. **Join and read, milestone 1.** Add host setup, capture previews, processing and retention disclosures, QR invitations, attendee join, captions, and stop controls. Show capture and connection health. Preserve reader scroll position and provide **Return to live**.
2. **Save and inspect, milestone 2.** Add **Keep that**, paragraph selection, private cards, notes, range editing, and deletion. Distinguish local pending, durably saved, and incomplete evidence. Disable live marks when clock sync is stale; keep paragraph marks available.
3. **Read and export, milestone 3.** Show recap progress, failure, staleness, source passages, images, and export actions. Use bounded polling of owner-only reads while the relevant view is open. Keep saved evidence usable when generation fails.
4. **Handle lifecycle and verify, milestones 4–5.** Display ended sessions, lost access, redacted evidence, and expiry. Verify keyboard access, focus, readable captions, and narrow attendee screens. Own the browser flow tests with service support from the other tracks.

Dependencies: track 2 supplies capture and shared events. Track 3 supplies session, membership, bookmark, and recap APIs. Attendee devices never capture audio or run transcription.

First working slice: two attendees join one session and read real shared captions.

## Track 2: Capture and transcription

Build the source timeline and shared feed in this order:

1. **Capture and stream, milestone 1.** Implement browser mic/screen capture, source clock, durable host lease and epoch validation, audio ingest, and the confirmed direct-protocol caption adapter in `apps/web/src/server`. Start with LFM3-Audio-2B LiveASR on `llama serve` v0.8.0 or newer; keep OpenAI realtime transcription as the configuration swap. Own commit boundaries, many items per session, provider-specific resampling, and source-clock stamps from sent audio offsets. Keep provider configuration server-only. Publish interim and final captions through one transcription stream per session. Ingest a real timestamped frame. Implement host stop with ingest fencing and persisted end/expiry times.
2. **Verify transport, milestone 1.** Run the pending stock GGUF LiveASR realtime-endpoint spike and measure latency; neither is verified. Resolve preview model access (OpenAI or a reachable `llama serve` host) before acceptance. Prove the proposed Vercel WebSocket routing, bounded connection recovery, and shared caption delivery across function instances. Choose the shared event mechanism. Plan content-free Dash0 ingest and caption telemetry during this milestone. Persist audio acknowledgments, transcript revisions, finalized transcript progress, frame observations, and replay cursors with track 3's migrations. Replay unfinalized audio without duplicate words and preserve the session clock across provider reconnects. Runtime feasibility remains unverified until these checks pass.
3. **Supply bookmark evidence, milestone 2.** Expose stable source IDs, ranges, revisions, and capture health for bookmark resolution. Complete authorized snapshot fallback and reconnect handling for the selection flow.
4. **Recover and verify, milestones 4–5.** Test duplicates, out-of-order messages, stale hosts, capture loss, and gaps. Apply revocation to connected streams. Extend the milestone 1 telemetry with recovery diagnostics in milestone 4. In milestone 5, test the target laptop, mic route, and browser; inspect caption errors, slide transitions, and screenshot legibility.

Dependencies: track 3 supplies host identity and membership checks. Track 2 owns capture behavior inside `apps/web`; track 1 owns its presentation. Private bookmark and recap events never enter the shared feed. Automatic repair transcription remains optional.

Proposed milestone 2–3 extension: use `ai` with `createOpenAICompatible` pointed at `llama serve`, or `@ai-sdk/openai`, for a changed-frame slide glossary (Liquid LFM2.5-VL or LFM3-VL family) and finalized-caption correction (small Liquid text model). Track 2 supplies new revisions with existing `corrected` provenance and preserves original text; coordinate evidence revision handling with track 3. Keep correction off the live caption path and screen/transcript text as untrusted data. See [the decision and adapter rationale](decisions.md#confirmed-by-the-track-2-owner).

First working slice: one real microphone feeds two caption views, a frame shares the source clock, and host stop rejects further audio and frames.

## Track 3: Private highlights and recaps

Build access and saved evidence before generation:

1. **Establish access, milestone 1.** Implement host identity, session creation, invitations, and distinct attendee memberships. Supply authorization checks for ingest, events, private APIs, and media. Coordinate the initial database schema and private storage setup with track 2.
2. **Save private evidence, milestone 2.** Implement owner-only bookmark writes and reads, operation IDs, revision conflicts, notes, range edits, and deletion. Resolve live and paragraph anchors against fixed source ranges. Align transcript revisions and screen observations by source time. Preserve incomplete states and separate notes when selections overlap.
3. **Generate and export, milestone 3.** Select and verify durable job execution with retries and timeout recovery. Generate from resolved selections only. Validate evidence excerpts and references, recheck revisions before saving, and expose owner-only status and staleness reads. Export HTML with embedded images and text-only Markdown. Empty selections make no model call; failures preserve saved evidence.
4. **Enforce lifecycle, milestone 4.** Implement revocation, host redaction, scheduled expiry, selected-evidence materialization, reference cleanup, and recap invalidation. Cleanup must resume after interruption. Track 2 applies access changes to active streams; track 1 displays their effects. Add content-free save and recap telemetry.
5. **Verify isolation, milestone 5.** Extend earlier ownership checks into end-to-end coverage. Prove that attendees cannot read each other's notes or recaps and that host access does not bypass ownership. Cover API reads, media, exports, and invalidation during generation.

Dependencies: track 2 supplies timestamped source records and capture health. Track 1 consumes the private APIs. Disable shared caching for member and owner responses.

First working slice: two attendees save different source intervals and retrieve only their own aligned text, images, and notes.

## Integrate at shared checkpoints

| Checkpoint                      | Handoff                                                                                           | Proof                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Foundation, milestone 0         | Setup driver provides tooling, local services, and documented commands                            | All three builders can install, check, and build                                        |
| Shared captions, milestone 1    | Track 3 provides access; track 2 provides capture and feed; track 1 connects screens              | Real host, two readers, timestamped frame, working stop, and verified function recovery |
| Private highlights, milestone 2 | Track 2 provides durable sources; track 3 resolves bookmarks; track 1 displays evidence           | Different marks produce correctly aligned evidence with cross-user access denied        |
| Recaps, milestone 3             | Track 3 provides generation, private status reads, and export; track 1 connects them              | Distinct recaps cite selected passages and images; failure preserves cards              |
| Lifecycle, milestone 4          | Track 3 invalidates access and evidence; track 2 enforces stream changes; track 1 reflects status | Faults, revocation, redaction, and expiry pass the plan's acceptance checks             |
| Delivery, milestone 5           | Setup driver wires CI; each track contributes tests and runs the integrated flow                  | Clean-checkout setup and a real target-device demo, with limitations recorded           |

The implementation plan remains the single milestone checklist and verification record. The setup driver prepares the milestone 1 preview configuration, including its database, private storage, and shared event source. After separate provisioning and deployment authorization, track 2 runs the transport checks in that preview. Local checks alone leave milestone 1 open. The setup driver also owns delivery configuration, with track 2 reviewing connection limits and track 3 reviewing storage and jobs.

## Keep the scope manageable

See [tools under consideration](decisions.md#tools-under-consideration): Dash0 for capture and recap diagnosis, Sonar/Gitar for all three builders' PR review, and Elasticsearch for optional passage search and selection after captions and private highlights work. Follow the [tool rollout timing](implementation-plan.md#tool-rollout): Dash0 during milestone 1, Sonar/Gitar when feature PRs begin, and Elasticsearch after the working core. These are planning notes, not approved integrations.

Tracks divide responsibility, not equal effort or independent schedules. Track 3 has early access work and later recap work. Once capture is stable, track 2 can help with alignment fixtures and lifecycle checks; track 1 can help with end-to-end coverage.

Resolve the [open decisions](implementation-plan.md#resolve-before-the-affected-milestone) before dependent work. Defer voice, OCR, repair transcription, search, and extra sponsor integrations if the core flow is behind. Preserve ownership checks, source timing, and visible capture gaps.
