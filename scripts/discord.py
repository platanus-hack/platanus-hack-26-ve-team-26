#!/usr/bin/env python3
"""Posts a message to the team's private Discord channel, tagging teammates.

    scripts/discord.py pastor cesar < mensaje.txt        # tags both, message from stdin
    scripts/discord.py pastor -m "Ya está el ONNX en main"
    scripts/discord.py --dry-run pastor < mensaje.txt     # prints what would be sent

Config lives outside the repo (the webhook URL is a secret, and the repo is public):
- ~/.config/tridi/discord-webhook   the channel's webhook URL (Server Settings > Integrations > Webhooks)
- ~/.config/tridi/discord-ids       one "name=discord_user_id" per line, e.g. "pastor=123456789012345678"
Only the people named on the command line are pinged, never @everyone.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

CONFIG = Path.home() / ".config" / "tridi"

# Discord rejects messages over 2000 characters; long to-do lists are split at line breaks.
LIMIT = 2000


def load_ids() -> dict[str, str]:
    path = CONFIG / "discord-ids"
    if not path.exists():
        sys.exit(f"discord: missing {path}, with one 'name=user_id' per line")
    ids = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            name, uid = line.split("=", 1)
            ids[name.strip().lower()] = uid.strip()
    return ids


def chunks(text: str) -> list[str]:
    parts, current = [], ""
    for line in text.splitlines(keepends=True):
        while len(line) > LIMIT:  # a single huge line: hard split
            parts.append(line[:LIMIT])
            line = line[LIMIT:]
        if len(current) + len(line) > LIMIT:
            parts.append(current)
            current = ""
        current += line
    if current.strip():
        parts.append(current)
    return parts


def post(webhook: str, content: str, user_ids: list[str]) -> None:
    body = json.dumps({
        "content": content,
        "username": "Tridi · Juan",
        # Ping exactly the tagged people: no @everyone or roles even if the text contains them.
        "allowed_mentions": {"parse": [], "users": user_ids},
    }).encode()
    req = urllib.request.Request(webhook, body, {"Content-Type": "application/json", "User-Agent": "tridi-discord"})
    with urllib.request.urlopen(req, timeout=15) as res:
        if res.status >= 300:
            sys.exit(f"discord: HTTP {res.status}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("people", nargs="*", help="names in discord-ids to tag (e.g. pastor cesar ale)")
    p.add_argument("-m", "--message", help="the message; without it, read from stdin")
    p.add_argument("--dry-run", action="store_true", help="print instead of sending")
    args = p.parse_args()

    text = args.message if args.message is not None else sys.stdin.read()
    if not text.strip():
        sys.exit("discord: empty message")
    ids = load_ids() if args.people else {}
    missing = [n for n in args.people if n.lower() not in ids]
    if missing:
        sys.exit(f"discord: no id for {', '.join(missing)} in {CONFIG / 'discord-ids'}")
    user_ids = [ids[n.lower()] for n in args.people]
    tags = " ".join(f"<@{uid}>" for uid in user_ids)
    parts = chunks(f"{tags}\n{text}" if tags else text)

    if args.dry_run:
        for i, part in enumerate(parts, 1):
            print(f"--- message {i}/{len(parts)} ({len(part)} chars) ---\n{part}")
        return
    webhook_file = CONFIG / "discord-webhook"
    if not webhook_file.exists():
        sys.exit(f"discord: missing {webhook_file} with the channel's webhook URL")
    webhook = webhook_file.read_text().strip()
    for part in parts:
        post(webhook, part, user_ids)
    print(f"discord: sent {len(parts)} message(s), tagging {', '.join(args.people) or 'nobody'}")


if __name__ == "__main__":
    main()
