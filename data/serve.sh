#!/usr/bin/env bash
# Runs the video server on this Mac and publishes it with a Cloudflare quick tunnel, so the deployed
# web can reach it. The tunnel's URL changes on every start, so this writes it to a gist the web reads
# on its own (data/live/src/api.js): https://tridi-alpha.vercel.app finds the server with no ?api=.
# Ctrl+C stops both and writes null there, so the web says the server is off at once.
# Usage: data/serve.sh [port]
set -euo pipefail
cd "$(dirname "$0")/.."

port=${1:-8000}
web=${TRIDI_WEB_URL:-https://tridi-alpha.vercel.app}
# Juan's gist; its id is also SERVER_GIST in data/live/src/api.js. Only its owner can write it: anyone
# else's serve.sh still works with the ?api= link it prints.
gist=78eb7f16b9c2d8d21a9abfe6607a98da
gist_file=tridi-api.json
command -v cloudflared >/dev/null || { echo "serve: install cloudflared first: brew install cloudflared"; exit 1; }

log=$(mktemp -t tridi-tunnel)
uv run --project data python -m data.server --port "$port" &
server=$!
# A quick tunnel needs no Cloudflare account, but its URL changes on every start.
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$port" >"$log" 2>&1 &
tunnel=$!

# Writes where the server is (or null) to the gist. Never fails the script: without gh or access the
# ?api= link still works.
publish() {
  local file
  file=$(mktemp -t tridi-api).json
  printf '{"url": %s, "updated_at": "%s"}\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$file"
  command -v gh >/dev/null && gh gist edit "$gist" -f "$gist_file" "$file" >/dev/null 2>&1
  local ok=$?
  rm -f "$file"
  return $ok
}
published=0
cleanup() {
  kill $server $tunnel 2>/dev/null
  rm -f "$log"
  [ $published = 1 ] && publish null && echo "serve: the web now says the server is off"
}
trap cleanup EXIT

for _ in $(seq 60); do
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -n 1 || true)
  [ -n "$url" ] && break
  sleep 1
done
if [ -z "${url:-}" ]; then
  echo "serve: the tunnel did not start; its log:"; cat "$log"; exit 1
fi
# The web finds the server through the gist; ?api= is for when the gist cannot be written, or to
# point a page at another server.
link="$web/?api=$url"
echo
echo "serve: video server public at $url (health: $url/health)"
if publish "\"$url\""; then
  published=1
  echo "serve: published to the gist: $web finds it on its own (within ~1 min of a restart)"
  echo "       to skip that wait, or for another server: $link"
else
  command -v pbcopy >/dev/null && printf '%s' "$link" | pbcopy && copied=" (copied)" || copied=""
  echo "serve: could not write the gist (gh missing or no access): open the web with this link$copied:"
  echo "       $link"
fi
wait $server
