# Agent instructions

## Read before changing code

1. Read [README.md](README.md) and [architecture](docs/architecture.md).
2. Pick the next unchecked milestone in the [implementation plan](docs/implementation-plan.md) within the user's requested scope.
3. Read [contracts](docs/contracts.md) before changing a data boundary. Check [decisions](docs/decisions.md) for unresolved assumptions.

The milestone 0 foundation is implemented. Do not claim setup, integrations, or tests work before running them. Planning does not authorize implementation or publication.

## Work rules

- Follow the [hackathon integration scope](docs/hackathon.md) and [Kubernetes deployment plan](docs/deployment.md). Radar is the deployment operations tool; Vercel hosting is superseded. Keep pending integrations distinct from verified work.
- Use the project MCP servers for Radar, Dash0, and Elastic. Pass the team cluster id from the [team environment](docs/deployment.md#team-environment) on every Radar call, and never target `cnh` or another team's cluster. Ask before any write to a cluster, telemetry backend, or search project.
- Keep dependencies inside the documented monorepo boundaries. Use strict TypeScript and explicit package imports; do not introduce re-export-only barrel files.
- Use shadcn/ui components and semantic HTML. Preserve keyboard access, focus, and readable live captions.
- Validate at external boundaries. Keep timeline and selection logic independent of UI and provider SDKs.
- Keep provider keys server-only; never expose them through `NEXT_PUBLIC_` variables or Client Component props. Never log captured content, private notes, or model prompts.
- Never commit to `main`. Work on a feature branch and open a pull request so CI and Gitar review it before merge; see [decisions](docs/decisions.md).
- Preserve unrelated work. Commit or publish only within the user's authorization.
- Run the relevant checks and verify the real user flow. Do not skip failing tests or substitute fixtures for an undisclosed live demo.

## Keep documentation current

Whenever a decision or change becomes canonical, update the affected documentation in the same change. This includes product scope, architecture, contracts, tooling, and ownership. Replace superseded guidance and distinguish confirmed decisions from proposals. A change is not complete while its documentation is stale.

Update contracts with behavior changes, decisions with changed assumptions, and milestone status with verification evidence. Add real setup and verification commands to the README when tooling exists. Keep this file short; link technical detail instead of duplicating it.
