# Agent instructions

## Read before changing code

1. Read [README.md](README.md) and [architecture](docs/architecture.md).
2. Pick the next unchecked milestone in the [implementation plan](docs/implementation-plan.md) within the user's requested scope.
3. Read [contracts](docs/contracts.md) before changing a data boundary. Check [decisions](docs/decisions.md) for unresolved assumptions.

This repository currently contains plans only. Do not claim setup, integrations, or tests work before running them. Planning does not authorize implementation or publication.

## Work rules

- Keep dependencies inside the documented monorepo boundaries. Use strict TypeScript and explicit package imports; do not introduce re-export-only barrel files.
- Use shadcn/ui components and semantic HTML. Preserve keyboard access, focus, and readable live captions.
- Validate at external boundaries. Keep timeline and selection logic independent of UI and provider SDKs.
- Never expose provider keys through Vite client variables. Never log captured content, private notes, or model prompts.
- Preserve unrelated work. Commit or publish only within the user's authorization.
- Run the relevant checks and verify the real user flow. Do not skip failing tests or substitute fixtures for an undisclosed live demo.

## Keep documentation current

Update contracts with behavior changes, decisions with changed assumptions, and milestone status with verification evidence. Add real setup and verification commands to the README when tooling exists. Keep this file short; link technical detail instead of duplicating it.
