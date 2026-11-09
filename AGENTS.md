# Agent instructions

## Read before changing code

1. Read [README.md](README.md) and [architecture](docs/architecture.md).
2. Find out which builder track the person is on (1 UI, 2 capture and transcription, 3 private highlights and recaps); ask if they have not said. Follow the [delivery plan](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzA4LWQ4YWUtNDE2NS1hNzg0LTI4MmQ4YWVmNDNkZCI=): take that track's next open story in [Shortcut](#track-work-in-shortcut), check its blockers, and stay inside the track's paths. [Building tracks](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzlmLWMzMDMtNGUwYy1hOTBhLWM4MzJjZGU3ZDQwNSI=) details each track.
3. Read [contracts](docs/contracts.md) before changing a data boundary. Check [decisions](docs/decisions.md) for unresolved assumptions.

The milestone 0 foundation is implemented. Do not claim setup, integrations, or tests work before running them. Planning does not authorize implementation or publication.

## Track work in Shortcut

The [simon-says Shortcut workspace](https://app.shortcut.com/simon-says) is the source of truth for planned work, status, blockers, and evidence. The delivery plan, building tracks, implementation plan, and hackathon integration docs live there as Shortcut Docs, not in this repository.

- Start from a story in your track's epic. If none fits, create one there; add sub-tasks or child stories when the work needs more detail.
- Move the story to In Progress when work begins and to In Review when its PR opens. Put `sc-<id>` in the branch name and PR description so Shortcut links them.
- Record verification evidence, blockers, and known limits on the story, not in repository docs. Update the Shortcut Docs when a plan, checkpoint, or ownership changes.
- Create and update stories for your own task without asking. Ask before deleting stories or docs, or changing another person's story.

## Work rules

- Follow the [hackathon integration scope](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzc1LTA2YmQtNDllNS04NjZhLTg0NmY2NTczYzk5NyI=) and [Kubernetes deployment plan](docs/deployment.md). Radar is the deployment operations tool; Vercel hosting is superseded. Keep pending integrations distinct from verified work.
- Use the project MCP servers for Radar, Dash0, Elastic, and Shortcut. Pass the team cluster id from the [team environment](docs/deployment.md#team-environment) on every Radar call, and never target `cnh` or another team's cluster. Ask before any write to a cluster, telemetry backend, or search project.
- Keep dependencies inside the documented monorepo boundaries. Use strict TypeScript and explicit package imports; do not introduce re-export-only barrel files.
- Use shadcn/ui components and semantic HTML. Preserve keyboard access, focus, and readable live captions.
- Validate at external boundaries. Keep timeline and selection logic independent of UI and provider SDKs.
- Keep provider keys server-only; never expose them through `NEXT_PUBLIC_` variables or Client Component props. Never log captured content, private notes, or model prompts.
- Never commit to `main`. Work on a feature branch and open a pull request so CI and Gitar review it before merge; see [decisions](docs/decisions.md).
- Preserve unrelated work. Commit or publish only within the user's authorization.
- Run the relevant checks and verify the real user flow. Do not skip failing tests or substitute fixtures for an undisclosed live demo.

## Keep documentation current

Whenever a decision or change becomes canonical, update the affected documentation in the same change. This includes product scope, architecture, contracts, and tooling in this repository, and plans, checkpoints, and ownership in the Shortcut Docs. Replace superseded guidance and distinguish confirmed decisions from proposals. A change is not complete while its documentation is stale.

Update contracts with behavior changes and decisions with changed assumptions in this repository. Record milestone status and verification evidence on the Shortcut story. Add real setup and verification commands to the README when tooling exists. Keep this file short; link technical detail instead of duplicating it.
