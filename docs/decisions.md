# Decisions

Keep durable choices here. Mark proposals explicitly; add rationale and consequences when changing a choice. Split out an ADR only when a decision needs more than a short entry.

## Confirmed by the team

- **Name:** Simon Says.
- **Capture:** one host captures the speaker mic and screen; attendees consume a shared transcript and make private selections.
- **Output:** personal summaries include source passages and screenshots.
- **Repository:** one monorepo contains everything needed to develop, test, and deploy the app.
- **Application and hosting:** keep the full-stack Next.js app and shadcn/ui; deploy to Kubernetes operated through Radar. This supersedes Vercel hosting, not the existing app foundation. Cluster access is being arranged.
- **Database tooling:** Prisma for PostgreSQL. Local development uses PostgreSQL and a private SeaweedFS S3 bucket; cluster Postgres and private storage provisioning remain unverified.
- **Toolchain:** Node.js 22.22.0, pnpm 11.24.0, Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3, Vitest 5.1, and Prisma 7.10.1.
- **Workspace:** strict TypeScript, pnpm workspaces, and shared shadcn components. The foundation includes a shadcn Button from the official registry with manual setup.
- **Agent entry point:** `AGENTS.md` only; no `agent.md` alias.
- **Hackathon scope:** use technology from all four sponsor tracks: Radar, Dash0, Sonar/Gitar, and Elasticsearch. These are selected integrations, not completed setup. See [scope and evidence](hackathon.md).
- **Team:** three builders, with UI and transcription interests. Proposed ownership is in the [implementation plan](implementation-plan.md#three-builder-tracks).

## Proposed implementation defaults

- **LLM tooling (proposal):** use the Vercel AI SDK (`ai`), including its Agent and tool-loop APIs, in server-owned LLM workflows. Verify APIs against the version selected during implementation. Provider/model selection and durable recap job execution remain open; vendoring guidance does not install or validate an integration.

- Next.js Route Handlers with a custom Node WebSocket entry point, reconnectable SSE, and a server-side transcription adapter. Prove packaging in checkpoint 0A and cross-pod recovery in milestone 1. Propose a durable Postgres event log with bounded polling; leases and replay cannot depend on pod memory.
- Propose CloudNativePG for PostgreSQL, private S3-compatible storage, a Postgres-backed job worker, and Kubernetes CronJobs for cleanup. Storage location, job library, capacity, and post-hackathon hosting remain open. Isolate provider adapters from domain rules.
- Thirty-second marks, one-second screen observations, and a two-minute resend cap. Validate actual timing and readability.
- Shared-source expiry 24 hours after session end; selected-content expiry 30 days after selection. Confirm permission and cleanup behavior before claiming these guarantees.
- Deepgram remains a proposed transcription provider. The recap model is undecided.

## Selected hackathon integrations

Use [hackathon.md](hackathon.md) as the integration scope and account checklist. Radar owns deployment operations, Dash0 application observability, Sonar/Gitar development review, and Elasticsearch passage retrieval. Search is required for the four-track delivery, sequenced after captions and private saves.

Detailed adapters and service plans remain proposals. Gitar's normal review writes PR comments; resolve repository-admin enablement explicitly before installing it. Coding agents must not post PR comments. Automatic fixes, pushes, merges, and deployment are not authorized by this documentation update.

## Superseded and deferred

Vite and the separate `apps/api` service remain superseded by the full-stack Next.js app. Vercel hosting, its experimental WebSocket API, `vercel dev`, and Vercel-specific job assumptions are superseded by the Kubernetes plan.

Elasticsearch as optional stretch work and Radar being set aside are superseded by the decision to use all four hackathon tracks. The Vercel AI SDK proposal and vendored React guidance remain independent of hosting.

The personal-device recorder with a strict 30-second discard buffer is superseded. Central session retention supports late marks, reconnects, and optional repair. Do not carry its privacy promise into this design.

Voice commands, continuous video playback, on-device transcription, translation, and multiple-room operations are deferred. Screen interpretation and repair transcription are optional extensions. No vendor integration, cost, accuracy, or winning probability is validated yet.

## Primary references

Reviewed November 9, 2026. Recheck implementation-specific APIs and versions when used.

- [AGENTS.md convention](https://agents.md/): concise agent guidance separate from the human README.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [shadcn Next.js setup](https://ui.shadcn.com/docs/installation/next), [shadcn monorepos](https://ui.shadcn.com/docs/monorepo), [pnpm workspaces](https://pnpm.io/workspaces).
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [custom server](https://nextjs.org/docs/app/guides/custom-server), and [Radar starter](https://github.com/skyhook-io/cnh-starter): validate the Node entry point, container, gateway, and cluster configuration before deployment.
- [Browser screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): permission and audio availability constraints.
- [Deepgram streaming](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [keyterms](https://developers.deepgram.com/docs/keyterm), [data handling](https://developers.deepgram.com/trust-security/your-data), [usage redaction](https://developers.deepgram.com/docs/redact-usage).
- [Hackathon resources](https://www.wemakedevs.org/hackathons/cnh/resources), [rules](https://www.wemakedevs.org/hackathons/cnh/rules), [schedule](https://www.wemakedevs.org/hackathons/cnh/schedule).
- [Plaud highlights](https://support.plaud.ai/hc/en-us/articles/63429919023385-Highlight-a-moment-while-recording-for-v4-0-x-or-later): marking recorded moments already exists. Simon Says emphasizes shared session capture with private, illustrated selections; uniqueness is not established.
