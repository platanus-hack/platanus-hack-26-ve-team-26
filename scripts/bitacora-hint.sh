#!/usr/bin/env bash
# Runs before every Claude Code prompt (UserPromptSubmit hook in .claude/settings.json).
# Tells the agent which log file belongs to this session, so it keeps one file per session
# and updates it after every prompt, even after the conversation is compacted.
set -u

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
session=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
[ -z "$session" ] && exit 0

file=$(grep -rl --include='*.md' "^sesion: $session\$" "$root/docs/bitacora" 2>/dev/null | head -n 1)
if [ -n "$file" ]; then
  echo "bitacora: this session's log is ${file#"$root"/}. Update it before you finish this reply if the prompt changed anything."
else
  echo "bitacora: this session (sesion: $session) has no log yet. If this prompt changes code, docs or decisions, create one from docs/bitacora/README.md before you finish this reply."
fi
exit 0
