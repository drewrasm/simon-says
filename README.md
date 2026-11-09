# Simon Says

One conference session feed. Personal, illustrated takeaways.

The host captures the speaker's microphone and screen once. Attendees join by QR code, read live captions, and save moments. Each attendee gets a private recap with source passages and aligned screenshots.

**Status:** planning only. No application, dependencies, or runnable commands exist yet.

## Start here

- [Product](docs/product.md): experience, MVP, and limits.
- [Architecture](docs/architecture.md): monorepo ownership, data flow, and invariants.
- [Contracts](docs/contracts.md): records, APIs, and event semantics.
- [Implementation plan](docs/implementation-plan.md): ordered milestones and acceptance checks.
- [Building tracks](docs/building-tracks.md): three-builder ownership, handoffs, and first working slices.
- [Decisions](docs/decisions.md): confirmed choices, proposals, and open questions.
- [Agent instructions](AGENTS.md): how to work in this repository.

The planned stack is **Next.js and shadcn/ui on Vercel**. This monorepo will contain one full-stack application, shared packages, database migrations, infrastructure configuration, and tests. The first implementation milestone establishes reproducible setup and documents the actual commands here.
