"""End-to-end check of camera clips and the training queue of data/server.py, the way the web uses it.

    uv run --project data python -m data.check_training [<PoseClip.json>]

Sends a PoseClip as if it came from the camera (default: the preloaded walk), checks every error
path of POST /clips, trains it with a tiny budget through the real chain (retarget in Node ->
training.ppo with ONNX export per checkpoint -> training.rollout), follows GET /train until done and
downloads the motion, every policy and the dataset. Also checks that a clip is not trained twice,
that the queue fills up, and cancelling. The robot will not walk after 8k steps: this checks the
plumbing, not the learning. Exits 1 on the first failure.
"""

from __future__ import annotations

import copy
import io
import json
import os
import sys
import tempfile
import time
import zipfile
from pathlib import Path

os.environ.setdefault("TRIDI_DATA_DIR", tempfile.mkdtemp(prefix="tridi-train-"))
# Two PPO updates of 4096 steps, a checkpoint at each, and 1 dataset episode per world.
os.environ.setdefault("TRIDI_TRAIN_STEPS", "8000")
os.environ.setdefault("TRIDI_TRAIN_EVERY", "4096")
os.environ.setdefault("TRIDI_ROLLOUT_EPISODES", "1")
os.environ.setdefault("TRIDI_TRAIN_WAITING", "1")

from fastapi.testclient import TestClient  # noqa: E402

from . import server  # noqa: E402

DEFAULT_CLIP = Path(__file__).parent / "clips" / "clip_2026-10-23_caminar-perfil_01.json"


def expect(cond: bool, msg: str) -> None:
    if not cond:
        print(f"FAIL: {msg}", file=sys.stderr)
        sys.exit(1)
    print(f"ok: {msg}")


def wait(client: TestClient, train_id: str, timeout: float = 900) -> dict:
    start, last = time.time(), None
    while time.time() - start < timeout:
        t = client.get(f"/train/{train_id}").json()
        line = f"{t['state']} {t['stage']} {t['steps']}/{t['total_steps']} checkpoints {len(t['checkpoints'])} eta {t['eta_s']} s"
        if line != last:
            print(f"   {line}", file=sys.stderr)
            last = line
        if t["state"] in ("done", "failed"):
            return t
        time.sleep(1)
    expect(False, "the training ends within the timeout")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CLIP
    clip = json.loads(src.read_text())
    clip.update({"source": "camera", "source_file": None, "id": "clip_from-the-browser"})
    client = TestClient(server.app)

    # --- POST /clips validations
    expect(client.post("/clips", content=b"not json").status_code == 400, "a body that is not JSON is 400")
    broken = copy.deepcopy(clip)
    broken["frames"][3]["joints"] = broken["frames"][3]["joints"][:20]
    r = client.post("/clips", json=broken)
    expect(r.status_code == 400 and "cuadro 3" in r.json()["detail"], f"a frame with 20 joints is 400 ({r.json()['detail']})")
    expect(client.post("/clips", content=b" " * (server.MAX_CLIP_BYTES + 1)).status_code == 413, "more than 5 MB is 413")
    long = copy.deepcopy(clip)
    long["frames"][-1]["t"] = 31.0
    r = client.post("/clips", json=long)
    expect(r.status_code == 422, f"a 31 s clip is 422 ({r.json()['detail']})")
    low = copy.deepcopy(clip)
    low["quality"]["valid_ratio"] = 0.5
    r = client.post("/clips", json=low)
    expect(r.status_code == 422, f"valid_ratio 0.5 is 422 ({r.json()['detail']})")

    r = client.post("/clips", json=clip)
    expect(r.status_code == 201, "a good camera clip is 201")
    clip_id = r.json()["clip_id"]
    expect(clip_id.startswith("clip_") and "from-the-browser" not in clip_id, f"the server names it ({clip_id})")
    saved = client.get(f"/clips/{clip_id}.json").json()
    expect(saved["source"] == "camera" and saved["id"] == clip_id, "GET /clips returns it with the server's id")
    scene = client.get(f"/scenes/{clip_id}.json").json()
    expect(scene["id"] == clip_id and scene["objects"] == [], "a camera clip has an empty scene (no video on the server)")

    # --- Training queue
    expect(client.post("/clips/clip_nope/train").status_code == 404, "training a missing clip is 404")
    r = client.post(f"/clips/{clip_id}/train")
    expect(r.status_code == 202, "POST /clips/{id}/train is 202")
    train_id = r.json()["train_id"]
    expect(client.post(f"/clips/{clip_id}/train").json()["train_id"] == train_id, "the same clip returns the same train_id")

    # Two more clips: one waits (TRIDI_TRAIN_WAITING=1), the next finds the queue full; cancel the waiting one.
    other = client.post("/clips", json=clip).json()["clip_id"]
    third = client.post("/clips", json=clip).json()["clip_id"]
    time.sleep(0.5)  # the first one leaves the waiting list when the worker takes it
    waiting = client.post(f"/clips/{other}/train").json()["train_id"]
    expect(client.get(f"/train/{waiting}").json()["position"] == 0, "the waiting one is next (position 0)")
    expect(client.post(f"/clips/{third}/train").status_code == 409, "a full queue is 409")
    expect(client.delete(f"/train/{waiting}").status_code == 204, "cancelling a waiting training is 204")
    expect(client.get(f"/train/{waiting}").status_code == 404, "a cancelled training is gone")

    t = wait(client, train_id)
    expect(t["state"] == "done", f"the chain ends done ({t['error']})")
    expect(t["steps"] == t["total_steps"] and t["eta_s"] == 0, "done means every step and no wait")
    expect(len(t["checkpoints"]) >= 3, f"a checkpoint per save, exported as it happens ({len(t['checkpoints'])})")
    expect(t["followed_s"] is not None and 0 <= t["followed_s"] <= t["duration_s"], f"followed_s {t['followed_s']} of {t['duration_s']} s")

    motion = client.get(f"/motions/{clip_id}.json")
    expect(motion.status_code == 200 and len(motion.json()["qpos"][0]) == 36, "GET /motions returns the RobotMotion")
    for c in t["checkpoints"]:
        meta = client.get(f"/policies/{c['policy_id']}.json").json()
        onnx = client.get(f"/policies/{c['policy_id']}.onnx")
        expect(meta["task"] == "mimic" and meta["motion"] == clip_id and onnx.status_code == 200 and len(onnx.content) > 100_000,
               f"policy {c['policy_id']} (.json + .onnx)")
    ds = client.get(f"/datasets/{clip_id}.zip")
    expect(ds.status_code == 200, "GET /datasets returns the zip")
    with zipfile.ZipFile(io.BytesIO(ds.content)) as zf:
        meta = json.loads(zf.read("meta.json"))
        import numpy as np

        npz = np.load(io.BytesIO(zf.read("rollouts.npz")))
        expect(meta["clip_id"] == clip_id and len(meta["episodes"]) == 4, "meta.json: the clip and one episode per world")
        expect(npz["qpos"].shape[1:] == (36,) and npz["foot_force"].shape[1:] == (2, 3) and len(npz["episode"]) == len(npz["t"]),
               f"rollouts.npz with the contract's arrays ({len(npz['t'])} rows)")
    expect(client.get("/datasets/clip_nope.zip").status_code == 404, "a missing dataset is 404")
    expect(client.get("/policies/..%2F..%2Fetc.json").status_code == 404, "paths outside the folders are 404")
    print("all good")


if __name__ == "__main__":
    main()
