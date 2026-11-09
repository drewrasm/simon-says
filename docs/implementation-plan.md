# Implementation plan

Status: not started. These checkboxes describe outcomes, not permission to implement. Complete one vertical slice before expanding scope.

## Milestones

- [ ] **0. Minimal runnable monorepo.** Create needed [workspaces](architecture.md), pin compatible Node/pnpm versions, and commit one lockfile. Configure strict TypeScript, Vite + React, shadcn/ui, lint/format checks, and Vitest. Add root scripts, `.env.example`, and local Postgres/object-storage configuration. Prove install, typecheck, relevant tests, and build; document real commands in README. Keep credentials server-only. Complete CI and end-to-end tooling in milestone 5.
- [ ] **1. One host, multiple readers.** Implement host identity, attendee membership, pre-capture/join disclosures, mic/screen checks, capture epochs, the transcription adapter, shared captions, and host stop with persisted end time. Gate: real audio produces captions on two attendee devices through one transcription stream; a real frame carries a matching timestamp; stop ends capture. Defer menus and dashboards until this works.
- [ ] **2. Private, aligned highlights.** Add evidence migrations. Persist segments, frames, event cursors, and owner-scoped bookmarks. Implement live and paragraph anchors, owner status reads, pending states, notes, trimming, deletion, and reconnect replay. Gate: two attendees mark different moments; each gets the correct text/images and cannot read the other's notes.
- [ ] **3. Illustrated recaps.** Generate only from resolved selected evidence. Implement owner-only recap reads and status updates. Validate references, bind source revisions, and support portable HTML and Markdown export. Gate: distinct selections yield distinct recaps with inspectable passages/images; failures preserve saved evidence.
- [ ] **4. Recovery and data lifecycle.** Implement membership revocation, source redaction, retention cleanup, and source-reference handling. Verify fencing, gaps, stale clocks, duplicate messages, and lifecycle routes. Add content-free telemetry. Gate: fault tests remain honest about missing evidence and prove ownership. Automatic repair transcription is optional; missing-range detection is required.
- [ ] **5. Demo and delivery.** Add CI and Playwright coverage of the core flow and ownership. Prove documented setup and checks from a clean checkout. Run the actual host/attendee flow on target devices; inspect transcript errors and code-image legibility. Document limitations and AI assistance. Verify production builds and deployment configuration before any separately authorized deployment.

After each milestone, record a short evidence note here: verified behavior, checks run, and remaining gaps. Never check a milestone off from source inspection alone.

## Acceptance fixtures

Use authorized synthetic audio and screens with known timing. Include these checks:

1. Three attendees share one live transcription stream; a stale second host cannot publish audio or frames. A host crash leaves the session visibly degraded until an authorized new epoch starts or the host ends it.
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

Estimate: two experienced builders and five focused hours, including scaffolding, not a guarantee. First hour: minimal workspace setup, then capture and join/feed in parallel. Second: persistence and aligned bookmarks. Third: illustrated recap. Fourth: lifecycle implementation and failure checks. Fifth: CI, end-to-end verification, demo, and documentation. Reserve submission time separately.

If the core slice fails, cut voice, OCR, repair transcription, search, and additional sponsor integrations first. Never cut ownership checks or hide capture gaps. Report simulated integrations explicitly.

## Resolve before the affected milestone

- Before capture: target browser/device, authorized mic/screen route, provider account and retention settings.
- Before public access: identity mechanism, host access, invitation expiry, limits, revocation, redaction, and storage policy.
- Before recap: text/multimodal provider, structured output, data handling, and budget.
- Before deployment: hosting, object store, migrations, long-lived connection support, and operator ownership.
