# Decisions

Keep durable choices here. Mark proposals explicitly; add rationale and consequences when changing a choice. Split out an ADR only when a decision needs more than a short entry.

## Confirmed by the team

- **Name:** Simon Says.
- **Capture:** one host captures the speaker mic and screen; attendees consume a shared transcript and make private selections.
- **Output:** personal summaries include source passages and screenshots.
- **Repository:** one monorepo contains everything needed to develop, test, and deploy the app.
- **Application and hosting:** one full-stack Next.js app on Vercel, with shadcn/ui. This replaces Vite and the separate Node API.
- **Database tooling:** Prisma for PostgreSQL. Local development uses PostgreSQL and a private SeaweedFS S3 bucket; hosted database and storage vendors remain undecided.
- **Toolchain:** Node.js 22.22.0, pnpm 11.24.0, Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3, Vitest 5.1, and Prisma 7.10.1.
- **Workspace:** strict TypeScript, pnpm workspaces, and shared shadcn components. The foundation includes a shadcn Button from the official registry with manual setup.
- **Agent entry point:** `AGENTS.md` only; no `agent.md` alias.
- **Team:** three builders, with UI and transcription interests. Proposed ownership is in the [implementation plan](implementation-plan.md#three-builder-tracks).

## Confirmed by the Track 2 owner

Dylan confirmed this direction on November 9, 2026. Runtime behavior remains unverified; the milestone 1 spike is pending.

- **First transcription provider:** Liquid AI LFM3-Audio-2B, open weights under the LFM Open License v1.0. Use LiveASR with system prompt `Perform live ASR.`: English only, about 0.96 s chunks, 16 kHz input, and text context restarts about every 30 s. Serve through llama.cpp `llama serve` v0.8.0 or newer at WebSocket `/v1/realtime?intent=transcription`. Stock GGUF LiveASR support on this endpoint and latency still need verification.
- **Wire protocol and swap provider:** llama.cpp documents compatibility with OpenAI's `/v1/realtime` schema: send `input_audio_buffer.append`/`commit`; consume `conversation.item.input_audio_transcription.delta`/`completed`. OpenAI realtime transcription, for example `gpt-realtime-whisper`, is the swap provider. Switching changes only base URL, model ID, credentials, and input sample rate: 16 kHz for LFM3-Audio, versus 24 kHz PCM16 in OpenAI's example. Verify interchangeability in the spike.
- **Caption adapter:** implement the protocol directly in a server-only adapter in `apps/web/src/server`. Own commit boundaries, handle many items per session, and resample per provider. Stamp text with our source clock from the audio offsets sent, not provider timestamps. Provider choice and credentials are server-only configuration, with no `NEXT_PUBLIC_` variables.
- **AI SDK boundary:** do not use `experimental_streamTranscribe` for the caption stream. In `@ai-sdk/openai` 4.0.x it sends one commit at end of input, closes on the first `.completed` event, and returns no segment timestamps; that lifecycle cannot cover a whole talk. Reserve `ai` for text and vision passes below. This records the design rationale, not a verified integration.

## Proposed implementation defaults

- **LLM tooling (proposal):** use the Vercel AI SDK (`ai`), including its Agent and tool-loop APIs, in server-owned LLM workflows. Verify APIs against the version selected during implementation. Recap provider/model selection and durable recap job execution remain open; vendoring guidance does not install or validate an integration.

- Next.js Route Handlers and Vercel Node.js functions, managed Postgres, private object storage, and the confirmed server-only caption adapter. Propose reconnectable SSE for attendees and a Vercel WebSocket function for host ingest. Verify routing, duration limits, shared event delivery, and durable lease fencing in milestone 1.
- Choose hosted database and storage vendors, a recap job mechanism, and cleanup scheduling before their milestones. Vercel hosting does not select these services or authorize provisioning. Isolate provider adapters from domain rules.
- Thirty-second marks, one-second screen observations, and a two-minute resend cap. Validate actual timing and readability.
- Shared-source expiry 24 hours after session end; selected-content expiry 30 days after selection. Confirm permission and cleanup behavior before claiming these guarantees.
- **Slide glossary and caption correction (proposal, milestones 2–3):** use `ai` through `createOpenAICompatible` pointed at `llama serve`, or through `@ai-sdk/openai`. A Liquid vision model (LFM2.5-VL or LFM3-VL family) reads each changed screen frame to extract on-screen terms. A small Liquid text model uses that glossary to correct finalized segments asynchronously, writing new `TranscriptSegment` revisions with existing `corrected` provenance and preserving original text. Never put correction on the live caption path. Treat screen and transcript text as untrusted data, never instructions. This is outside milestone 1; the recap model remains undecided.
- **Model hosting (open):** local `llama serve` is for development. How a Vercel preview reaches a model is undecided: use OpenAI in preview, or `llama serve` on a reachable host. Resolve before milestone 1 acceptance; see the [open questions](implementation-plan.md#resolve-before-the-affected-milestone).

## Tools under consideration

These tools appear in the [hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources). Considering them does not authorize installation or enablement; no integration is confirmed.

- **Dash0:** plan integration during milestone 1 to trace caption latency, transcription failures, and recap errors without logging captured content, private notes, or model prompts.
- **Sonar/Gitar:** plan adoption when feature PRs begin, as development tooling to review the three builders' PRs and catch bugs. No auto-apply, automatic pushes, or PR comments are authorized.
- **Elasticsearch:** optional stretch work after live captions and private highlights work. Search transcript passages by keyword or meaning, then explicitly select results for a personal recap. Preserve session access, ownership, and source references.

Any search index must follow source expiry, redaction, and deletion. Search reads must recheck current access against Postgres, including membership revocation.

Next.js on Vercel remains confirmed. Radar is set aside.

## Superseded and deferred

Vite and the separate `apps/api` service are superseded by the full-stack Next.js app on Vercel.

The personal-device recorder with a strict 30-second discard buffer is superseded. Central session retention supports late marks, reconnects, and optional repair. Do not carry its privacy promise into this design.

Voice commands, continuous video playback, on-device transcription, translation, and multiple-room operations are deferred. Screen interpretation and repair transcription are optional extensions. No vendor integration, cost, accuracy, or winning probability is validated yet.

## Primary references

Reviewed November 9, 2026. Recheck implementation-specific APIs and versions when used.

- [AGENTS.md convention](https://agents.md/): concise agent guidance separate from the human README.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [shadcn Next.js setup](https://ui.shadcn.com/docs/installation/next), [shadcn monorepos](https://ui.shadcn.com/docs/monorepo), [pnpm workspaces](https://pnpm.io/workspaces).
- [Vercel WebSocket announcement](https://vercel.com/changelog/websocket-support-is-now-in-public-beta), [Next.js WebSocket guide](https://vercel.com/kb/guide/real-time-chat-websockets), [function duration](https://vercel.com/docs/functions/configuring-functions/duration). Public beta with an experimental Next.js upgrade API; runtime and local CLI support still need project-specific verification.
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): permission and audio availability constraints.
- [Liquid AI LFM3-Audio-2B](https://huggingface.co/LiquidAI/LFM3-Audio-2B): LiveASR prompt, English-only mode, chunking, input rate, context restarts, and license.
- [LFM3-Audio-2B GGUF](https://huggingface.co/LiquidAI/LFM3-Audio-2B-GGUF): llama.cpp v0.8.0 or newer; realtime support does not establish stock GGUF LiveASR behavior.
- [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#websocket-v1realtime-realtime-transcription): WebSocket `/v1/realtime` schema and transcription intent. Confirm model-specific behavior in the pending spike.
- [AI SDK `experimental_streamTranscribe`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-transcribe): streaming API and OpenAI example. The caption adapter uses the protocol directly for the lifecycle reasons above.
- [Hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources), [rules](https://www.wemakedevs.org/hackathons/cnh/rules), [schedule](https://www.wemakedevs.org/hackathons/cnh/schedule).
- [Plaud highlights](https://support.plaud.ai/hc/en-us/articles/63429919023385-Highlight-a-moment-while-recording-for-v4-0-x-or-later): marking recorded moments already exists. Simon Says emphasizes shared session capture with private, illustrated selections; uniqueness is not established.
