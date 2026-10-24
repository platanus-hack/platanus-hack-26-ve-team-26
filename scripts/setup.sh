#!/usr/bin/env bash
# One-time setup for each teammate, run from the repo root after cloning: scripts/setup.sh
# Checks gh, turns on the local guard for main and the git options the workflow relies on.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if ! command -v gh >/dev/null 2>&1; then
  echo "setup: gh is missing. Install it (macOS: brew install gh) and run this again."
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "setup: gh is not logged in. Run 'gh auth login' (GitHub.com, SSH, browser) and run this again."
  exit 1
fi

git config core.hooksPath .githooks   # pre-push hook: no direct pushes to main
git config pull.rebase true           # pulls rebase instead of creating merge commits
git config rerere.enabled true        # git remembers how a conflict was solved
chmod +x scripts/*.sh .githooks/*

if [ "$(git symbolic-ref --short HEAD)" = main ]; then
  echo "setup: done. Now create your branch: git switch -c <name>/<topic>  (e.g. pastor/fisica)"
else
  echo "setup: done. You are on '$(git symbolic-ref --short HEAD)'."
fi
