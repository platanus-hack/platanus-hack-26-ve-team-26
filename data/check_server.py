"""End-to-end check of data/server.py with real models, the way the web uses it.

    uv run --project data python -m data.check_server <video.mp4> [<video2.mp4> ...]

Uploads a .zip of the given videos plus a broken one in small chunks (one sent twice, as a retry
would), follows the job until it ends, picks another person when there is one, and checks every
error path the web can hit, that only PoseClips are kept, the 30 s limit and cancelling.
Exits 1 on the first failure.
"""

from __future__ import annotations

import io
import os
import sys
import tempfile
import time
import zipfile
from pathlib import Path

os.environ.setdefault("TRIDI_DATA_DIR", tempfile.mkdtemp(prefix="tridi-server-"))

from fastapi.testclient import TestClient  # noqa: E402

from . import server  # noqa: E402

server.CHUNK_SIZE = 1024 * 1024  # several chunks even for a short test video


def expect(cond: bool, msg: str) -> None:
    if not cond:
        print(f"FAIL: {msg}", file=sys.stderr)
        sys.exit(1)
    print(f"ok: {msg}")


def wait(client: TestClient, job_id: str, timeout: float = 600) -> dict:
    start, last = time.time(), None
    while time.time() - start < timeout:
        job = client.get(f"/jobs/{job_id}").json()
        line = " | ".join(f"{v['name']} {v['stage']} {v['progress']:.0%}" for v in job["videos"])
        if line != last:
            print(f"   {job['state']}: {line}", file=sys.stderr)
            last = line
        if job["state"] in ("done", "failed"):
            return job
        time.sleep(0.5)
    expect(False, "the job ends within the timeout")


def upload(client: TestClient, name: str, data: bytes) -> str:
    r = client.post("/uploads", json={"filename": name, "size": len(data)})
    expect(r.status_code == 201, f"POST /uploads {name} -> 201")
    up = r.json()
    size = up["chunk_size"]
    order = list(range(up["total_chunks"]))
    order.insert(1, 0)  # chunk 0 again, like a retry after a timeout
    codes = [
        client.put(f"/uploads/{up['upload_id']}/chunks/{i}", content=data[i * size : (i + 1) * size]).status_code
        for i in order
    ]
    expect(all(c == 200 for c in codes), f"PUT {len(order)} chunks (one repeated) -> 200")
    expect(client.get(f"/uploads/{up['upload_id']}").json()["received"] == list(range(up["total_chunks"])),
           "every chunk received once")
    r = client.post(f"/uploads/{up['upload_id']}/complete")
    expect(r.status_code == 202, "complete -> 202 with a job")
    return r.json()["job_id"]


