#!/usr/bin/env bash
# Runs the video server on this Mac and publishes it with a Cloudflare quick tunnel, so the deployed
# web can reach it. Prints the public URL to give to the web; Ctrl+C stops both.
# Usage: data/serve.sh [port]
set -euo pipefail
cd "$(dirname "$0")/.."

port=${1:-8000}
command -v cloudflared >/dev/null || { echo "serve: install cloudflared first: brew install cloudflared"; exit 1; }

log=$(mktemp -t tridi-tunnel)
uv run --project data python -m data.server --port "$port" &
server=$!
# A quick tunnel needs no Cloudflare account, but its URL changes on every start.
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$port" >"$log" 2>&1 &
tunnel=$!
trap 'kill $server $tunnel 2>/dev/null; rm -f "$log"' EXIT

for _ in $(seq 60); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -n 1 || true)
  [ -n "$url" ] && break
  sleep 1
done
if [ -z "${url:-}" ]; then
  echo "serve: the tunnel did not start; its log:"; cat "$log"; exit 1
fi
echo
echo "serve: video server public at $url (health: $url/health)"
echo "serve: give this URL to the web; it changes every time this script starts."
wait $server
