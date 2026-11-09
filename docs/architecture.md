# Architecture

Status: proposed implementation of the confirmed shared-session product. See [decisions](decisions.md) for choices requiring validation.

## Data flow

```mermaid
flowchart TD
  Host[Host: mic and screen] --> Ingest[API: authenticated ingest]
  Ingest --> STT[One transcription stream per session]
  STT --> Timeline[Timestamped transcript and frame timeline]
  Ingest --> Media[Private media storage]
  Timeline --> Feed[Shared caption feed]
  Feed --> A[Attendee A]
  Feed --> B[Attendee B]
  A --> Selections[Owner-scoped bookmarks]
  B --> Selections
  Selections --> Recap[Private recap with evidence]
  Media --> Recap
```

## Monorepo ownership

These paths are planned, not scaffolded. Use pnpm workspaces, one lockfile, and `workspace:` dependencies.

| Path | Owns |
| --- | --- |
| `apps/web` | Vite, React, host and attendee routes, capture, caption rendering |
| `apps/api` | Node service, authentication, ingest, SSE, providers, recap jobs |
| `packages/ui` | shadcn/ui components, theme, shared presentation primitives |
| `packages/contracts` | Runtime request/event schemas and derived TypeScript types |
| `packages/domain` | Pure timeline, selection, alignment, and revision rules |
| `packages/db` | Postgres schema, migrations, repositories, synthetic seeds |
| `infra` | Local services, deployment definitions, telemetry configuration |
| `tests/fixtures` | Authorized audio, screen frames, expected words and timestamps |
| `tests/e2e` | Host/attendee flows and cross-user isolation checks |

Applications depend on packages, never each other. `domain` and `contracts` have no UI, database, or provider dependencies. Only the API imports `db` or server provider SDKs. Only web imports `ui`. Keep application-specific components in web.

Start with one API process, Postgres, private object storage, and a Deepgram adapter. Persist final transcript revisions and replay events. SSE distributes captions; HTTP persists bookmarks; WebSocket carries host audio. Elasticsearch is an optional derived search index, not transactional truth. Defer a distributed event bus and separate workers until needed.

## Timeline invariants

- Use one host monotonic capture clock. Map audio sample offsets, frame capture times, and provider word offsets through an ingest epoch. Never align by upload arrival time.
- Fence ingest with a host lease and epoch. Stale hosts cannot publish after replacement; one active session has one live transcription stream.
- Estimate the live session clock on attendee devices. Record uncertainty. If sync is stale, disable live marks and allow paragraph-anchored marks.
- Replace interim text; patch final segments by stable ID and revision. Replayed events must not duplicate words or undo a newer correction.
- Replay SSE from a cursor. If history expired, supply an authorized snapshot and cursor. Do not report a silent gap as caught up.
- Resolve bookmarks within fixed requested ranges. A later transcript or image arrival cannot move the range. Partial evidence remains visibly incomplete.

## Screen and audio capture

Capture mic input separately from the selected screen. A venue needs an actual mixer/interface feed. Start with an authorized USB mic and a tested presentation laptop.

Propose one screen observation per second. Deduplicate identical images but retain observation timestamps and capture health. Include the valid frame at selection start and changed frames within the interval. Preserve both slides across a transition. Display at most three representative images initially; retain access to the rest. A stopped capture invalidates later use of an old frame.

Sampling can miss short visuals. Inspect code legibility before choosing compression and dimensions. Attaching screenshots is MVP; OCR or multimodal interpretation is optional and must cite the frame separately from spoken text.

Number audio chunks, attach time ranges/checksums, and acknowledge durable writes. Proposed host resend capacity is two minutes. Exceeding it exposes a gap. Optional repair transcription creates revised segments with repaired provenance. Track audio coverage separately from transcription accuracy.

## Access, retention, and operations

- QR invitations issue distinct attendee memberships, never host credentials. Enforce session access and resource ownership on every API, search, image URL, and event stream.
- Shared captions exclude private bookmark events. Hosts do not automatically see attendees' notes or recaps. Revocation stops further authorized delivery and image access.
- Proposed expiry: shared audio, transcript, and frames 24 hours after session end; selected evidence and recaps 30 days after selection. Confirm policy before real recording.
- Materialize selected text revisions and retain authorized selected image references before shared-source expiry. Deletion and expiry jobs must handle references and invalidate dependent recaps.
- Host redaction invalidates affected hosted selections and recaps. Personal deletion does not remove others' shared source. Downloaded exports cannot be recalled.
- Keep content out of logs, telemetry, session replay, and errors. Verify provider retention controls, including Deepgram opt-out. Never claim system-wide 30-second retention.
- Measure ingest lag, caption lag, source gaps, durable-save latency, and recap errors. Use Dash0 for diagnosis; Radar deployment and Elastic search are optional sponsor integrations.

Use authenticated object access and short-lived image links. Exports embed selected images and sanitized text, with no access tokens. Source and provider text are untrusted data.
