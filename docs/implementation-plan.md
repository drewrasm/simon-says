# Implementation plan

Status: milestone 0 is complete with local verification. Checkpoint 0A is next, followed by milestone 1. The team selected all four hackathon tracks; cluster access is pending. These checkboxes describe outcomes, not permission to implement. Complete one vertical slice before expanding scope.

## Three builder tracks

The [building tracks](building-tracks.md) detail ownership, ordered deliverables, dependencies, and integration checkpoints within the same Next.js app.

| Track                         | Owns                                                                                                                                            | First working slice                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| UI                            | Next.js pages and components, shadcn/ui, host controls, QR join, captions, selection cards, search UI, recap views, Gitar coordination          | Two attendees join and read shared captions                      |
| Capture and transcription     | Browser capture module, Node WebSocket ingest, source clock, proposed transcription adapter, shared feed, Radar deployment, Dash0               | One mic produces captions and aligned frames; stop fences ingest |
| Private highlights and recaps | Identity and membership, owner checks, bookmarks, evidence alignment, notes, Elasticsearch indexing/search, recap jobs, exports, data lifecycle | Each attendee saves and reads only their own aligned evidence    |

Track 2 drives checkpoint 0A with input from the others. Agree on the first shared contracts before splitting. The capture builder supplies a browser module to the UI builder. The highlights builder supplies membership checks to both tracks. Coordinate changes to contracts and migrations; keep feature modules separate within `apps/web/src/server`.

Integrate shared captions, private evidence, passage search, and recaps in that order. Tracks divide ownership, not milestone acceptance.

## Milestones

Milestone 0 remains complete for the local foundation. Checkpoint 0A adds the new deployment target without claiming that the existing checks prove Kubernetes readiness.

- [x] **0. Minimal runnable monorepo.** Create needed [workspaces](architecture.md), pin compatible Node/pnpm versions, and generate one lockfile. Configure one Next.js App Router app, strict TypeScript, shadcn/ui, lint/format checks, and Vitest. Add root scripts, `.env.example`, and local Postgres/object-storage configuration. Prove install, typecheck, relevant tests, and build; document real commands in README. Keep `apps/web` as the application root. Keep credentials server-only and verify server/client import boundaries. Do not provision or deploy yet. Add delivery CI in checkpoint 0A and complete end-to-end tooling in milestone 5.
- [ ] **0A. Kubernetes deployment foundation.** Adapt the [deployment plan](deployment.md) to the assigned team cluster. Add monorepo container packaging, a proven Node entry point for Next.js and WebSocket upgrades, health/readiness endpoints, resource limits, Secret references, manifests, and build/check/image CI. Prepare GitOps and serialized migration execution. Gate: local image serves the app; after separate deployment authorization, HTTPS, WebSocket/SSE probes, durable database and private storage checks, restart, and rollback pass in the actual cluster. Record image digest, deployed revision, and remaining gaps. Establish Dash0 connectivity and arrange Gitar enablement with the repository administrator.
- [ ] **1. One host, multiple readers.** Implement host identity, attendee membership, pre-capture/join disclosures, mic/screen checks, capture epochs, the transcription adapter, durable audio and transcript progress, replay events, shared captions, and host stop with persisted end time. Gate: real audio produces captions on two attendee devices through one transcription stream; a real frame carries a matching timestamp; stop ends capture. Verify gateway WebSocket upgrades, unbuffered SSE, pod-restart reconnects, shared caption delivery across pods, and durable leases before accepting this milestone. Verify content-free caption telemetry in Dash0. Acceptance requires an authorized cluster deployment with a database, private storage, and durable event source; local checks alone leave this gate open. Defer menus and dashboards until this works.
- [ ] **2. Private, aligned highlights.** Extend the session timeline schema with owner-scoped bookmarks and retained selection evidence. Implement live and paragraph anchors, owner status reads, pending states, notes, trimming, deletion, and reconnect replay. Gate: two attendees mark different moments; each gets the correct text/images and cannot read the other's notes.
- [ ] **2A. Search and select.** Tracks 1 and 3 add Elasticsearch passage retrieval after private highlights work. Index finalized source revisions, provide keyword and semantic queries, and save results through paragraph bookmarks. Gate: a real query retrieves the expected passage, source timestamps survive selection, index lag/outage is visible, and unauthorized, revoked, redacted, or expired sources never appear. Verify retry and deletion jobs against Elasticsearch. Implement source lifecycle guards and indexing invalidation here; milestone 4 completes the lifecycle endpoints and end-to-end scheduling.
- [ ] **3. Illustrated recaps.** Generate only from resolved selected evidence. Reuse and verify the durable job mechanism selected for indexing, including worker restart recovery. Implement owner-only recap reads and status updates, including retry and timeout recovery. Validate references, bind source revisions, and support portable HTML and Markdown export. Gate: distinct selections yield distinct recaps with inspectable passages/images; failures preserve saved evidence.
- [ ] **4. Recovery and data lifecycle.** Implement membership revocation, source redaction, scheduled retention cleanup, and source-reference handling. Verify interrupted cleanup resumes safely. Verify fencing, gaps, stale clocks, duplicate messages, and lifecycle routes. Add content-free telemetry. Gate: fault tests remain honest about missing evidence and prove ownership. Automatic repair transcription is optional; missing-range detection is required.
- [ ] **5. Demo and delivery.** Extend checkpoint 0A CI with Playwright coverage of the core flow, search, and ownership. Prove documented setup and checks from a clean checkout. Run the actual host/attendee flow on target devices; inspect transcript errors and code-image legibility. Document limitations and AI assistance. Complete the four [sponsor evidence checks](hackathon.md), a healthy cluster release, and a post-event data/export or teardown plan. No sponsor integration is complete from account creation alone.

