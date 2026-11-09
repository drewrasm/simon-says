# Delivery plan

Status: proposed on November 9, 2026 at 12:15 MT for confirmation at checkpoint C0. This plan governs what the team builds today and in what order. The [implementation plan](implementation-plan.md) remains the milestone record and evidence log; the [building tracks](building-tracks.md) remain the ownership reference. Where they describe more than fits today, this plan's cut applies until the deadline.

## Deadline

All times are Mountain Time on Monday, November 9, 2026, from the [hackathon schedule](https://www.wemakedevs.org/hackathons/cnh/schedule).

| Time        | Event                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| 17:30       | Submission deadline: public repository with README setup steps               |
| 17:30–18:30 | Project presentations                                                        |
| 18:30–19:00 | Winners announced                                                            |
| November 13 | Clusters and Radar access end, per the Radar starter; verify with organizers |

The [rules](https://www.wemakedevs.org/hackathons/cnh/rules) require a public source repository and a README with setup instructions. Main coding and design work must begin after the event starts.

## Demo target

One host shares a microphone and a presentation window. Two attendees join by QR code and read the same live captions on the deployed URL. Each marks a different moment with **Keep that** and sees a private card with the spoken text and an aligned screenshot. One attendee searches for an earlier idea by meaning, opens the passage, and saves it. Each attendee generates a recap that cites only their own selections. Neither can read the other's notes.

The demo then shows each sponsor tool doing real work: the Radar timeline and one AI investigation, Dash0 traces for the caption path with an Agent0 or MCP diagnosis, Elasticsearch as the content store behind captions and search, and Gitar reviews on the PRs that delivered features. The judges' criteria are summarized in [hackathon integrations](hackathon.md).

## Today's cut

Build the [product](product.md) MVP at the smallest depth that is real. Confirm this list at C0; change it only by team agreement.

**In scope today**

- One session, one desktop host browser, two attendee devices, English captions.
- Live captions through one transcription stream, stored as Elasticsearch segment revisions and delivered over SSE.
- Periodic screen frames in private object storage, with observations in Elasticsearch.
- **Keep that** (the previous 30 seconds) and paragraph marks, owner-only cards with text, frame, and a note.
- Keyword plus semantic search over finalized segments, with save to a private selection.
- One recap per attendee from their selections, with cited passages and frames, exported as Markdown.
- Deployment to the team cluster through Argo CD, with Postgres on CloudNativePG.
- Content-free Dash0 traces for ingest, captions, saves, search, and recaps.

**Simplified today**

- Identity: an anonymous signed-cookie principal per device. The host uses a host link created with the session. No accounts.
- One app replica. Leases and replay cursors live in Postgres, but multi-pod failover is not demonstrated.
- Recap generation runs in a request-scoped background task with a status row, instead of the durable job in [contracts](contracts.md). If C0 confirms this, record the deviation in contracts and architecture in the same change.
- Frames are captured at a fixed interval; change detection is optional.

**Out today** (remain in the implementation plan)

Membership revocation and redaction endpoints, scheduled retention cleanup, repair transcription, slide-glossary correction, HTML export, the Playwright suite, multi-pod rollout tests, and lifecycle fault tests (milestones 4–5 depth). Access checks on every read are **not** cut.

## Checkpoints

Each checkpoint has a time, the work each track finishes by then, and a gate. A gate passes only when its proof is observed in the real system, then recorded on the [status board](#status-board). If a gate slips by more than 20 minutes, apply the [fallbacks](#fallbacks) instead of compressing later checkpoints.

### C0 — Align (12:45)

- **All:** pull `main`, finish MCP sign-in ([README](../README.md#agent-mcp-servers)), and confirm this plan's cut, owners, and [decisions](#decisions-due).
- **Track 1:** confirm Gitar reviews the first PR after its connection (PR #6 added the review instructions and CI).
- **Track 2:** rebase PR #4 (checkpoint 0A) on `main`; it currently conflicts.
- **Track 3:** publish the shared contracts below as a PR to `packages/contracts`.
- **Radar:** record the "before" view of Radar Checks for `team-simon-says`. The starter asks for it in the first hour.

Gate: three builders agree on the interfaces in [Agree before splitting](#agree-before-splitting), and the contracts PR is open.

### C1 — Skeleton deployed (13:45)

- **Track 1:** host setup, join-by-QR, and caption reader screens running against labeled fixtures that use the shared contracts.
- **Track 2:** PR #4 merged; image published to GHCR; Argo CD Application applied through Radar; Postgres `Cluster` ready; the app serves `https://simon-says.cnh.radarhq.io` with `/healthz` and `/readyz`. Create Elasticsearch `segments` and `observations` indices behind aliases, with an app API key scoped to them and stored as a cluster Secret. Choose and wire the cluster's transcription provider.
- **Track 3:** Prisma models and the first migration for principals, sessions, memberships, and bookmarks; session creation, host link, invitation, and join endpoints; an exported membership check that Tracks 1 and 2 call.

Gate: the deployed URL shows the pushed commit; a session can be created and joined on the deployed app; Radar shows the release healthy.

### C2 — Live captions end to end (15:00)

- **Track 1:** captions render from the real SSE stream with **Return to live**; capture health and stop control on the host screen.
- **Track 2:** host microphone audio reaches the transcription provider; segment revisions are written to Elasticsearch with deterministic IDs; SSE delivers them to members; host stop fences ingest. Frames reach private storage with observations in Elasticsearch. Dash0 receives content-free ingest and caption traces.
- **Track 3:** bookmark create, read, and delete for the owner; resolution of a session-clock range against Elasticsearch segments and observations, after the membership check.

Gate: on the deployed URL, a real microphone produces captions on two attendee devices, a frame shares the source clock, and stop ends capture. Dash0 shows the caption trace with no captured text in it.

### C3 — Highlights and search (16:00)

- **Track 1:** **Keep that**, paragraph marks, private cards with text, frame, note, and pending or incomplete states; search box, results, source preview, and save.
- **Track 2:** semantic field populated on finalized segments; replay and snapshot on reconnect; support Track 3 with source IDs and ranges.
- **Track 3:** search endpoint with keyword plus `semantic_text`, using the embedding endpoint chosen under [decisions due](#decisions-due), session-filtered and revalidated against Postgres; save a result as a paragraph bookmark.

Gate: two attendees mark different moments and each sees only their own aligned evidence; a meaning-based query finds an earlier passage and saves it with its timestamps intact.

### C4 — Recaps and feature freeze (16:45)

- **Track 1:** recap view with progress, failure, citations, and Markdown export.
- **Track 2:** run one Radar AI investigation on the running app and record the conclusion; confirm the release is healthy.
- **Track 3:** recap generation from the owner's resolved selections only, with validated citations; empty selections make no model call; failure leaves cards usable. Dash0 spans for save, search, and recap.

Gate: two attendees get different recaps that cite only their own selections. After 16:45, merge fixes only.

### C5 — Submit (17:15)

- **All:** rehearse the demo once on the deployed URL; update the README setup steps; record evidence and known limits in the [implementation plan](implementation-plan.md); draft the Radar story; submit before 17:30.

Gate: submission sent with the public repository URL.

### Fallbacks

Apply these in order when a gate slips; each keeps one real use of every sponsor tool.

1. Drop frames and screenshots from cards and recaps; keep text evidence.
2. Drop paragraph marks; keep **Keep that**.
3. Drop semantic search; keep keyword search over Elasticsearch segments.
4. Demo from a local build if the cluster release fails, while still showing Radar's view of the attempted release and investigation.
5. Never fake captions, search results, or recaps. Label any fixture shown in the demo.

## Agree before splitting

These interfaces block parallel work. Agree on them at C0, put the schemas in `packages/contracts`, and change them only through a PR that the affected owners approve. The [contracts](contracts.md) document defines their meaning.

| Interface                                              | Writer  | Consumers   | Location                                          |
| ------------------------------------------------------ | ------- | ----------- | ------------------------------------------------- |
| Session, membership, and principal records; migrations | Track 3 | Tracks 1, 2 | `packages/db`                                     |
| Membership check (`session`, `principal`, role)        | Track 3 | Tracks 1, 2 | `apps/web/src/server/access`                      |
| Segment and observation documents and index mappings   | Track 2 | Track 3     | `packages/contracts`; mappings created by Track 2 |
| Session event schema (SSE) and replay cursor           | Track 2 | Track 1     | `packages/contracts`                              |
| Capture module: start, stop, permissions, health       | Track 2 | Track 1     | `apps/web` capture module                         |
| Bookmark, search, and recap request/response schemas   | Track 3 | Track 1     | `packages/contracts`                              |
| Source clock and range rules                           | Track 2 | Track 3     | `packages/domain`                                 |

Store a `semantic_text` field only on finalized segment revisions to avoid embedding every interim caption. Track 2 owns the mapping; Track 3 owns the queries against it.

## Working agreement

These rules keep three builders and their agents from colliding.

### Start every session the same way

1. Pull `main`.
2. Tell your agent which track you are on. Agents read [AGENTS.md](../AGENTS.md), then this plan, then their track section in [building tracks](building-tracks.md).
3. Take your track's next open checkpoint item from this plan. Check the [status board](#status-board) for blockers first.

### Ownership by path

Edit inside your track's paths. Changing another track's paths needs that owner's agreement first.

| Track                            | Owns                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. UI and attendee experience    | `apps/web/src/app`, `apps/web/src/components`, `packages/ui`                                                                                                                                                                    |
| 2. Capture and transcription     | `apps/web/server` (custom Node entry point), `Dockerfile`, `.dockerignore`, `scripts`, `infra`, `.github/workflows`, Elasticsearch mappings, and the capture, ingest, transcription, and event modules in `apps/web/src/server` |
| 3. Private highlights and recaps | `packages/db` and migrations; the access, bookmark, search, and recap modules in `apps/web/src/server`                                                                                                                          |
| Shared (coordinate first)        | `packages/contracts`, `packages/domain`, package manifests and `tsconfig` files, `pnpm-lock.yaml`, `.env.example`, `README.md`, `docs/`                                                                                         |

`apps/web/src/server` does not exist yet; each track creates its own module directory there. Each track updates the docs its change affects. For `pnpm-lock.yaml`, never hand-merge: rebase, then run `pnpm install` to regenerate it.

### Pull requests

- One branch per checkpoint slice, named `<type>/t<track>-<description>`, for example `feat/t3-session-join`. Keep PRs small and merge them as soon as CI passes and Gitar has reviewed.
- Rebase on `main` before pushing. Do not force-push a branch another builder is using.
- Every change, including docs, lands through a PR that passes CI and Gitar review (the sole exception is [guarded machine-generated deploy-tag PRs](decisions.md#c1a-release-tags)); never commit to `main` ([decisions](decisions.md)). The Gitar track judges whether "features land through PRs it reviewed".
- Once Argo CD is applied, every merge to `main` deploys. Check Radar after each merge that changes runtime code.

### Agents

- Agents follow [AGENTS.md](../AGENTS.md) and ask before any write to the cluster, Dash0, or Elasticsearch. Agents do not post PR comments; see the [Gitar boundary](hackathon.md#gitar-enablement-boundary).
- Only Track 2 changes cluster resources, through git and Argo CD. Others ask Track 2.
- Only Track 3 writes Prisma migrations. Only Track 2 changes Elasticsearch mappings.
- Fixtures can unblock a track before its dependency lands. Label them, use the shared contracts, and remove them before the demo.

### Status and blockers

When a gate item passes, update your row on the status board in the same PR, with one line of evidence. Raise blockers in the team chat immediately and record them on the board.

## Decisions due

| Decision                                                                                                                                          | Owner          | Due  | Proposed                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cut list and owners in this plan                                                                                                                  | All            | C0   | As written                                                                                                                                                                                                                                                                        |
| Gitar enablement                                                                                                                                  | Drew           | Done | Connected by the repository owner; review instructions and CI added in PR #6; first review unverified                                                                                                                                                                             |
| Identity for today                                                                                                                                | Track 3        | C0   | Anonymous signed-cookie principal; host link                                                                                                                                                                                                                                      |
| Transcription provider reachable from the cluster: OpenAI realtime transcription or `llama serve` on a reachable host ([decisions](decisions.md)) | Track 2        | C1   | Track 2's call; the cluster cannot reach a laptop, and its budget cannot host the model                                                                                                                                                                                           |
| Private object storage for frames in the cluster: Track 3 sets requirements, Track 2 deploys                                                      | Tracks 2 and 3 | C1   | Smallest option that fits the budget (4 PVCs total; Postgres uses one)                                                                                                                                                                                                            |
| Embedding endpoint                                                                                                                                | Track 3        | Done | Decided: `.jina-embeddings-v5-text-small` via `ELASTICSEARCH_INFERENCE_ID` ([decisions](decisions.md#confirmed-by-the-track-3-owner)); availability and processing settings confirmed, per-token rate not shown ([evidence](implementation-plan.md#elastic-cloud-setup-evidence)) |
| Recap model                                                                                                                                       | Track 3        | Done | Decided: OpenAI through the AI SDK with `OPENAI_API_KEY` from Secret `app-credentials`; server-only `RECAP_MODEL`; only the owner's selected passages are sent                                                                                                                    |

## Status board

Update your own row when a gate item passes or a blocker appears.

| Track | Owner | Done                                                                                                                                                                                                                                                                                                   | Next                                                                 | Blocked on                                                                       |
| ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1     | Drew  | Design system (PR #5); Gitar review instructions and CI (PR #6); host setup (PR #14); session start, host QR page, join by link, member-only reader (PR #23); custom notes UI on Track 3 bookmarks locally: save, newest-first list, cross-attendee isolation, desktop side panel and phone notes page | C1: deployed proof; C2: captions from real SSE, capture health, stop | Short join code from Track 3; capture clock from Track 2                         |
| 2     | Dylan | 0A merged (PR #4); transcription provider decided: OpenAI realtime (PR #8); ES indices merged (PR #16)                                                                                                                                                                                                 | C1 apply Argo CD, ES indices                                         | ruleset/token bypass (Drew); cluster apply approval                              |
| 3     | Logan | C0 contracts (#11); C1 models (#12), migration Job + CI Postgres (#24), access/sessions/join (#18) merged                                                                                                                                                                                              | C2 bookmarks (PR #29); C3 search and C4 recaps in progress           | Deploy to pick up the Elastic Secret (ruleset bypass); cloud ingest/search check |
| Setup | All   | Radar cluster and MCP; Dash0 and Elastic MCP; repository public                                                                                                                                                                                                                                        | Dash0 org invites; Radar "before" Checks                             | Teammates' Radar invite acceptance unverified                                    |
