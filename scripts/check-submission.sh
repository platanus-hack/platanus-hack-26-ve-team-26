#!/usr/bin/env bash
# Checks the organizers' submission files before anything reaches main.
# Platanus validates every commit on main and marks it "Submission Invalid"
# if these files still hold their template placeholders.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

errors=()
for key in project-name project-oneliner-spanish project-description-spanish deploy-url; do
  value=$(grep -E "^[[:space:]]*\"$key\"[[:space:]]*:" platanus-hack-project.jsonc | sed -E 's/^[^:]*:[[:space:]]*"(.*)",?[[:space:]]*$/\1/' || true)
  if [ -z "$value" ] || [ "$value" = "<FILL THIS>" ]; then
    errors+=("platanus-hack-project.jsonc: $key must be filled")
  fi
done
if ! grep -qE '"deploy-url"[[:space:]]*:[[:space:]]*"https?://' platanus-hack-project.jsonc; then
  errors+=("platanus-hack-project.jsonc: deploy-url must be a valid URL")
fi
if grep -q "Put your project description in markdown here" project-description.md; then
  errors+=("project-description.md still has the default placeholder content")
fi

if [ ${#errors[@]} -gt 0 ]; then
  printf 'submission: %s\n' "${errors[@]}"
  exit 1
fi