After each milestone, record a short evidence note here: verified behavior, checks run, and remaining gaps. Never check a milestone off from source inspection alone.

## Tool rollout

- **0A:** prepare Radar/GitOps deployment, Dash0 connectivity, and Gitar review instructions. The repository administrator must resolve Gitar comment permissions before enablement.
- **1:** use Radar UI/MCP for rollout and a real investigation; verify Dash0 caption traces, Agent0, and MCP against live traffic. Use Gitar on feature PRs once authorized.
- **2A:** deliver Elasticsearch keyword and semantic passage search with private selection and lifecycle checks.
- **3–5:** extend telemetry to indexing, saves, recaps, and cleanup. Gather the [four-track evidence](hackathon.md) and verify event-end data handling.

These are required delivery outcomes, not completed integrations or authorization to enable external services.

## Milestone 0 evidence

Verified locally on November 9, 2026 with Node 22.22.0 and pnpm 11.24.0:

- Frozen-lockfile install, peer dependency check, lint, formatting, strict typecheck, Vitest app-shell smoke test, and Next.js production build passed.
- Development and production servers returned HTTP 200 with the app heading and disabled session action. Production CSS includes app and shared shadcn component classes.
- Prisma schema validation and client generation passed. Prisma executed `SELECT 1` against local PostgreSQL.
- Local SeaweedFS accepted signed upload/download and rejected anonymous object reads with HTTP 403. Bucket initialization is repeatable.
- Independent Terra review completed; setup documentation findings were addressed.

Product capture, provider integrations, Kubernetes deployment and Node WebSocket support, visual browser QA, and setup on the other builders' machines remain unverified. No product database models or migrations exist yet. Contracts and domain packages reserve their documented ownership without placeholder business logic.

## Acceptance fixtures

Use authorized synthetic audio and screens with known timing. Include these checks:

1. Three attendees share one live transcription stream; a stale second host cannot publish audio or frames. A host crash leaves the session visibly degraded until an authorized new epoch starts or the host ends it. Repeat with overlapping pods during rollout and forced pod termination. Terminate a pod after durable audio acknowledgment but before final transcript delivery; verify replay produces no silent gap or duplicate words.
2. Slide A ends at 30s, B follows. A 15–45s mark includes both. A mark ending before 30s excludes B despite delayed uploads. Record sampling uncertainty.
3. Four-second caption delay does not change live versus paragraph anchor semantics. Stale clock sync prevents a guessed live mark.
4. Duplicate/out-of-order transcript events converge to one latest segment. Reconnect replays corrections or returns a complete snapshot.
5. Missing audio chunks retry idempotently or expose gaps. No duplicate repaired words; repaired output has new provenance.
6. Stopping screen sharing preserves captions but marks screen unavailable; old frames do not masquerade as current ones.
7. Cross-owner private API, media, and export requests fail. Search and shared SSE reject unauthorized sessions, while authorized attendees can read shared captions. Revoked membership loses access.
8. Deleting/editing source during generation invalidates the recap. Expiry preserves permitted materialized selections; redaction removes affected hosted evidence.
9. Transcript/image prompt injection remains quoted source data. Empty selections make no model call. Overlap does not duplicate evidence.
10. Search cannot reveal another session, private note, or stale redacted passage. Retry indexing out of order and restart its worker; deleted content must not reappear. Search downtime leaves live captions and private saves usable.
11. Inspect actual records, payloads, object permissions, and logs. Measure source coverage and word errors independently. Test keyboard access, reader scroll position, and narrow screens.

## Hackathon cut

Three builders work through the tracks above after shared setup. Timebox the first integration to host capture, two caption readers, and one private saved interval. Estimate the remaining work after that slice runs; Kubernetes transport and provider setup are unverified. Reserve time for lifecycle checks, CI, end-to-end verification, and submission.

If the core slice fails, cut voice, OCR, repair transcription, advanced search filters, and extra sponsor features first. Preserve one demonstrated use of each selected track; if that cannot fit, explicitly renegotiate four-track scope rather than quietly dropping Elasticsearch. Never cut ownership checks or hide capture gaps. Report simulated integrations explicitly.

## Resolve before the affected milestone

- Before capture: target browser/device, authorized mic/screen route, provider account and retention settings, Node WebSocket routing, gateway limits, and shared event delivery.
- Before checkpoint 0A acceptance: confirm team cluster ID, namespace, hostname, quota, runtime architecture, image access, database, private storage, and deployment authorization.
- Before search: provision the Elastic project, select the inference endpoint and job mechanism, and confirm processing/retention disclosures.
- Before public access: identity mechanism, host access, invitation expiry, limits, revocation, redaction, and storage policy.
- Before recap: text/multimodal provider, structured output, data handling, budget, and durable job execution.
- Before deployment: database and private object store, migrations, connection recovery, cleanup scheduling, rollback, and operator ownership. GitOps enablement, publication, and deployment require authorization; routine future pushes may deploy after GitOps is enabled.
