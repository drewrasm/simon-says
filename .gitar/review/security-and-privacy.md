# Secrets, privacy, and access

Source of truth: `AGENTS.md`, `docs/contracts.md`.

- Provider keys are server-only. Flag any `NEXT_PUBLIC_` variable holding a secret and any secret passed as a Client Component prop. The repository is public: flag committed tokens, keys, or credentials (only `.env.example` placeholders are allowed).
- Never log or export captured content: transcript text, frame content, search query text, private notes, model prompts, tokens, or signed URLs. Telemetry uses allowlisted fields only (operation, outcome, duration, source lag, retry count, opaque correlation IDs).
- Query text must not appear in URLs.
- Private bookmarks, notes, recaps, and identity-linked search queries never enter Elasticsearch or the shared caption channel.
- `/healthz` and `/readyz` must not expose configuration or credentials.
