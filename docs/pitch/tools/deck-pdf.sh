#!/usr/bin/env bash
# Renders the deck to PDF with headless Chrome (puppeteer's copy; install it once with
# `npx -y puppeteer browsers install chrome`). Usage: docs/pitch/tools/deck-pdf.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
python3 docs/pitch/tools/build-deck.py
chrome=$(ls -d "$HOME"/.cache/puppeteer/chrome/*/chrome-mac*/*.app/Contents/MacOS/* 2>/dev/null | head -1)
[ -n "$chrome" ] || { echo "deck-pdf: no headless Chrome. Run: npx -y puppeteer browsers install chrome"; exit 1; }
"$chrome" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf="$PWD/docs/pitch/deck/tridi-deck.pdf" "file://$PWD/docs/pitch/deck/tridi-deck.html" 2>/dev/null
echo "deck-pdf: docs/pitch/deck/tridi-deck.pdf"
