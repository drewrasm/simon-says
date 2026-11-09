# Documentation consistency

Source of truth: `AGENTS.md` ("Keep documentation current").

- A change that alters a data boundary, API, tooling, or scope must update `docs/contracts.md`, `docs/architecture.md`, `docs/decisions.md`, or `README.md` in the same PR. Flag PRs that change behavior but leave these stale.
- Milestone status and verification evidence live on Shortcut stories, not in repository docs. Flag PRs that add status boards, checkpoint progress, or evidence logs to `docs/`.
- Keep confirmed decisions distinct from proposals. Do not describe pending integrations (Gitar auto-apply, Dash0, Elasticsearch, cluster deployment) as verified unless the PR includes evidence.
- Keep `AGENTS.md` short; it links to detail rather than duplicating it.
