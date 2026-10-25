#!/usr/bin/env bash
# Runs the video server on this Mac and publishes it with a Cloudflare quick tunnel, so the deployed
# web can reach it. The tunnel's URL changes on every start, so this writes it to a gist the web reads
# on its own (data/live/src/api.js): https://tridi-alpha.vercel.app finds the server with no ?api=.
# GitHub caches that gist for up to a minute, so the tunnel outlives this script: Ctrl+C stops only
# the server, and the next run reuses the same tunnel and URL, so the plain web finds it at once.
# Usage: data/serve.sh [port]        server + tunnel (the tunnel is reused if it is already up)
#        data/serve.sh stop [port]   stops the tunnel too and writes null, so the web says it is off
set -euo pipefail
cd "$(dirname "$0")/.."

stop=0
if [ "${1:-}" = stop ]; then stop=1; shift; fi
port=${1:-8000}
web=${TRIDI_WEB_URL:-https://tridi-alpha.vercel.app}
# Juan's gist; its id is also SERVER_GIST in data/live/src/api.js. Only its owner can write it: anyone
# else's serve.sh still works with the ?api= link it prints. TRIDI_GIST= (empty) skips it, for tests.
gist=${TRIDI_GIST-78eb7f16b9c2d8d21a9abfe6607a98da}
gist_file=tridi-api.json
command -v cloudflared >/dev/null || { echo "serve: install cloudflared first: brew install cloudflared"; exit 1; }

# The running tunnel, per port, so the next run can reuse it. server_data/ is not versioned.
state=data/server_data/tunnel-$port
mkdir -p data/server_data

# Writes where the server is (or null) to the gist. Never fails the script: without gh or access the
# ?api= link still works.
publish() {
  [ -n "$gist" ] || return 1
  local file
  file=$(mktemp -t tridi-api).json
  printf '{"url": %s, "updated_at": "%s"}\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$file"
  command -v gh >/dev/null && gh gist edit "$gist" -f "$gist_file" "$file" >/dev/null 2>&1
  local ok=$?
  rm -f "$file"
  return $ok
}

# The pid of this port's tunnel if it is still running, else nothing.
tunnel_pid() {
  local pid
  pid=$(cat "$state.pid" 2>/dev/null || true)
  [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q "cloudflared.*127.0.0.1:$port" && echo "$pid"
  return 0
}

if [ $stop = 1 ]; then
  pid=$(tunnel_pid)
  [ -n "$pid" ] && kill "$pid" && echo "serve: tunnel stopped"
  rm -f "$state.pid" "$state.url" "$state.log"
  publish null && echo "serve: the web now says the server is off"
  exit 0
fi

uv run --project data python -m data.server --port "$port" &
server=$!
trap 'kill $server 2>/dev/null' EXIT

pid=$(tunnel_pid)
if [ -n "$pid" ] && [ -s "$state.url" ]; then
  url=$(cat "$state.url")
  echo "serve: reusing the tunnel at $url"
else
  rm -f "$state.url"
  # Job control puts the tunnel in its own process group, so Ctrl+C here does not reach it; nohup
  # keeps it when the terminal closes. A quick tunnel needs no Cloudflare account.
  set -m
  nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$port" >"$state.log" 2>&1 &
  echo $! >"$state.pid"
  set +m
  for _ in $(seq 60); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$state.log" | head -n 1 || true)
    [ -n "$url" ] && break
    sleep 1
  done
  if [ -z "${url:-}" ]; then
    echo "serve: the tunnel did not start; its log:"; cat "$state.log"; exit 1
  fi
  echo "$url" >"$state.url"
fi

# Publish only once the server answers: a page that reads the gist before that shows it as off.
# Loading the models takes a few seconds; 60 s covers a cold first run.
for _ in $(seq 60); do
  curl -fs "http://127.0.0.1:$port/health" >/dev/null && break
  kill -0 $server 2>/dev/null || { echo "serve: the server exited before answering"; exit 1; }
  sleep 1
done
link="$web/?api=$url"
echo
echo "serve: video server public at $url (health: $url/health)"
# Written on every start (an unchanged URL costs nothing); a new tunnel takes GitHub up to ~1 min.
if publish "\"$url\""; then
  echo "serve: published to the gist: $web finds it on its own"
else
  command -v pbcopy >/dev/null && printf '%s' "$link" | pbcopy && copied=" (copied)" || copied=""
  echo "serve: could not write the gist (gh missing or no access): open the web with this link$copied:"
  echo "       $link"
fi
echo "serve: Ctrl+C stops the server and keeps the tunnel; data/serve.sh stop $port stops both"
wait $server
