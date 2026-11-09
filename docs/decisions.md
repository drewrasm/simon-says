# Decisions

Keep durable choices here. Mark proposals explicitly; add rationale and consequences when changing a choice. Split out an ADR only when a decision needs more than a short entry.

## Confirmed by the team

- **Name:** Simon Says.
- **Capture:** one host captures the speaker mic and screen; attendees consume a shared transcript and make private selections.
- **Output:** personal summaries include source passages and screenshots.
- **Repository:** one monorepo contains everything needed to develop, test, and deploy the app.
- **Application and hosting:** keep the full-stack Next.js app and shadcn/ui; deploy to Kubernetes operated through Radar. This supersedes Vercel hosting, not the existing app foundation. The team cluster is provisioned.
- **Database tooling:** Prisma for PostgreSQL. Local development uses PostgreSQL and a private SeaweedFS S3 bucket; cluster Postgres and private storage provisioning remain unverified.
- **Toolchain:** Node.js 22.22.0, pnpm 11.24.0, Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3, Vitest 5.1, and Prisma 7.10.1.
- **Workspace:** strict TypeScript, pnpm workspaces, and shared shadcn components. The foundation includes a shadcn Button from the official registry with manual setup.
- **Workflow:** no direct commits to `main`. Every change, including docs and CI, goes through a branch and pull request that passes `pnpm check` CI and Gitar review before merge, except the guarded machine-generated deploy-tag PRs described below. Auto-apply, automatic pushes, and merges by tools stay disabled unless separately authorized.
- **Agent entry point:** `AGENTS.md` only; no `agent.md` alias.
- **Hackathon scope:** use technology from all four sponsor tracks: Radar, Dash0, Sonar/Gitar, and Elasticsearch. These are selected integrations, not completed setup. See [scope and evidence](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzc1LTA2YmQtNDllNS04NjZhLTg0NmY2NTczYzk5NyI=).
- **Team:** three builders, with UI and transcription interests. Ownership is in [building tracks](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzlmLWMzMDMtNGUwYy1hOTBhLWM4MzJjZGU3ZDQwNSI=).

## Confirmed by the Track 2 owner

Dylan confirmed **Plan B** on November 9, 2026. OpenAI is the only model provider, paid with hackathon OpenAI credits. Runtime behavior remains unverified; this decision does not install dependencies or prove an integration.

