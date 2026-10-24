"""Checks data/relay.py (the phone as the live camera) the way the two browsers use it.

    uv run --project data python -m data.check_relay

Runs without the video models: it mounts the relay's router on a bare app. A fake phone posts
batches and a fake Mac long-polls them, on one event loop like uvicorn, so the wait-and-wake of
the long poll is tested for real. Exits 1 on the first failure.
"""

from __future__ import annotations

import asyncio
import sys
import time

import httpx
from fastapi import FastAPI

from . import relay

app = FastAPI()
app.include_router(relay.router)


def expect(cond: bool, msg: str) -> None:
    if not cond:
        print(f"FAIL: {msg}", file=sys.stderr)
        sys.exit(1)
    print(f"ok: {msg}")


def frame(t: float, body: bool = True) -> dict:
    if not body:
        return {"t": t}
    return {"t": t, "world": [[0.1 * i, -0.5, 0.0] for i in range(33)], "image": [[0.5, 0.5, 0.9]] * 33}


def batch(t0: float, n: int = 3) -> dict:
    return {"width": 1280, "height": 720, "frames": [frame(t0 + k / 30) for k in range(n)]}


async def main() -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://relay") as c:
        r = await c.post("/live")
        expect(r.status_code == 201 and relay.SESSION_ID.match(r.json()["session_id"]), f"POST /live -> 201 {r.json()}")
        sid = r.json()["session_id"]
        live = f"/live/{sid}/poses"

        # Errors each side can hit.
        expect((await c.get("/live/nope1234/poses")).status_code == 404, "unknown session -> 404")
        expect((await c.get("/live/../poses")).status_code == 404, "ids are validated")
        expect((await c.post(live, content=b"{")).status_code == 400, "a body that is not JSON -> 400")
        for bad, why in [
            ({"frames": [frame(0)]}, "missing width/height"),
            ({"width": 1, "height": 1, "frames": []}, "no frames"),
            ({"width": 1, "height": 1, "frames": [{"t": "x"}]}, "t not a number"),
            ({"width": 1, "height": 1, "frames": [{"t": 0, "world": [[0, 0, 0]] * 32, "image": [[0, 0, 0]] * 33}]}, "32 points"),
            ({"width": 1, "height": 1, "frames": [{"t": 0, "world": [[0, 0]] * 33, "image": [[0, 0, 0]] * 33}]}, "a 2-number point"),
            ({"width": 1, "height": 1, "frames": [{"t": 0, "world": [[0, 0, 0]] * 33}]}, "world without image"),
        ]:
            r = await c.post(live, json=bad)
            expect(r.status_code == 400, f"{why} -> 400: {r.json()['detail']}")
        for jpeg, why in [(123, "a jpeg that is not a string"), ("<script>", "a jpeg that is not base64"),
                          ("A" * (relay.MAX_JPEG_CHARS + 4), "a jpeg over the cap")]:
            r = await c.post(live, json={"width": 1, "height": 1, "frames": [{"t": 0, "jpeg": jpeg}]})
            expect(r.status_code == 400, f"{why} -> 400")
        big = {"width": 1, "height": 1, "frames": [frame(k / 30) for k in range(250)]}
        expect((await c.post(live, json=big)).status_code == 413, "a batch over 256 KB -> 413")

        # Nothing yet: a plain GET answers at once, a GET with wait holds for that long.
        r = await c.get(live, params={"since": 0})
        expect(r.json() == {"next": 0, "frames": [], "width": None, "height": None, "sent_s": None}, "empty session, empty answer")
        t = time.perf_counter()
        r = await c.get(live, params={"since": 0, "wait": 300})
        held = time.perf_counter() - t
        expect(r.json()["frames"] == [] and 0.25 < held < 1.0, f"wait=300 with no frames held {held * 1000:.0f} ms")

        # The phone posts, the Mac reads with since.
        r = await c.post(live, json=batch(10.0))
        expect(r.json()["received"] == 3 and r.json()["next"] == 3 and r.json()["watched_s"] is not None,
               f"POST 3 frames -> {r.json()}")
        r = await c.get(live, params={"since": 0})
        got = r.json()
        expect(got["next"] == 3 and [f["t"] for f in got["frames"]] == [10.0, 10 + 1 / 30, 10 + 2 / 30], "GET since=0 -> the 3 frames")
        expect(got["width"] == 1280 and got["height"] == 720 and got["sent_s"] is not None, "with the phone's image size")
        expect(set(got["frames"][0]) == {"t", "world", "image"}, "frames carry only the contract's keys")
        r = await c.post(live, json={"width": 1280, "height": 720, "frames": [frame(10.1, body=False), frame(10.13)]})
        r = await c.get(live, params={"since": 3})
        expect(r.json()["next"] == 5 and r.json()["frames"][0] == {"t": 10.1}, "a frame without body stays a bare t")
        # The camera image rides in its frame, with or without a body; the next test starts at 7.
        with_image = [{**frame(10.16), "jpeg": "/9j/4AAQ"}, {"t": 10.2, "jpeg": "/9j/4AAR"}]
        await c.post(live, json={"width": 1280, "height": 720, "frames": with_image})
        r = await c.get(live, params={"since": 5})
        expect(r.json()["frames"] == with_image, "frames keep their jpeg, with or without a body")

        # Long poll: the GET waits and answers as soon as the phone posts.
        async def post_later():
            await asyncio.sleep(0.2)
            await c.post(live, json=batch(11.0))

        task = asyncio.create_task(post_later())
        t = time.perf_counter()
        r = await c.get(live, params={"since": 7, "wait": 2000})
        woke = time.perf_counter() - t
        await task
        expect(len(r.json()["frames"]) == 3 and 0.15 < woke < 0.6, f"long poll woke on the POST after {woke * 1000:.0f} ms")
        expect(r.json()["next"] == 10, "and next moved on")

        # Only the last KEEP_FRAMES stay; an old since starts at the oldest kept.
        for k in range(60):
            b = batch(20 + k / 10)
            for f in b["frames"]:
                f["jpeg"] = "/9j/4AAQ"
            await c.post(live, json=b)
        r = await c.get(live, params={"since": 0})
        got = r.json()
        expect(len(got["frames"]) == relay.KEEP_FRAMES and got["next"] == 10 + 180, f"after 180 more frames, {relay.KEEP_FRAMES} are kept")
        # 190 frames in all, 150 kept: the oldest kept is overall frame 40 = new frame 30 = batch 10's first.
        expect(got["frames"][0]["t"] == 20 + 10 / 10, "the oldest kept is the 150th from the end")
        images = ["jpeg" in f for f in got["frames"]]
        expect(images == [False] * (relay.KEEP_FRAMES - relay.KEEP_IMAGE_FRAMES) + [True] * relay.KEEP_IMAGE_FRAMES,
               f"only the last {relay.KEEP_IMAGE_FRAMES} frames keep their image")

        # The wait is capped.
        t = time.perf_counter()
        await c.get(live, params={"since": got["next"], "wait": 60_000})
        expect(time.perf_counter() - t < relay.MAX_WAIT_MS / 1000 + 0.5, "wait is capped at MAX_WAIT_MS")

        # Ending: the other side's next request is 404; DELETE twice is fine.
        async def delete_later():
            await asyncio.sleep(0.2)
            await c.delete(f"/live/{sid}")

        task = asyncio.create_task(delete_later())
        t = time.perf_counter()
        r = await c.get(live, params={"since": got["next"], "wait": 2000})
        await task
        expect(r.status_code == 200 and time.perf_counter() - t < 0.6, "DELETE wakes a waiting GET")
        expect((await c.get(live)).status_code == 404, "then the session is gone for the Mac")
        expect((await c.post(live, json=batch(0))).status_code == 404, "and for the phone")
        expect((await c.delete(f"/live/{sid}")).status_code == 204, "DELETE again -> 204")

        # Expiry and the session cap.
        sid = (await c.post("/live")).json()["session_id"]
        relay.sweep(time.time() + relay.TTL_S + 1)
        expect((await c.get(f"/live/{sid}/poses")).status_code == 404, f"a session without traffic for {relay.TTL_S} s expires")
        ids = [(await c.post("/live")).json()["session_id"] for _ in range(relay.MAX_SESSIONS)]
        r = await c.post("/live")
        expect(r.status_code == 503 and len(set(ids)) == relay.MAX_SESSIONS, f"session {relay.MAX_SESSIONS + 1} -> 503")
        for sid in ids:
            await c.delete(f"/live/{sid}")
        expect(not relay.sessions, "all closed")

    print("relay check passed", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
