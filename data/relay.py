"""The phone as the live camera: pose frames relayed between two browsers, in memory.

The Mac opens a session (POST /live) and shows its id in a QR; the phone posts the poses MediaPipe
finds in its camera, in small batches (POST /live/{id}/poses); the Mac long-polls them
(GET /live/{id}/poses) and feeds them to the robot as if they came from its own webcam. The API,
the frame format and the reason for every number are in docs/contrato.md ("El teléfono como
cámara"). Nothing is stored: a session keeps its last few seconds of frames and is forgotten after a
few minutes without traffic. data/server.py mounts this router; data/check_relay.py tests it alone,
without the video models.
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import secrets
import time
from dataclasses import dataclass, field

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

# 8 characters from 31 (no 0/o/1/l/i, which are misread from a QR or by hand): ~40 bits, not
# guessable in the minutes a session lives, and short enough for the QR.
ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
ID_LENGTH = 8
SESSION_ID = re.compile(f"^[{ID_ALPHABET}]{{{ID_LENGTH}}}$")

# A session nobody touches for 3 minutes is forgotten. The Mac asks every second while it shows
# the QR, so a session in use never expires; one abandoned without DELETE goes in 3 minutes.
TTL_S = 180

# Only the last 5 s of frames (at 30 fps) are kept: enough to ride out a tunnel hiccup without
# losing frames of a recording; further back the robot would be copying the past. ~250 KB.
KEEP_FRAMES = 150

# A 100 ms batch at 30 fps is ~5 KB; 64 KB is a full second of frames, and no visitor can fill the
# server's memory from the internet.
MAX_BATCH_BYTES = 64 * 1024

# The longest a GET waits for new frames. The Mac asks with 1000 ms and asks again at once; the cap
# frees the connection of a Mac that left.
MAX_WAIT_MS = 2000

# One laptop in a demo: the cap keeps a visitor from opening sessions until memory runs out.
MAX_SESSIONS = 20

JOINTS = 33


@dataclass
class Session:
    id: str
    touched: float  # last request from either side, for expiry
    sent_at: float | None = None  # the phone's last batch
    watched_at: float | None = None  # the Mac's last GET
    width: int | None = None
    height: int | None = None
    first_seq: int = 0  # the number of frames[0]; grows as old frames are dropped
    frames: list[dict] = field(default_factory=list)
    changed: asyncio.Event = field(default_factory=asyncio.Event)  # set when frames arrive or the session ends

    @property
    def next_seq(self) -> int:
        return self.first_seq + len(self.frames)


sessions: dict[str, Session] = {}
router = APIRouter()


def sweep(now: float) -> None:
    """Forgets the sessions without traffic for TTL_S. Safe to call from the server's janitor thread:
    it only drops entries; a Mac waiting on one gets its timeout and a 404 on its next request."""
    for s in list(sessions.values()):
        if now - s.touched > TTL_S:
            sessions.pop(s.id, None)


def _session(session_id: str) -> Session:
    s = sessions.get(session_id) if SESSION_ID.match(session_id) else None
    if s is None:
        raise HTTPException(404, "la sesión de la cámara no existe o ya terminó")
    return s


def _number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _points(value, what: str, i: int) -> str | None:
    if not isinstance(value, list) or len(value) != JOINTS:
        return f"el cuadro {i} debe traer {JOINTS} puntos en {what}"
    if not all(isinstance(p, list) and len(p) == 3 and all(_number(v) for v in p) for p in value):
        return f"cada punto de {what} del cuadro {i} debe ser 3 números"
    return None


def _clean_batch(batch) -> tuple[dict | None, str | None]:
    """The batch with only the contract's keys, or what is wrong with it."""
    if not isinstance(batch, dict):
        return None, "el cuerpo debe ser un lote (un objeto JSON)"
    size = [batch.get(k) for k in ("width", "height")]
    if not all(_number(v) and v > 0 for v in size):
        return None, "width y height deben ser números mayores que 0"
    frames = batch.get("frames")
    if not isinstance(frames, list) or not frames:
        return None, "frames debe tener al menos un cuadro"
    clean = []
    for i, f in enumerate(frames):
        if not isinstance(f, dict) or not _number(f.get("t")):
            return None, f"el cuadro {i} debe tener t"
        if "world" not in f and "image" not in f:
            clean.append({"t": f["t"]})  # no body in this frame
            continue
        problem = _points(f.get("world"), "world", i) or _points(f.get("image"), "image", i)
        if problem:
            return None, problem
        clean.append({"t": f["t"], "world": f["world"], "image": f["image"]})
    return {"width": int(size[0]), "height": int(size[1]), "frames": clean}, None


@router.post("/live", status_code=201)
async def create_session() -> dict:
    now = time.time()
    sweep(now)
    if len(sessions) >= MAX_SESSIONS:
        raise HTTPException(503, f"ya hay {MAX_SESSIONS} sesiones de cámara abiertas: prueba en unos minutos")
    sid = "".join(secrets.choice(ID_ALPHABET) for _ in range(ID_LENGTH))
    sessions[sid] = Session(sid, now)
    return {"session_id": sid, "ttl_s": TTL_S}


@router.post("/live/{session_id}/poses")
async def post_poses(session_id: str, request: Request) -> dict:
    s = _session(session_id)
    body = bytearray()
    async for part in request.stream():
        body += part
        if len(body) > MAX_BATCH_BYTES:
            raise HTTPException(413, f"el lote pesa más de {MAX_BATCH_BYTES // 1024} KB")
    try:
        batch = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "el cuerpo no es JSON")
    batch, problem = _clean_batch(batch)
    if problem:
        raise HTTPException(400, problem)
    now = time.time()
    s.touched = s.sent_at = now
    s.width, s.height = batch["width"], batch["height"]
    s.frames.extend(batch["frames"])
    if len(s.frames) > KEEP_FRAMES:
        drop = len(s.frames) - KEEP_FRAMES
        del s.frames[:drop]
        s.first_seq += drop
    s.changed.set()
    return {
        "received": len(batch["frames"]),
        "next": s.next_seq,
        "watched_s": None if s.watched_at is None else round(now - s.watched_at, 2),
    }


@router.get("/live/{session_id}/poses")
async def get_poses(session_id: str, since: int = 0, wait: int = 0) -> dict:
    s = _session(session_id)
    s.touched = s.watched_at = time.time()
    wait = min(max(wait, 0), MAX_WAIT_MS)
    if since >= s.next_seq and wait > 0:
        # Nothing new yet: hold the answer until the phone posts (or the session ends), or wait ends.
        # Single event loop, so no batch can slip in between the check and the wait.
        s.changed.clear()
        try:
            await asyncio.wait_for(s.changed.wait(), wait / 1000)
        except TimeoutError:
            pass
    start = max(since - s.first_seq, 0)
    return {
        "next": s.next_seq,
        "frames": s.frames[start:],
        "width": s.width,
        "height": s.height,
        "sent_s": None if s.sent_at is None else round(time.time() - s.sent_at, 2),
    }


@router.delete("/live/{session_id}", status_code=204)
async def delete_session(session_id: str) -> Response:
    if not SESSION_ID.match(session_id):
        raise HTTPException(404, "la sesión de la cámara no existe o ya terminó")
    s = sessions.pop(session_id, None)
    if s:
        s.changed.set()  # a Mac waiting on it answers now, and gets 404 on its next request
    return Response(status_code=204)