- **Live captions:** `gpt-realtime-whisper` for live word-by-word deltas; `gpt-live-transcribe` is a same-price configuration swap. Live captions justify the higher cost: about $0.77 per 45-minute talk, within credits. Verify credits and quota when the key is issued.
- **SDK:** server-only `ai` 7.0.x `experimental_streamTranscribe` with `@ai-sdk/openai` 4.0.x `openai.transcription(model)`. SDK source inspection shows a server-side WebSocket to `wss://api.openai.com/v1/realtime?intent=transcription`, `session.update` with `turn_detection: null`, forwarded `input_audio_buffer.append`, and one commit when input closes. It maps events to `transcript-delta` / `transcript-final`, ends at the first final, and returns `segments: []`.
- **Lifecycle:** successive windows accommodate that SDK lifecycle; a WindowManager owns rotation and a CaptionAssembler owns interim replacement and ordered finals. Source timing comes from our audio offsets, never provider timestamps. See [Plan B architecture](architecture.md#transcription-and-text-passes).
- **Configuration:** server-only `OPENAI_API_KEY`, `CAPTION_MODEL`, and `CAPTION_DELAY`; start `providerOptions.openai.streaming.delay` at `low` (choices: `minimal`, `low`, `medium`, `high`, `xhigh`). Streaming `prompt` and keywords warn as unsupported: no live vocabulary hints.

Estimated cost per minute, verified November 9, 2026 by the Track 2 owner from [OpenAI API pricing](https://developers.openai.com/api/docs/pricing):

| Model                    | Estimated USD/min | Caption behavior                   |
| ------------------------ | ----------------- | ---------------------------------- |
| `gpt-4o-mini-transcribe` | $0.003            | HTTP batch; no live text           |
| `gpt-transcribe`         | $0.0045           | WebSocket; per committed turn      |
| `gpt-4o-transcribe`      | $0.006            | Transcription alternative          |
| `gpt-realtime-whisper`   | $0.017            | Selected; live word-by-word deltas |
| `gpt-live-transcribe`    | $0.017            | Same-price configuration swap      |

Unverified until a key exists: session length limits, faster-than-realtime replay, how often finals differ from deltas, latency per `delay`, and rate limits. First real call is in the cluster with the key in the runtime Secret; domain unit tests and fake transcription-model tests need no key.

## Core content store confirmed by the Track 2 owner

Dylan confirmed this data split on November 9, 2026. Provisioning and runtime behavior remain unverified.

| Data                                                                                                                                                                                | Store                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Shared transcript segments, every revision with live/corrected/repaired provenance; screen observations with capture time, frame ID, checksum, slide glossary terms, and object key | Elasticsearch on Elastic Cloud Serverless, using the hackathon trial; system of record for shared source content |
| Identity, sessions, membership, host lease and ingest epoch, bookmarks, private notes, recaps, job queue, finalized-transcript offset, and audio acknowledgments                    | Postgres via Prisma, using CloudNativePG in the team Kubernetes cluster                                          |
| Screen frame images                                                                                                                                                                 | Private object storage; Elasticsearch holds only the object key                                                  |

The team cluster budget (2 CPU / 4 GiB requests, 4 CPU / 8 GiB limits total) cannot fit Elasticsearch alongside the app and Postgres. Elastic Cloud keeps it outside that budget. The Elastic track requires Elasticsearch as the core data layer.

Track 2 writes segments and frame observations during ingest from milestone 1. Track 3 resolves bookmarks by fixed session-clock ranges and implements keyword plus `semantic_text` search; track 1 builds the search UI. Captions come first, but search is core work alongside private highlights, not a later integration. The Track 3 owner chose the embedding endpoint; see [Track 3 decisions](#confirmed-by-the-track-3-owner).

Private data never enters Elasticsearch. Every source read checks current membership and access in Postgres first, including replay and resolution after revocation. Expiry, redaction, and deletion require durable, resumable Elasticsearch cleanup; materialize selected evidence before shared-source expiry. Elasticsearch outages visibly degrade captions and cannot silently discard source content. Milestone 1 must settle cross-store write ordering and durable acknowledgment before acceptance.

## Confirmed by the Track 3 owner

Logan confirmed these on November 9, 2026. Neither decision proves a live integration.

- **Embedding endpoint:** `.jina-embeddings-v5-text-small`, configured through `ELASTICSEARCH_INFERENCE_ID`. Availability and processing settings (zero data retention, AWS `us-west-2`) were confirmed in the Elastic project and operator setup completed on November 9 ([evidence](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzODUyLTVmY2MtNGU0YS05Y2IwLTNlMjc4MGY4M2UxOSI=)); the per-token rate is not shown by the inference API.
- **Recap model:** OpenAI through the AI SDK, reusing `OPENAI_API_KEY` from Secret `app-credentials`. The model id is configurable through server-only `RECAP_MODEL`. Recaps send only the owner's selected passages.

## Proposed implementation defaults

- **Approximate note clock (Track 1, November 9):** notes pin `markedAtMs` to time since session creation until Track 2 supplies a capture-aligned session clock; see [contracts](contracts.md#track-3-payloads). Notes use Track 3's bookmark API.

- **LLM workflows:** recaps use OpenAI through the Vercel AI SDK (`ai` structured output, no tools), as [decided](#confirmed-by-the-track-3-owner). C4 defaults `RECAP_MODEL` to `gpt-5.4-mini` and runs generation request-scoped through Next.js `after()`; see the [recap contract](contracts.md#track-3-payloads). Proposal: a durable job queue with restart recovery remains an implementation choice.

- Next.js Route Handlers with a custom Node WebSocket entry point, reconnectable SSE, and the confirmed server-only caption adapter. Prove packaging in checkpoint 0A and cross-pod recovery in milestone 1. Propose a durable Postgres event log with bounded polling; leases and replay cannot depend on pod memory.
- Use CloudNativePG for PostgreSQL; propose private S3-compatible storage, a Postgres-backed job worker, and Kubernetes CronJobs for cleanup. Storage location, job library, capacity, and post-hackathon hosting remain open. Isolate provider adapters from domain rules.
- Thirty-second marks, one-second screen observations, and a two-minute resend cap. Validate actual timing and readability.
- Shared-source expiry 24 hours after session end; selected-content expiry 30 days after selection. Confirm permission and cleanup behavior before claiming these guarantees.
- **Slide glossary and caption correction (proposal, milestones 2–3):** use OpenAI through the AI SDK; choose the cheapest OpenAI model that passes the check at implementation. Extract glossary terms from changed screen frames and correct finalized captions asynchronously, preserving originals and writing new `corrected` revisions. Keep both passes off the live caption path. Treat screen and transcript text as untrusted data, never instructions.

## Selected hackathon integrations

Use the [hackathon integrations doc](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzc1LTA2YmQtNDllNS04NjZhLTg0NmY2NTczYzk5NyI=) as the integration scope and account checklist. Radar owns deployment operations, Dash0 application observability, and Sonar/Gitar development review. Elasticsearch is the core shared-content store and passage retrieval layer. Captions come first; Elasticsearch stores segments from milestone 1, with search and private highlights in milestone 2.

Detailed adapters and service plans remain proposals. Gitar's normal review writes PR comments; resolve repository-admin enablement explicitly before installing it. Coding agents must not post PR comments. Automatic fixes, pushes, merges, and deployment are not authorized by this documentation update.

## Superseded and deferred

**Superseded LiveASR spike (November 9, 2026, local only):** llama.cpp 0.9.0 `llama serve` ran Liquid AI LFM3-Audio-2B stock GGUF on an Apple M4 Max. Synthetic speech at 16 kHz PCM16 in 100 ms appends produced live deltas about every second; context restarts degraded leading words and jargon. Real-microphone and deployment behavior were not verified. Liquid audio, VL/text models, local model hosting, and the direct-protocol adapter are superseded by OpenAI through the AI SDK. Retain the lesson: timing comes from our source clock, not provider timestamps.

Vite and the separate `apps/api` service remain superseded by the full-stack Next.js app. Vercel hosting, its experimental WebSocket API, `vercel dev`, and Vercel-specific job assumptions are superseded by the Kubernetes plan.

Elasticsearch as optional stretch work, a derived index with Postgres authoritative for shared content, and search sequenced after private saves are superseded by Dylan’s November 9, 2026 core-content-store decision. Radar being set aside is superseded by the decision to use all four hackathon tracks. The Vercel AI SDK and vendored React guidance remain independent of hosting.

The personal-device recorder with a strict 30-second discard buffer is superseded. Central session retention supports late marks, reconnects, and optional repair. Do not carry its privacy promise into this design.

Voice commands, continuous video playback, on-device transcription, translation, and multiple-room operations are deferred. Screen interpretation and repair transcription are optional extensions. No vendor runtime integration, measured cost, accuracy, or winning probability is validated yet.

## Primary references

Reviewed November 9, 2026. Recheck implementation-specific APIs and versions when used.

- [AGENTS.md convention](https://agents.md/): concise agent guidance separate from the human README.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [shadcn Next.js setup](https://ui.shadcn.com/docs/installation/next), [shadcn monorepos](https://ui.shadcn.com/docs/monorepo), [pnpm workspaces](https://pnpm.io/workspaces).
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [custom server](https://nextjs.org/docs/app/guides/custom-server), and [Radar starter](https://github.com/skyhook-io/cnh-starter): validate the Node entry point, container, gateway, and cluster configuration before deployment.
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): permission and audio availability constraints.
- Superseded: [Liquid AI LFM3-Audio-2B](https://huggingface.co/LiquidAI/LFM3-Audio-2B): LiveASR prompt, English-only mode, chunking, input rate, context restarts, and license.
- Superseded: [LFM3-Audio-2B GGUF](https://huggingface.co/LiquidAI/LFM3-Audio-2B-GGUF): llama.cpp v0.8.0 or newer; realtime support does not establish stock GGUF LiveASR behavior.
- Superseded: [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#websocket-v1realtime-realtime-transcription): WebSocket `/v1/realtime` schema and transcription intent. The local spike confirmed stock GGUF LiveASR on this endpoint; see the spike evidence above.
- [AI SDK `experimental_streamTranscribe`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-transcribe): streaming API and OpenAI example. Plan B uses successive windows for the SDK lifecycle described above.
- [Hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources), [rules](https://www.wemakedevs.org/hackathons/cnh/rules), [schedule](https://www.wemakedevs.org/hackathons/cnh/schedule).
- [Plaud highlights](https://support.plaud.ai/hc/en-us/articles/63429919023385-Highlight-a-moment-while-recording-for-v4-0-x-or-later): marking recorded moments already exists. Simon Says emphasizes shared session capture with private, illustrated selections; uniqueness is not established.

## S3 Plan B caption implementation

November 9, 2026: S3 implements the Plan B direction above as a development pipeline. Use AI SDK `experimental_streamTranscribe` with `@ai-sdk/openai`, default `gpt-realtime-whisper`, in consecutive 24 kHz windows. Input close commits each window; prewarm the next call before rotation. SDK versions are pinned in the lockfile; real OpenAI behavior remains unverified. The SDK supplies `MockTranscriptionModelV4`; tests adapt its optional method typing to this repository's `exactOptionalPropertyTypes` setting by exposing only defined methods.

Final publication waits for the segment sink. Sink failure emits degraded state and an exact-range gap, then permits later windows; no final is emitted for failed persistence. The in-memory sink and receipt/replay state are explicitly development-only. The C2 runtime selects Elasticsearch when configured and otherwise visibly degrades the development fallback; see [sink wiring](architecture.md#c2-elasticsearch-segment-sink). Production access is disabled until real authority and deployed durability are verified; the dev flag cannot override this. No provider key or service call is needed for tests. This preserves the shared-content ownership decision above and leaves milestone 1 acceptance open.

## C1a release tags

GHCR publication runs after main checks using full SHA tags and a mutable `main` alias. Source merges now deploy automatically through publish → `deploy/<sha>` PR → immediate `gh pr merge --merge --admin` → Argo CD sync once activated. Deploy-tag PRs are the only class merged without Gitar review or deploy-branch checks: they are machine-generated, single-value app `newTag` bumps. A git-tree guard verifies the one-file, one-value diff and exact published SHA; unexpected changes stay open. Freshness checks close superseded PRs; pinned-head merging rejects PR edits; reruns tolerate merged PRs. This explicitly authorizes workflow merges for this class only and supersedes manual deploy-PR merge guidance. No direct main commits, repository auto-merge setting changes, or PR comments are needed.

Repository variable `AUTO_DEPLOY=false` pauses automatic tag merges (default enabled), leaving publication and Argo CD sync active. Pause before a reviewed rollback PR selecting an older published SHA or reverting the deploy-tag commit. See the [release flow](deployment.md#release-flow-c1a) for concurrency, recovery, race limits, and verification commands. Source PRs still require CI and Gitar review.

The Application enables automated sync, self-healing, and final-wave pruning of eligible stateless resources (`PruneLast=true`). Data-bearing resources carry `Prune=false,Delete=false` and require manual, approved removal. Applying the Application requires explicit operator approval through Radar. This automation change performs no cluster operations; live automatic merging and rollout remain pending verification.

### Ruleset interaction for guarded deploy tags

The `main` ruleset requires `check`, `container`, and `Gitar`. Machine-generated tag bumps deliberately bypass these required checks and Gitar only after the published source SHA passed CI, the exact tag-only diff and expected SHA pass validation, freshness checks find no newer source changes, the PR head is pinned, and `AUTO_DEPLOY` is not `false`. Merge uses `--merge --admin --match-head-commit`; refusal is a visible job failure and leaves the PR open. Older ancestor-release deploy PRs are closed without comments when proposing a newer release. Human-authored deploy/rollback PRs keep normal checks and review; PR CI has no path exclusion, while main pushes keep the kustomization exclusion to prevent publish loops.

Use optional `DEPLOY_TOKEN` for a fine-grained PAT or dedicated installed GitHub App token whose actor has ruleset bypass, with `GITHUB_TOKEN` fallback. GitHub documents App/role bypass; the built-in Actions integration's eligibility has not been confirmed. Drew must configure the bypass and secret using the [one-time setup](deployment.md#ruleset-bypass-one-time-admin-setup-drew). No credential or settings changes are authorized by this documentation. Live bypass is pending operator verification.

## C1b Elasticsearch storage setup

Track 2 supplies strict `segments-v1` and `observations-v1` mappings behind write aliases, deterministic IDs, and drift-detecting setup. Segment `text` uses `copy_to` to `text_semantic`, preserving the PR #9 application source shape and avoiding duplicate writer fields. Only final revisions are stored. See [contracts](contracts.md#elasticsearch-v1-storage-boundary).

The `.jina-embeddings-v5-text-small` default is [decided by Track 3](#confirmed-by-the-track-3-owner), configurable through `ELASTICSEARCH_INFERENCE_ID`. Processing settings are confirmed in the cloud project ([evidence](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzODUyLTVmY2MtNGU0YS05Y2IwLTNlMjc4MGY4M2UxOSI=)); per-token cost and cloud app-key behavior remain unverified. Local smoke uses `.multilingual-e5-small-elasticsearch`; automatic inference and semantic search passed with zero cluster privileges. The v9 client is pinned to available 9.5.1; cloud 9.7.0 remains an authorized operator verification gate.

## PR #13 caption review decisions (November 9, 2026)

Host WebSocket close code 1000 is end of input until an explicit stop message exists. Other disconnects retain the window for a configurable ten-second grace; an ended epoch requires a higher epoch to restart. Replacement epochs finish previously accepted tails rather than cancelling them. Finishing is bounded at five seconds, including provider and segment-sink completion, then publishes exact-range gaps and suppresses late finals. Shutdown performs that finish while SSE is open within the process drain budget.

SSE snapshots reuse original event cursors and merge retained finals, state, and log in cursor order. Per-subscriber queues pause on drain and cap buffered bytes at 8 MiB, enough for the 500-large-final regression scenario. Overflow preflights whole batches and disconnects only that reader. Replay remains process-local and bounded, not durable history. Deployment caption settings are wired, but development authority is never enabled by the checked-in cluster manifests.
