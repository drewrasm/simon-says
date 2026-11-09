#!/usr/bin/env bash
# Runs only in Actions after publishing; never pushes to main.
set -euo pipefail
: "${GITHUB_SHA:?}" "${GITHUB_REPOSITORY:?}" "${GH_TOKEN:?}"
branch="deploy/$GITHUB_SHA"
git fetch origin main
# A newer merge owns the next release. Do not propose an older image over it.
if [ "$(git rev-parse origin/main)" != "$GITHUB_SHA" ]; then
  echo "Main advanced during publication; skipping the deploy PR."
  exit 0
fi
existing=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$branch" --base main --state all --json url --jq '.[0].url // empty')
if [ -n "$existing" ]; then
  echo "Deploy PR already exists: $existing"
  state=$(gh pr view "$existing" --repo "$GITHUB_REPOSITORY" --json state --jq .state)
  if [ "$state" = OPEN ]; then
    gh workflow run check.yml --repo "$GITHUB_REPOSITORY" --ref "$branch"
  fi
  exit 0
fi
# Recover when the branch push succeeded but PR creation was blocked/failed.
if git ls-remote --exit-code --heads origin "$branch" > /dev/null; then
  git fetch origin "$branch"
  git switch -c "$branch" FETCH_HEAD
else
  git switch -c "$branch" origin/main
  python3 - <<'PYTHON'
import os
import re
from pathlib import Path

path = Path("infra/k8s/kustomization.yaml")
text = path.read_text()
text, count = re.subn(
    r"(  - name: app\n)(?:    #[^\n]*\n)*    newName: [^\n]+\n    newTag: [^\n]+",
    lambda match: match[1] + "    newName: ghcr.io/drewrasm/simon-says\n    newTag: " + os.environ["GITHUB_SHA"],
    text,
)
if count != 1:
    raise SystemExit("Expected exactly one app image entry")
path.write_text(text)
PYTHON
  if git diff --quiet; then exit 0; fi
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git add infra/k8s/kustomization.yaml
  git commit -m "deploy: $GITHUB_SHA" -m 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
  git push origin "HEAD:refs/heads/$branch"
fi
body=$(mktemp)
trap 'rm -f "$body"' EXIT
cat > "$body" <<EOF
Deploy published image ghcr.io/drewrasm/simon-says:$GITHUB_SHA.

Only the image reference changes. Check CI and obtain Gitar review before merging.
Close older unmerged deploy PRs; do not merge an older image after a newer release.
Merging this manifest-only PR does not publish again (push paths-ignore).
Once activated, Argo CD syncs this image with pruning and self-healing.
Enable auto-merge only after required CI/Gitar rules are configured; otherwise merge manually.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$branch" \
  --title "deploy: $GITHUB_SHA" --body-file "$body"
# GITHUB_TOKEN-created PRs do not fire pull_request workflows. Dispatch runs
# check/container on the branch SHA so required checks can still be satisfied.
gh workflow run check.yml --repo "$GITHUB_REPOSITORY" --ref "$branch"
