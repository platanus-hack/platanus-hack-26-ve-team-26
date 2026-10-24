#!/usr/bin/env bash
# Ships the current branch to main: rebase, push, open a PR, squash-merge it,
# then reset the branch to the new main so work continues on the same branch.
# Usage: scripts/ship.sh ["feat(area): squash commit title"]
set -euo pipefail

branch=$(git symbolic-ref --short HEAD)
if [ "$branch" = main ]; then
  echo "ship: you are on main. Create your branch first: git switch -c <name>/<topic>"
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "ship: uncommitted changes. Commit them first."
  exit 1
fi

git fetch --quiet origin main
git rebase origin/main

if [ -z "$(git log --oneline origin/main..HEAD)" ]; then
  echo "ship: nothing new on '$branch' compared to main."
  exit 0
fi

# Platanus marks every commit on main that fails its submission check as invalid.
if ! "$(dirname "$0")/check-submission.sh"; then
  echo "ship: fix the submission files above before shipping to main."
  exit 1
fi

# Default title: the oldest commit on the branch, which usually names the feature.
title=${1:-$(git log --reverse --format=%s origin/main..HEAD | head -n 1)}

git push --force-with-lease -u origin "$branch"
# Only an open PR counts: the branch name is reused after every ship, so older merged PRs share it.
pr=$(gh pr list --head "$branch" --state open --json number -q '.[0].number')
if [ -z "$pr" ]; then
  url=$(gh pr create --base main --head "$branch" --title "$title" --body "$(git log --reverse --format='- %s' origin/main..HEAD)")
  pr=${url##*/}
fi
gh pr merge "$pr" --squash --subject "$title"
if [ "$(gh pr view "$pr" --json state -q .state)" != MERGED ]; then
  echo "ship: PR #$pr did not merge. Your branch is untouched; fix it and run ship.sh again."
  exit 1
fi
git push --quiet origin --delete "$branch" 2>/dev/null || true

# The squash commit holds everything this branch had, so the branch can safely become main again.
git fetch --quiet origin main
git reset --quiet --hard origin/main
git branch --quiet --unset-upstream 2>/dev/null || true
echo "ship: '$title' is on main. '$branch' now matches main; keep working here."
