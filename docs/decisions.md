# Decisions

Keep durable choices here. Mark proposals explicitly; add rationale and consequences when changing a choice. Split out an ADR only when a decision needs more than a short entry.

## Confirmed by the team

- **Name:** Simon Says.
- **Capture:** one host captures the speaker mic and screen; attendees consume a shared transcript and make private selections.
- **Output:** personal summaries include source passages and screenshots.
- **Repository:** one monorepo contains everything needed to develop, test, and deploy the app.
- **UI:** Vite and shadcn/ui. `AGENTS.md` is the sole agent entry point; no `agent.md` alias.

## Proposed implementation defaults

- React, strict TypeScript, pnpm workspaces, and shared shadcn components. Use the official Vite setup and only necessary tooling. Pin the generated toolchain when scaffolding.
- One Node API, Postgres, private object storage, and a Deepgram adapter. SSE for attendees; WebSocket for host ingest. Isolate provider adapters so uncertain integrations do not shape domain rules.
- Thirty-second marks, one-second screen observations, and a two-minute resend cap. Validate actual timing and readability.
- Shared-source expiry 24 hours after session end; selected-content expiry 30 days after selection. Confirm permission and cleanup behavior before claiming these guarantees.
- Elastic search, Dash0 observability, and Radar operations follow a working core slice. Sonar/Gitar is a development-workflow option, not application functionality.

## Superseded and deferred

The personal-device recorder with a strict 30-second discard buffer is superseded. Central session retention supports late marks, reconnects, and optional repair. Do not carry its privacy promise into this design.

Voice commands, continuous video playback, on-device transcription, translation, and multiple-room operations are deferred. Screen interpretation and repair transcription are optional extensions. No vendor integration, cost, accuracy, or winning probability is validated yet.

## Primary references

Reviewed November 9, 2026. Recheck implementation-specific APIs and versions when used.

- [AGENTS.md convention](https://agents.md/): concise agent guidance separate from the human README.
- [Vite](https://vite.dev/guide/), [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite), [shadcn monorepos](https://ui.shadcn.com/docs/monorepo), [pnpm workspaces](https://pnpm.io/workspaces).
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): permission and audio availability constraints.
- [Deepgram streaming](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [keyterms](https://developers.deepgram.com/docs/keyterm), [data handling](https://developers.deepgram.com/trust-security/your-data), [usage redaction](https://developers.deepgram.com/docs/redact-usage).
- [Hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources), [rules](https://www.wemakedevs.org/hackathons/cnh/rules), [schedule](https://www.wemakedevs.org/hackathons/cnh/schedule).
- [Plaud highlights](https://support.plaud.ai/hc/en-us/articles/63429919023385-Highlight-a-moment-while-recording-for-v4-0-x-or-later): marking recorded moments already exists. Simon Says emphasizes shared session capture with private, illustrated selections; uniqueness is not established.
