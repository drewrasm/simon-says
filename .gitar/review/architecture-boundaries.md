# Architecture and dependency boundaries

Source of truth: `AGENTS.md`, `docs/architecture.md`. Flag violations as bugs.

- `packages/domain` and `packages/contracts` must not import UI, database, or provider SDK code. Timeline and selection logic stays pure and independent of React and provider SDKs.
- Only server code (`apps/web/src/server`, Route Handlers) imports `@simon-says/db` or provider SDKs. Server modules import `server-only`.
- Use strict TypeScript and explicit package imports. Reject re-export-only barrel files.
- Shared UI uses shadcn/ui components and semantic HTML. Flag changes that drop keyboard access, focus handling, or readable live captions.
- Validate every external boundary (HTTP bodies, WebSocket messages, provider responses) with runtime schemas from `packages/contracts`; derive types from schemas instead of duplicating interfaces.
