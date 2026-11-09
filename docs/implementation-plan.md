# Implementation plan

Status: milestone 0 is complete with local verification. Milestone 1 is next. These checkboxes describe outcomes, not permission to implement. Complete one vertical slice before expanding scope.

## Three builder tracks

The [building tracks](building-tracks.md) detail ownership, ordered deliverables, dependencies, and integration checkpoints within the same Next.js app.

| Track                         | Owns                                                                                                                                                 | First working slice                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| UI                            | Next.js pages and components, shadcn/ui, host controls, QR join, captions, selection cards, recap views                                              | Two attendees join and read shared captions                      |
| Capture and transcription     | Browser capture module, Vercel ingest function, source clock, direct-protocol caption adapter, transcript and frame persistence, shared caption feed | One mic produces captions and aligned frames; stop fences ingest |
| Private highlights and recaps | Identity and membership, owner checks, bookmarks, evidence alignment, notes, recap jobs, exports, data lifecycle                                     | Each attendee saves and reads only their own aligned evidence    |

One builder drives milestone 0 with input from the others. Agree on the first shared contracts before splitting. The capture builder supplies a browser module to the UI builder. The highlights builder supplies membership checks to both tracks. Coordinate changes to contracts and migrations; keep feature modules separate within `apps/web/src/server`.

Integrate shared captions first, private evidence second, and recaps third. Tracks divide ownership, not milestone acceptance.

## Milestones

When documenting local setup in milestone 0, distinguish ordinary Next.js development from the proposed WebSocket route's `vercel dev` requirement. Verify local ingest support in milestone 1.

