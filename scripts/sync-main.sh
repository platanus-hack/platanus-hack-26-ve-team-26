#!/usr/bin/env bash
# Runs before every Claude Code prompt (UserPromptSubmit hook in .claude/settings.json).
# Rebases the current branch onto origin/main so every prompt starts on top of the team's latest work.
# Never fails the prompt: on any problem it leaves the tree untouched and tells the agent why.
set -u

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

git_dir=$(git rev-parse --git-dir)
if [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ] || [ -f "$git_dir/MERGE_HEAD" ]; then
  echo "sync-main: a rebase or merge is in progress. Finish it (git rebase --continue) before anything else."
  exit 0
fi

branch=$(git symbolic-ref --short HEAD 2>/dev/null) || exit 0

if ! git fetch --quiet origin main 2>/dev/null; then
  echo "sync-main: could not reach origin (offline?). Working on a possibly stale main."
  exit 0
fi

incoming=$(git log --oneline --no-decorate HEAD..origin/main)
[ -z "$incoming" ] && exit 0

if git rebase --autostash --quiet origin/main >/dev/null 2>&1; then
  echo "sync-main: rebased '$branch' onto origin/main. New from the team:"
  echo "$incoming"
else
  git rebase --abort >/dev/null 2>&1
  echo "sync-main: '$branch' conflicts with origin/main, nothing was changed. Incoming commits:"
  echo "$incoming"
  echo "Resolve it with 'git rebase origin/main', keeping both sides' intent; ask the owner if the conflict is in their folder."
fi
exit 0
