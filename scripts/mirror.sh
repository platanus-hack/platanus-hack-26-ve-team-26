#!/usr/bin/env bash
# Copies origin/main to the deploy mirror. Vercel and Render cannot connect to this organization
# repo, so they deploy from a mirror in a personal account (docs/decisiones/2026-10-23-deploy.md).
# scripts/ship.sh runs it after every merge; run it by hand to resync after someone shipped
# without access to the mirror.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

MIRROR=git@github.com:Torpass/tridi.git

git fetch --quiet origin main
# The mirror is an exact copy of main and nobody commits there, so overwriting is safe.
# ALLOW_MAIN_PUSH lets this push through .githooks/pre-push, which guards this repo's main.
if ALLOW_MAIN_PUSH=1 git push --quiet "$MIRROR" +origin/main:refs/heads/main; then
  echo "mirror: $MIRROR now matches main; Vercel deploys it in about a minute."
else
  echo "mirror: could not push to $MIRROR. Main is fine, but the deploy stays behind."
  echo "mirror: accept your invitation to Torpass/tridi on GitHub, or ask Pastor to run scripts/mirror.sh."
  exit 1
fi
