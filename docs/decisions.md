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

## Proposed implementation defaults

- **LLM tooling (proposal):** use the Vercel AI SDK (`ai`), including its Agent and tool-loop APIs, in server-owned LLM workflows. Verify APIs against the version selected during implementation. Provider/model selection and durable recap job execution remain open; vendoring guidance does not install or validate an integration.

- Next.js Route Handlers and Vercel Node.js functions, managed Postgres, private object storage, and a server-side Deepgram adapter. Propose reconnectable SSE for attendees and a Vercel WebSocket function for host ingest. Verify routing, duration limits, shared event delivery, and durable lease fencing in milestone 1.
- Choose hosted database and storage vendors, a recap job mechanism, and cleanup scheduling before their milestones. Vercel hosting does not select these services or authorize provisioning. Isolate provider adapters from domain rules.
- Thirty-second marks, one-second screen observations, and a two-minute resend cap. Validate actual timing and readability.
- Shared-source expiry 24 hours after session end; selected-content expiry 30 days after selection. Confirm permission and cleanup behavior before claiming these guarantees.
- Deepgram remains a proposed transcription provider. The recap model is undecided.

## Tools under consideration

These tools appear in the [hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources). Considering them does not authorize installation or enablement; no integration is confirmed.

- **Dash0:** trace caption latency, transcription failures, and recap errors without logging captured content, private notes, or model prompts.
- **Sonar/Gitar:** development tooling to review the three builders' PRs and catch bugs. No auto-apply, automatic pushes, or PR comments are authorized.
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
- [Deepgram streaming](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [keyterms](https://developers.deepgram.com/docs/keyterm), [data handling](https://developers.deepgram.com/trust-security/your-data), [usage redaction](https://developers.deepgram.com/docs/redact-usage).
- [Hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources), [rules](https://www.wemakedevs.org/hackathons/cnh/rules), [schedule](https://www.wemakedevs.org/hackathons/cnh/schedule).
- [Plaud highlights](https://support.plaud.ai/hc/en-us/articles/63429919023385-Highlight-a-moment-while-recording-for-v4-0-x-or-later): marking recorded moments already exists. Simon Says emphasizes shared session capture with private, illustrated selections; uniqueness is not established.