- [x] **0. Minimal runnable monorepo.** Create needed [workspaces](architecture.md), pin compatible Node/pnpm versions, and generate one lockfile. Configure one Next.js App Router app, strict TypeScript, shadcn/ui, lint/format checks, and Vitest. Add root scripts, `.env.example`, and local Postgres/object-storage configuration. Prove install, typecheck, relevant tests, and build; document real commands in README. Document `apps/web` as the Vercel project root. Keep credentials server-only and verify server/client import boundaries. Do not provision or deploy yet. Complete CI and end-to-end tooling in milestone 5.
- [ ] **1. One host, multiple readers.** Implement host identity, attendee membership, pre-capture/join disclosures, mic/screen checks, capture epochs, the confirmed direct-protocol caption adapter (LFM3-Audio-2B first, OpenAI realtime transcription as a configuration swap), durable audio and transcript progress, replay events, shared captions, and host stop with persisted end time. Gate: real audio produces captions on two attendee devices through one transcription stream; a real frame carries a matching timestamp; stop ends capture. A local synthetic-speech spike confirmed stock GGUF LiveASR on `llama serve` at `/v1/realtime?intent=transcription` ([evidence](decisions.md#confirmed-by-the-track-2-owner)); repeat with real microphone audio, measure latency and word errors, and verify provider switching, adapter-controlled commits, multiple items, resampling, and source-clock stamps. Verify Vercel WebSocket routing, function-duration reconnects, shared caption delivery across instances, and durable leases before accepting this milestone. Acceptance requires an authorized preview deployment with a database, private storage, and shared event source; local checks alone leave this gate open. Defer menus and dashboards until this works.
- [ ] **2. Private, aligned highlights.** Extend the session timeline schema with owner-scoped bookmarks and retained selection evidence. Implement live and paragraph anchors, owner status reads, pending states, notes, trimming, deletion, and reconnect replay. Gate: two attendees mark different moments; each gets the correct text/images and cannot read the other's notes.
- [ ] **3. Illustrated recaps.** Generate only from resolved selected evidence. Select and verify a durable Vercel-compatible job mechanism. Implement owner-only recap reads and status updates, including retry and timeout recovery. Validate references, bind source revisions, and support portable HTML and Markdown export. Gate: distinct selections yield distinct recaps with inspectable passages/images; failures preserve saved evidence.
- [ ] **4. Recovery and data lifecycle.** Implement membership revocation, source redaction, scheduled retention cleanup, and source-reference handling. Verify interrupted cleanup resumes safely. Verify fencing, gaps, stale clocks, duplicate messages, and lifecycle routes. Add content-free telemetry. Gate: fault tests remain honest about missing evidence and prove ownership. Automatic repair transcription is optional; missing-range detection is required.
- [ ] **5. Demo and delivery.** Add CI and Playwright coverage of the core flow and ownership. Prove documented setup and checks from a clean checkout. Run the actual host/attendee flow on target devices; inspect transcript errors and code-image legibility. Document limitations and AI assistance. Verify Next.js production builds and Vercel deployment configuration before any separately authorized deployment.

Proposed milestone 2–3 extension: use `ai` for a changed-frame Liquid vision glossary (LFM2.5-VL or LFM3-VL family) and small Liquid text model correction of finalized segments. Use `createOpenAICompatible` with `llama serve`, or `@ai-sdk/openai`. Preserve original text and write new revisions with existing `corrected` provenance; treat screen/transcript text as untrusted data. Keep correction off the live caption path and outside milestone 1. See [decisions](decisions.md#proposed-implementation-defaults).

After each milestone, record a short evidence note here: verified behavior, checks run, and remaining gaps. Never check a milestone off from source inspection alone.

## Tool rollout

- Plan Dash0 integration during milestone 1 for content-free caption latency, disconnect, and transcription failure telemetry. Extend it to save and recap errors as those features arrive.
- Plan Sonar/Gitar adoption when feature PRs begin. Automatic fixes, pushes, and PR comments remain unauthorized.
- Keep Elasticsearch as a stretch goal after shared captions and private highlights work. Search results must preserve source references and current access checks.

This records planned timing, not completed integrations or authorization to install or enable services. See [tools under consideration](decisions.md#tools-under-consideration).

## Milestone 0 evidence

Verified locally on November 9, 2026 with Node 22.22.0 and pnpm 11.24.0:

- Frozen-lockfile install, peer dependency check, lint, formatting, strict typecheck, Vitest app-shell smoke test, and Next.js production build passed.
- Development and production servers returned HTTP 200 with the app heading and disabled session action. Production CSS includes app and shared shadcn component classes.
- Prisma schema validation and client generation passed. Prisma executed `SELECT 1` against local PostgreSQL.
- Local SeaweedFS accepted signed upload/download and rejected anonymous object reads with HTTP 403. Bucket initialization is repeatable.
- Independent Terra review completed; setup documentation findings were addressed.

Product capture, provider integrations, Vercel deployment and WebSocket support, visual browser QA, and setup on the other builders' machines remain unverified. No product database models or migrations exist yet. Contracts and domain packages reserve their documented ownership without placeholder business logic.

## Acceptance fixtures

Use authorized synthetic audio and screens with known timing. Include these checks:

1. Three attendees share one live transcription stream; a stale second host cannot publish audio or frames. A host crash leaves the session visibly degraded until an authorized new epoch starts or the host ends it. Repeat with separate function instances and forced function expiry. Expire a function after durable audio acknowledgment but before final transcript delivery; verify replay produces no silent gap or duplicate words.
2. Slide A ends at 30s, B follows. A 15–45s mark includes both. A mark ending before 30s excludes B despite delayed uploads. Record sampling uncertainty.
3. Four-second caption delay does not change live versus paragraph anchor semantics. Stale clock sync prevents a guessed live mark.
4. Duplicate/out-of-order transcript events converge to one latest segment. Reconnect replays corrections or returns a complete snapshot.
5. Missing audio chunks retry idempotently or expose gaps. No duplicate repaired words; repaired output has new provenance.
6. Stopping screen sharing preserves captions but marks screen unavailable; old frames do not masquerade as current ones.
7. Cross-user API, search, SSE, media, and export requests fail. Revoked membership loses access.
8. Deleting/editing source during generation invalidates the recap. Expiry preserves permitted materialized selections; redaction removes affected hosted evidence.
9. Transcript/image prompt injection remains quoted source data. Empty selections make no model call. Overlap does not duplicate evidence.
10. Inspect actual records, payloads, object permissions, and logs. Measure source coverage and word errors independently. Test keyboard access, reader scroll position, and narrow screens.

## Hackathon cut

Three builders work through the tracks above after shared setup. Timebox the first integration to host capture, two caption readers, and one private saved interval. Estimate the remaining work after that slice runs; Vercel transport and provider setup are unverified. Reserve time for lifecycle checks, CI, end-to-end verification, and submission.

If the core slice fails, cut voice, OCR, repair transcription, search, and additional sponsor integrations first. Never cut ownership checks or hide capture gaps. Report simulated integrations explicitly.

## Resolve before the affected milestone

- Before capture: target browser/device, authorized mic/screen route, provider configuration and retention/data-use opt-out settings where available, Vercel WebSocket routing, function limits, and shared event delivery.
- Before milestone 1 acceptance: resolve model hosting. Local `llama serve` is for development; preview model access via OpenAI or `llama serve` on a reachable host remains open. Stock GGUF LiveASR worked in a local synthetic-speech spike; real-microphone latency and accuracy remain unverified.
- Before milestone 1 acceptance: authorize the Vercel preview and provision its database, private storage, and shared event source.
- Before public access: identity mechanism, host access, invitation expiry, limits, revocation, redaction, and storage policy.
- Before recap: text/multimodal provider, structured output, data handling, budget, and durable job execution.
- Before deployment: Vercel project and plan, database and private object store, migrations, connection recovery, cleanup scheduling, and operator ownership. Deployment still requires authorization.
