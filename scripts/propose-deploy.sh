#!/usr/bin/env bash
# Runs only in Actions after publishing; main changes only through a guarded PR merge.
set -euo pipefail
: "${GITHUB_SHA:?}" "${GITHUB_REPOSITORY:?}" "${GH_TOKEN:?}"
branch="deploy/$GITHUB_SHA"
# Branch switches can remove the guard added after the release's source commit.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$(dirname "${BASH_SOURCE[0]}")/check-deploy-diff.py" "$work/check-deploy-diff.py"
summary() {
  echo "$1"
  echo "$1" >> "$GITHUB_STEP_SUMMARY"
}
existing=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$branch" --base main --state all --json number --jq '.[0].number // empty')
if [ -n "$existing" ]; then
  state=$(gh pr view "$existing" --repo "$GITHUB_REPOSITORY" --json state --jq .state)
  if [ "$state" = MERGED ]; then
    summary "Deployed $GITHUB_SHA via #$existing (already merged)"
    exit 0
  elif [ "$state" != OPEN ]; then
    summary "Skipped $GITHUB_SHA: deploy PR #$existing is closed."
    exit 0
  fi
fi
fresh() {
  git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main || exit 1
  if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
    git fetch --unshallow origin main || exit 1
  fi
  head=$(git rev-parse origin/main) || exit 1
  source_changes=$(git diff --name-only "$GITHUB_SHA" "$head" -- . ':!infra/k8s/kustomization.yaml') || exit 1
  if [ -n "$source_changes" ]; then
    # Put the reason in the summary, without posting a PR comment.
    if [ -n "$existing" ]; then
      gh pr close "$existing" --repo "$GITHUB_REPOSITORY" || exit 1
    fi
    summary "Skipped $GITHUB_SHA: main advanced with source changes; stale deploy PR ${existing:-not created}."
    return 1
  fi
}
if ! fresh; then exit 0; fi
# Close only release branches for ancestors of this source, never a newer release.
stale_branches=$(gh pr list --repo "$GITHUB_REPOSITORY" --base main --state open \
  --limit 1000 --json number,headRefName,isCrossRepository \
  --jq '.[] | select(.isCrossRepository == false) | [.number, .headRefName] | @tsv')
while IFS=$'\t' read -r stale_number stale_branch; do
  if [[ "$stale_branch" =~ ^deploy/([0-9a-f]{40})$ ]]; then
    stale_sha=${BASH_REMATCH[1]}
    if [ "$stale_sha" != "$GITHUB_SHA" ] && git merge-base --is-ancestor "$stale_sha" "$GITHUB_SHA"; then
      gh pr close "$stale_number" --repo "$GITHUB_REPOSITORY"
      summary "Closed superseded deploy PR #$stale_number ($stale_sha); newest release is $GITHUB_SHA."
    fi
  fi
done <<< "$stale_branches"
if [ -z "$existing" ]; then
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
    r"(  - name: app\n)    newName: ghcr.io/drewrasm/simon-says\n    newTag: [^\n]+",
    lambda match: match[1] + "    newName: ghcr.io/drewrasm/simon-says\n    newTag: " + os.environ["GITHUB_SHA"],
    text,
)
if count != 1:
    raise SystemExit("Expected exactly one app image entry")
path.write_text(text)
PYTHON
    if git diff --quiet; then
      summary "Skipped $GITHUB_SHA: published tag already selected on main."
      exit 0
    fi
    git config user.name 'github-actions[bot]'
    git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
    git add infra/k8s/kustomization.yaml
    git commit -m "deploy: $GITHUB_SHA"
    git push origin "HEAD:refs/heads/$branch"
  fi
  body="$work/body"
  cat > "$body" <<EOF
Deploy published image ghcr.io/drewrasm/simon-says:$GITHUB_SHA.

Only the app newTag changes. Actions verifies the exact diff and source freshness
before merging immediately. Machine-generated single-value tag bumps are exempt
from Gitar review. AUTO_DEPLOY=false leaves the PR open for manual review.
Merging this manifest-only PR does not publish again; Argo CD syncs main.
EOF
  existing=$(gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$branch" \
    --title "deploy: $GITHUB_SHA" --body-file "$body")
  existing=$(gh pr view "$existing" --repo "$GITHUB_REPOSITORY" --json number --jq .number)
fi
if [ "${AUTO_DEPLOY:-true}" = false ]; then
  summary "Skipped automatic deploy of $GITHUB_SHA: AUTO_DEPLOY=false; PR #$existing left open."
  exit 0
fi
# Pin validation and merge to the same immutable PR head, even on a recovered branch.
pr_head=$(gh pr view "$existing" --repo "$GITHUB_REPOSITORY" --json headRefOid --jq .headRefOid)
git fetch origin "$pr_head"
if ! fresh; then exit 0; fi
base=$(git merge-base origin/main "$pr_head")
if ! python3 "$work/check-deploy-diff.py" "$base" "$pr_head" "$GITHUB_SHA"; then
  echo "::warning::Unsafe deploy PR #$existing; expected only app newTag to change."
  summary "Skipped $GITHUB_SHA: unsafe diff in PR #$existing; left open for review."
  exit 0
fi
# Repeat immediately before merging to catch source changes during validation.
if ! fresh; then exit 0; fi
if ! gh pr merge "$existing" --repo "$GITHUB_REPOSITORY" --merge --admin --match-head-commit "$pr_head"; then
  # A concurrent successful merge is a safe retry; API failure must still report the setup.
  state=$(gh pr view "$existing" --repo "$GITHUB_REPOSITORY" --json state --jq .state) || state=UNKNOWN
  if [ "$state" != MERGED ]; then
    echo "::error::Deploy PR #$existing merge refused; left open. Drew: Settings > Rules > Rulesets > main > Bypass list: grant the deployment token actor bypass (For pull requests only). Configure DEPLOY_TOKEN with a bypass-enabled PAT or GitHub App token; GITHUB_TOKEN fallback requires GitHub Actions integration bypass if available. Inspect the gh error above for other merge failures."
    summary "Failed $GITHUB_SHA: merge of PR #$existing refused; configure ruleset main bypass and DEPLOY_TOKEN. PR left open."
    exit 1
  fi
fi
summary "Deployed $GITHUB_SHA via #$existing"
