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
- **Agent entry point:** `AGENTS.md` only; no `agent.md` alias.
- **Hackathon scope:** use technology from all four sponsor tracks: Radar, Dash0, Sonar/Gitar, and Elasticsearch. These are selected integrations, not completed setup. See [scope and evidence](hackathon.md).
- **Team:** three builders, with UI and transcription interests. Proposed ownership is in the [implementation plan](implementation-plan.md#three-builder-tracks).

## Confirmed by the Track 2 owner

Dylan confirmed this direction on November 9, 2026. A first local spike ran the same day; production behavior remains unverified.

**Spike evidence (November 9, 2026, local only):** llama.cpp 0.9.0 (Homebrew) on an Apple M4 Max served `LiquidAI/LFM3-Audio-2B-GGUF:Q4_K_M` with `llama serve`. A Node client streamed synthetic macOS `say` speech (16 kHz PCM16, known reference text) to `/v1/realtime?intent=transcription` at real-time pace in 100 ms appends. `session.created` reported a 16 kHz input rate. The stock GGUF transcribed live: deltas arrived in bursts about every second, roughly 0.1–0.3 s after the audio that contained them, and `.completed` followed the final commit. A 20 s clip transcribed correctly apart from `open telemetry` and `dash zero` for OpenTelemetry and Dash0. On a 63 s clip, the whole stream stayed one item; each context restart appeared as a newline inside it, and text after restarts dropped a leading word and garbled jargon (`Elastic's Arx`). The adapter must split items on newlines and its own commits, and treat post-restart text as lower confidence. Not yet measured: real microphone or room audio, word error rate, long sessions, mid-stream commits, and the OpenAI swap. The server logs that audio input is experimental.

- **First transcription provider:** Liquid AI LFM3-Audio-2B, open weights under the LFM Open License v1.0. Use LiveASR with system prompt `Perform live ASR.`: English only, about 0.96 s chunks, 16 kHz input, and text context restarts about every 30 s. Serve through llama.cpp `llama serve` v0.8.0 or newer at WebSocket `/v1/realtime?intent=transcription`. Stock GGUF LiveASR worked in the local synthetic-speech spike; real-microphone latency and accuracy still need verification.
- **Wire protocol and swap provider:** llama.cpp documents compatibility with OpenAI's `/v1/realtime` schema: send `input_audio_buffer.append`/`commit`; consume `conversation.item.input_audio_transcription.delta`/`completed`. OpenAI realtime transcription, for example `gpt-realtime-whisper`, is the swap provider. Switching changes only base URL, model ID, credentials, and input sample rate: 16 kHz for LFM3-Audio, versus 24 kHz PCM16 in OpenAI's example. Verify interchangeability against OpenAI; only the llama.cpp side has been exercised.
- **Caption adapter:** implement the protocol directly in a server-only adapter in `apps/web/src/server`. Own commit boundaries, handle many items per session, and resample per provider. Stamp text with our source clock from the audio offsets sent, not provider timestamps. Provider choice and credentials are server-only configuration, with no `NEXT_PUBLIC_` variables.
- **AI SDK boundary:** do not use `experimental_streamTranscribe` for the caption stream. In `@ai-sdk/openai` 4.0.x it sends one commit at end of input, closes on the first `.completed` event, and returns no segment timestamps; that lifecycle cannot cover a whole talk. Reserve `ai` for text and vision passes below. This records the design rationale, not a verified integration.

## Core content store confirmed by the Track 2 owner

Dylan confirmed this data split on November 9, 2026. Provisioning and runtime behavior remain unverified.

| Data                                                                                                                                                                                | Store                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Shared transcript segments, every revision with live/corrected/repaired provenance; screen observations with capture time, frame ID, checksum, slide glossary terms, and object key | Elasticsearch on Elastic Cloud Serverless, using the hackathon trial; system of record for shared source content |
| Identity, sessions, membership, host lease and ingest epoch, bookmarks, private notes, recaps, job queue, finalized-transcript offset, and audio acknowledgments                    | Postgres via Prisma, using CloudNativePG in the team Kubernetes cluster                                          |
| Screen frame images                                                                                                                                                                 | Private object storage; Elasticsearch holds only the object key                                                  |

The team cluster budget (2 CPU / 4 GiB requests, 4 CPU / 8 GiB limits total) cannot fit Elasticsearch alongside the app and Postgres. Elastic Cloud keeps it outside that budget. The Elastic track requires Elasticsearch as the core data layer.

Track 2 writes segments and frame observations during ingest from milestone 1. Track 3 resolves bookmarks by fixed session-clock ranges and implements keyword plus `semantic_text` search; track 1 builds the search UI. Captions come first, but search is core work alongside private highlights, not a later integration. Confirm the inference endpoint in the project before choosing a model such as Jina.

Private data never enters Elasticsearch. Every source read checks current membership and access in Postgres first, including replay and resolution after revocation. Expiry, redaction, and deletion require durable, resumable Elasticsearch cleanup; materialize selected evidence before shared-source expiry. Elasticsearch outages visibly degrade captions and cannot silently discard source content. Milestone 1 must settle cross-store write ordering and durable acknowledgment before acceptance.

## Proposed implementation defaults

- **LLM tooling (proposal):** use the Vercel AI SDK (`ai`), including its Agent and tool-loop APIs, in server-owned LLM workflows. Verify APIs against the version selected during implementation. Recap provider/model selection and durable recap job execution remain open; vendoring guidance does not install or validate an integration.

- Next.js Route Handlers with a custom Node WebSocket entry point, reconnectable SSE, and the confirmed server-only caption adapter. Prove packaging in checkpoint 0A and cross-pod recovery in milestone 1. Propose a durable Postgres event log with bounded polling; leases and replay cannot depend on pod memory.
- Use CloudNativePG for PostgreSQL; propose private S3-compatible storage, a Postgres-backed job worker, and Kubernetes CronJobs for cleanup. Storage location, job library, capacity, and post-hackathon hosting remain open. Isolate provider adapters from domain rules.
- Thirty-second marks, one-second screen observations, and a two-minute resend cap. Validate actual timing and readability.
- Shared-source expiry 24 hours after session end; selected-content expiry 30 days after selection. Confirm permission and cleanup behavior before claiming these guarantees.
- **Slide glossary and caption correction (proposal, milestones 2–3):** use `ai` through `createOpenAICompatible` pointed at `llama serve`, or through `@ai-sdk/openai`. A Liquid vision model (LFM2.5-VL or LFM3-VL family) reads each changed screen frame to extract on-screen terms. A small Liquid text model uses that glossary to correct finalized segments asynchronously, writing new `TranscriptSegment` revisions with existing `corrected` provenance and preserving original text. Never put correction on the live caption path. Treat screen and transcript text as untrusted data, never instructions. This is outside milestone 1; the recap model remains undecided.
- **Model hosting (open):** local `llama serve` is for development. How the Kubernetes deployment reaches a model is undecided: use OpenAI, or `llama serve` on a reachable host. Resolve before milestone 1 acceptance; see the [open questions](implementation-plan.md#resolve-before-the-affected-milestone).

## Selected hackathon integrations

Use [hackathon.md](hackathon.md) as the integration scope and account checklist. Radar owns deployment operations, Dash0 application observability, and Sonar/Gitar development review. Elasticsearch is the core shared-content store and passage retrieval layer. Captions come first; Elasticsearch stores segments from milestone 1, with search and private highlights in milestone 2.

Detailed adapters and service plans remain proposals. Gitar's normal review writes PR comments; resolve repository-admin enablement explicitly before installing it. Coding agents must not post PR comments. Automatic fixes, pushes, merges, and deployment are not authorized by this documentation update.

## Superseded and deferred

Vite and the separate `apps/api` service remain superseded by the full-stack Next.js app. Vercel hosting, its experimental WebSocket API, `vercel dev`, and Vercel-specific job assumptions are superseded by the Kubernetes plan.

Elasticsearch as optional stretch work, a derived index with Postgres authoritative for shared content, and search sequenced after private saves are superseded by Dylan’s November 9, 2026 core-content-store decision. Radar being set aside is superseded by the decision to use all four hackathon tracks. The Vercel AI SDK proposal and vendored React guidance remain independent of hosting.

The personal-device recorder with a strict 30-second discard buffer is superseded. Central session retention supports late marks, reconnects, and optional repair. Do not carry its privacy promise into this design.

Voice commands, continuous video playback, on-device transcription, translation, and multiple-room operations are deferred. Screen interpretation and repair transcription are optional extensions. No vendor integration, cost, accuracy, or winning probability is validated yet.

## Primary references

Reviewed November 9, 2026. Recheck implementation-specific APIs and versions when used.

- [AGENTS.md convention](https://agents.md/): concise agent guidance separate from the human README.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [shadcn Next.js setup](https://ui.shadcn.com/docs/installation/next), [shadcn monorepos](https://ui.shadcn.com/docs/monorepo), [pnpm workspaces](https://pnpm.io/workspaces).
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [custom server](https://nextjs.org/docs/app/guides/custom-server), and [Radar starter](https://github.com/skyhook-io/cnh-starter): validate the Node entry point, container, gateway, and cluster configuration before deployment.
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): permission and audio availability constraints.
- [Liquid AI LFM3-Audio-2B](https://huggingface.co/LiquidAI/LFM3-Audio-2B): LiveASR prompt, English-only mode, chunking, input rate, context restarts, and license.
- [LFM3-Audio-2B GGUF](https://huggingface.co/LiquidAI/LFM3-Audio-2B-GGUF): llama.cpp v0.8.0 or newer; realtime support does not establish stock GGUF LiveASR behavior.
- [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#websocket-v1realtime-realtime-transcription): WebSocket `/v1/realtime` schema and transcription intent. The local spike confirmed stock GGUF LiveASR on this endpoint; see the spike evidence above.
- [AI SDK `experimental_streamTranscribe`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-transcribe): streaming API and OpenAI example. The caption adapter uses the protocol directly for the lifecycle reasons above.
- [Hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources), [rules](https://www.wemakedevs.org/hackathons/cnh/rules), [schedule](https://www.wemakedevs.org/hackathons/cnh/schedule).
- [Plaud highlights](https://support.plaud.ai/hc/en-us/articles/63429919023385-Highlight-a-moment-while-recording-for-v4-0-x-or-later): marking recorded moments already exists. Simon Says emphasizes shared session capture with private, illustrated selections; uniqueness is not established.