def main() -> None:
    videos = [Path(p) for p in sys.argv[1:]]
    if not videos:
        sys.exit(__doc__)
    client = TestClient(server.app)
    expect(client.get("/health").json()["ok"], "health")

    # Errors the web shows to the user.
    expect(client.post("/uploads", json={"filename": "notas.txt", "size": 10}).status_code == 415, "rejects .txt")
    expect(client.post("/uploads", json={"filename": "a.mp4", "size": server.MAX_UPLOAD + 1}).status_code == 413,
           "rejects files over the limit")
    up = client.post("/uploads", json={"filename": "a.mp4", "size": 10}).json()
    expect(client.put(f"/uploads/{up['upload_id']}/chunks/0", content=b"123").status_code == 400, "rejects a short chunk")
    expect(client.put(f"/uploads/{up['upload_id']}/chunks/5", content=b"1").status_code == 416, "rejects a chunk index out of range")
    expect(client.post(f"/uploads/{up['upload_id']}/complete").status_code == 409, "complete with missing chunks -> 409")
    expect(client.get("/jobs/../../etc").status_code == 404, "ids are validated")
    expect(client.get("/clips/..%2Fserver.json").status_code == 404, "clip ids are validated")
    r = client.get("/jobs/0123456789abcdef0123456789abcdef")
    expect(r.status_code == 404 and "no existe" in r.json()["detail"], "unknown job -> 404 in Spanish")

    # A .zip with the real videos and a broken one.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for v in videos:
            zf.write(v, f"carpeta/{v.name}")
        zf.writestr("roto.mp4", videos[0].read_bytes()[:50_000])
        zf.writestr("notas.txt", "hola")
    job_id = upload(client, "lote.zip", buf.getvalue())
    job = wait(client, job_id)
    names = [v["name"] for v in job["videos"]]
    expect(names == [v.name for v in videos] + ["roto.mp4"], f"one entry per video, .txt skipped: {names}")
    broken = job["videos"][-1]
    expect(broken["stage"] == "failed" and broken["error"], f"broken video fails alone: {broken['error']}")
    good = job["videos"][: len(videos)]
    expect(all(v["stage"] == "done" for v in good), "the real videos finish")
    expect(job["state"] == "done", "the job is done when at least one video worked")

    for n, v in enumerate(good):
        clip = client.get(f"/clips/{v['clip_id']}.json").json()
        expect(clip["source"] == "upload" and clip["source_file"] == v["name"] and len(clip["frames"][0]["joints"]) == 33,
               f"{v['name']}: PoseClip {clip['id']}, valid {v['valid_ratio']:.0%}, {len(v['people'])} people in frame 0")
        r = client.get(f"/jobs/{job_id}/videos/{n}/first-frame.jpg")
        expect(r.status_code == 200 and r.content[:2] == b"\xff\xd8", "first frame is a JPEG")

    # Pick someone else in the first video that has more than one person.
    for n, v in enumerate(good):
        others = [p for p in v["people"] if not p["selected"]]
        if not others:
            continue
        x0, y0, x1, y1 = others[0]["box"]
        expect(client.post(f"/jobs/{job_id}/videos/{n}/subject", json={"x": 1, "y": 1}).status_code == 422,
               "a click on nobody -> 422")
        start = time.time()
        r = client.post(f"/jobs/{job_id}/videos/{n}/subject", json={"x": (x0 + x1) / 2, "y": (y0 + y1) / 2})
        expect(r.status_code == 202, f"choose track #{others[0]['track_id']} -> 202")
        v2 = wait(client, job_id)["videos"][n]
        chosen = [p for p in v2["people"] if p["selected"]]
        expect(v2["stage"] == "done" and chosen[0]["track_id"] == others[0]["track_id"],
               f"re-processed with the clicked person in {time.time() - start:.0f} s (no tracking again)")
        clip = client.get(f"/clips/{v2['clip_id']}.json").json()
        expect(clip["subject"]["selected_by"] == "user", "the new clip says selected_by: user")
        break

    # Only PoseClips are kept: the broken video is gone at once, a done one stays until it expires.
    job_dir = server.DATA_DIR / "jobs" / job_id
    expect(not (job_dir / f"{len(videos)}.mp4").exists(), "the failed video was deleted at once")
    expect((job_dir / "0.mp4").exists(), "a done video stays for the 10-minute subject window")
    server.sweep(time.time() + server.KEEP_VIDEO_S + 1)
    expect(not any(job_dir.glob("*.mp4")), "after 10 minutes every video is deleted")
    expect(client.get(f"/clips/{good[0]['clip_id']}.json").status_code == 200, "the clips stay")
    r = client.post(f"/jobs/{job_id}/videos/0/subject", json={"x": 1, "y": 1})
    expect(r.status_code == 410, f"choosing a person after that -> 410: {r.json()['detail']}")

    # Over 30 s (here, a 1 s limit) fails with a reason and leaves nothing behind.
    server.MAX_DURATION_S = 1
    short_job = upload(client, videos[0].name, videos[0].read_bytes())
    v = wait(client, short_job)["videos"][0]
    expect(v["stage"] == "failed" and "máximo" in v["error"], f"too long -> failed: {v['error']}")
    expect(not any((server.DATA_DIR / "jobs" / short_job).glob("*.mp4")), "and its video is deleted")
    server.MAX_DURATION_S = 30

    # Cancelling.
    up = client.post("/uploads", json={"filename": "a.mp4", "size": 10}).json()
    client.put(f"/uploads/{up['upload_id']}/chunks/0", content=b"0123456789")
    expect(client.delete(f"/uploads/{up['upload_id']}").status_code == 204, "DELETE /uploads -> 204")
    expect(not (server.DATA_DIR / "uploads" / up["upload_id"]).exists(), "and its chunks are deleted")
    cancel_job = upload(client, videos[0].name, videos[0].read_bytes())
    expect(client.delete(f"/jobs/{cancel_job}").status_code == 204, "DELETE /jobs -> 204")
    expect(client.get(f"/jobs/{cancel_job}").status_code == 404, "the cancelled job is gone")
    time.sleep(1)
    expect(not any((server.DATA_DIR / "jobs" / cancel_job).glob("*.mp4")), "and its video is deleted")

    print("server check passed", file=sys.stderr)


if __name__ == "__main__":
    main()
