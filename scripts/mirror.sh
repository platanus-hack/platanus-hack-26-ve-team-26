#!/usr/bin/env bash
# Copies origin/main to the deploy mirror. Vercel and Render cannot connect to this organization
# repo, so they deploy from a mirror in a personal account (docs/decisiones/2026-10-23-deploy.md).
# scripts/ship.sh runs it after every merge; run it by hand to resync after someone shipped
# without access to the mirror.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# SSH first, then HTTPS: whoever cloned with HTTPS often has no SSH key registered on GitHub, and
# their ships would leave the deploy behind. HTTPS authenticates with gh (already logged in for
# ship.sh), so nobody has to set up anything.
MIRRORS=(git@github.com:Torpass/tridi.git https://github.com/Torpass/tridi.git)

git fetch --quiet origin main
for mirror in "${MIRRORS[@]}"; do
  # The mirror is an exact copy of main and nobody commits there, so overwriting is safe.
  # ALLOW_MAIN_PUSH lets this push through .githooks/pre-push, which guards this repo's main.
  # GIT_SSH_COMMAND with BatchMode fails fast instead of prompting when the SSH key is missing.
  if GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh} -o BatchMode=yes" ALLOW_MAIN_PUSH=1 \
    git -c credential.helper= -c 'credential.helper=!gh auth git-credential' \
    push --quiet "$mirror" +origin/main:refs/heads/main 2>/dev/null; then
    echo "mirror: $mirror now matches main; Vercel deploys it in about a minute."
    exit 0
  fi
done
echo "mirror: could not push to Torpass/tridi by SSH or HTTPS. Main is fine, but the deploy stays behind."
echo "mirror: check 'gh auth status' and that you accepted the invitation to Torpass/tridi,"
echo "mirror: or ask someone with access to run scripts/mirror.sh."
exit 1
