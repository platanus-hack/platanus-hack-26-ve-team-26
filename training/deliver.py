"""The delivery of a clip: what the customer takes away, in one folder, for a panel and downloads.

    uv run --project training python -m training.deliver <policy.json> --clip <PoseClip.json> --out <dir>
        [--motion <RobotMotion.json>] [--scene <scene.json>] [--dataset <dataset.zip>] [--title "Caminar"]
        [--checkpoints <dir with the exported <prefix>-step-<N>.json>] [--since <UTC ISO>]

Copies the final policy (.onnx + .json), the dataset (made here with training.rollout unless one
is given), the RobotMotion, the PoseClip and the scene of the video, then writes replay.json (every
episode at 25 Hz, to watch it without the dataset) and delivery.json (a summary per world and per
episode, the checkpoint ladder and the files with their sizes). Every path in delivery.json is
relative to it, so the folder works as static files or from data/server.py. Format: docs/contrato.md,
"La entrega de un clip".

replay.json timing: dataset row k of an episode is at t = (k + 1) / hz (the state after the policy's
first decision is row 0). The replay keeps every `every`-th row (k = every * i) and, if the episode's
last row fell between two kept ones, appends it: that row is where the episode ended, so the pelvis
error that cut it and the end time stay visible. So with the 50 Hz dataset, replay row i is at
(2i + 1) / 50 s, and the last row of every episode is at the episode's `seconds` (the appended one
can be 20 ms after the row before it instead of 40 ms).
"""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from .rollout import EPISODES, rollout
from .worlds import PARAMS, ROOT, WORLD_ORDER, load_world

MOTIONS = ROOT / "physics" / "motions"
SCENES = ROOT / "data" / "scenes"

# Half the 50 Hz of the rollouts: smooth enough to watch a robot walk or fall, and half the file.
REPLAY_HZ = 25

# Decimals in replay.json. 0.1 mm for the pelvis and 1e-4 of the unit quaternion (~0.01 deg),
# 0.001 rad (0.06 deg) for the joints: far below what shows on screen. 0.1 N and 1 mm / 0.001 rad
# for the series: far below what a chart shows. Rounding is most of what keeps the file small.
POSE_DECIMALS = 4
JOINT_DECIMALS = 3
FORCE_DECIMALS = 1
ERROR_DECIMALS = 3

CHECKPOINT = re.compile(r"-step-\d+$")


def rounded(x: np.ndarray, decimals: int) -> list:
    return (np.round(x.astype(np.float64), decimals) + 0.0).tolist()  # + 0.0 turns -0.0 into 0.0


def read_dataset(path: Path) -> tuple[dict, dict[str, np.ndarray]]:
    with zipfile.ZipFile(path) as zf:
        meta = json.loads(zf.read("meta.json"))
        npz = np.load(io.BytesIO(zf.read("rollouts.npz")))
        return meta, {k: npz[k] for k in npz.files}


def checkpoints(folder: Path | None, policy: dict, since: str | None = None) -> list[dict]:
    """The ladder: every exported checkpoint of this clip that says how much of it it follows."""
    found = []
    for path in folder.glob("*-step-*.json") if folder else []:
        meta = json.loads(path.read_text())
        # The folder may hold other clips' policies (the server keeps them all in one place), and
        # nothing past the policy being delivered belongs to its ladder.
        same_clip = meta.get("motion") == policy["motion"] and meta.get("steps", 0) <= policy["steps"]
        # Nor do the leftovers of an earlier training of the same clip (another budget or another
        # TRIDI_TRAIN_EVERY leaves other step numbers): exported before this training started.
        # Both are UTC ISO strings with the same format (export.py), so they compare as text.
        current = since is None or meta.get("created_at", "") >= since
        if CHECKPOINT.search(path.stem) and same_clip and current and "followed_s" in meta:
            found.append({"steps": meta["steps"], "followed_s": meta["followed_s"]})
    return sorted(found, key=lambda c: c["steps"])


def scene_what(scene: Path | None, clip: dict) -> str:
    """What the scene.json row of the downloads says: honest when the scene holds no objects."""
    objects = json.loads(scene.read_text()).get("objects", []) if scene else []
    if objects:
        return f"El lugar del video: {len(objects)} {'objeto' if len(objects) == 1 else 'objetos'} sobre el piso, con su tamaño y posición"
    if clip.get("source") == "camera":
        return "El lugar: vacío, porque el servidor no recibe el video de la cámara"
    return "El lugar del video: en el primer cuadro no se ubicó ningún objeto sobre el piso"


def default_title(clip: dict) -> str:
    """What the panel says when nobody named the clip: the video's file name, or where it came from."""
    if clip.get("source_file"):
        return Path(clip["source_file"]).stem
    return "Clip de la cámara" if clip.get("source") == "camera" else clip["id"]


def deliver(policy_json: Path, clip_path: Path, out: Path, motion: Path | None = None, scene: Path | None = None,
            dataset: Path | None = None, title: str | None = None, checkpoints_dir: Path | None = None,
            since: str | None = None) -> Path:
    policy = json.loads(policy_json.read_text())
    clip = json.loads(clip_path.read_text())
    clip_id = clip["id"]
    if policy.get("task") != "mimic" or policy.get("motion") != clip_id:
        raise SystemExit(f"{policy_json} does not imitate {clip_id} (task {policy.get('task')}, motion {policy.get('motion')})")
    motion = motion or MOTIONS / f"{clip_id}.json"
    if not motion.exists():
        raise SystemExit(f"no RobotMotion for {clip_id}: pass --motion")
    motion_meta = json.loads(motion.read_text())
    if motion_meta["clip_id"] != clip_id:
        raise SystemExit(f"{motion} is the motion of {motion_meta['clip_id']}, not {clip_id}")
    scene = scene or (SCENES / f"{clip_id}.json" if (SCENES / f"{clip_id}.json").exists() else None)

    if dataset is not None:  # checked before touching the folder: a wrong one must not overwrite a good delivery
        with zipfile.ZipFile(dataset) as zf:
            made = json.loads(zf.read("meta.json"))
        # Same clip is not enough: another policy's numbers would be shown as this one's.
        if made["clip_id"] != clip_id or made["policy_id"] != policy["id"]:
            raise SystemExit(f"{dataset} is of {made['clip_id']} with {made['policy_id']}, not {clip_id} with {policy['id']}")

    out.mkdir(parents=True, exist_ok=True)
    # delivery.json means "the rest is ready", and the copies below are not atomic: it goes first
    # on a re-run. So does a scene.json this delivery no longer has, or it would still be served.
    (out / "delivery.json").unlink(missing_ok=True)
    if not scene:
        (out / "scene.json").unlink(missing_ok=True)
    if dataset is None:
        dataset = rollout(policy_json, str(motion), WORLD_ORDER, EPISODES, out / "dataset.zip")
    copies = {"policy.onnx": policy_json.with_suffix(".onnx"), "policy.json": policy_json, "dataset.zip": dataset,
              "motion.json": motion, "poseclip.json": clip_path, **({"scene.json": scene} if scene else {})}
    for name, src in copies.items():
        if src.resolve() != (out / name).resolve():
            shutil.copyfile(src, out / name)

    meta, arrays = read_dataset(out / "dataset.zip")  # checked above, or made just now from this policy
    # Rows kept for the replay: 2 at the 50 Hz of the rollouts. At least 1, for a dataset slower than 25 Hz.
    every = max(1, meta["hz"] // REPLAY_HZ)
    replay_hz = meta["hz"] / every  # the real rate when meta["hz"] is not a multiple of 25
    episodes, replay = [], []
    for i, ep in enumerate(meta["episodes"]):
        rows = np.flatnonzero(arrays["episode"] == i)
        vertical = arrays["foot_force"][rows, :, 2]  # N, the floor pushing up on each foot
        episodes.append({
            **ep,
            "pose_error": round(float(arrays["pose_error"][rows].mean()), ERROR_DECIMALS),
            "pelvis_error": round(float(arrays["pelvis_error"][rows].max()), ERROR_DECIMALS),
            "foot_force_peak": round(float(vertical.max()), FORCE_DECIMALS),
        })
        # Every `every`-th row, plus the last one if it fell in between: it is where the episode
        # ended (the timing of each row is in the module docstring and the contract).
        shown = rows[::every]
        if shown[-1] != rows[-1]:
            shown = np.append(shown, rows[-1])
        qpos = arrays["qpos"][shown]
        replay.append({
            "qpos": [p + j for p, j in zip(rounded(qpos[:, :7], POSE_DECIMALS), rounded(qpos[:, 7:], JOINT_DECIMALS))],
            # A heel strike lasts one or two 20 ms rows: sampling one row of `every` would drop the
            # peak the episode card shows. Each replay row carries the peak of the dataset rows it
            # stands for (from its own up to the next shown one).
            "foot_force": rounded(np.maximum.reduceat(vertical, shown - rows[0], axis=0), FORCE_DECIMALS),
            "pose_error": rounded(arrays["pose_error"][shown], ERROR_DECIMALS),
            "pelvis_error": rounded(arrays["pelvis_error"][shown], ERROR_DECIMALS),
        })
    hz = int(replay_hz) if replay_hz.is_integer() else round(replay_hz, 3)  # 25, not 25.0, in the JSON
    (out / "replay.json").write_text(json.dumps({"hz": hz, "episodes": replay}, separators=(",", ":")))

    worlds = []
    for world_id in dict.fromkeys(ep["world"] for ep in episodes):  # in the order of the rollout
        world = load_world(world_id)
        seconds = [ep["seconds"] for ep in episodes if ep["world"] == world_id]
        worlds.append({
            "id": world_id, "title": world["title"], "episodes": len(seconds),
            "completed": sum(not ep["fell"] for ep in episodes if ep["world"] == world_id),
            "seconds": {"mean": round(float(np.mean(seconds)), 2), "min": min(seconds), "max": max(seconds)},
            "params": {k: world[k] for k in PARAMS},
        })

    what = {
        "policy.onnx": f"La política: {policy['obs_dim']} números de entrada, {policy['nu']} objetivos de motor",
        "policy.json": "Qué es la política: el clip que imita, los pasos de entrenamiento y cuánto del clip sigue",
        "dataset.zip": f"Datos para entrenar robots: {len(episodes)} episodios en {len(worlds)} mundos, "
                       f"a {meta['hz']} Hz (meta.json + rollouts.npz)",
        "motion.json": "El movimiento de la persona pasado al robot (RobotMotion): lo que imita",
        "poseclip.json": "El esqueleto 3D de la persona, cuadro a cuadro (PoseClip)",
        "scene.json": scene_what(scene, clip),
    }
    delivery = {
        "clip_id": clip_id,
        "title": title or default_title(clip),
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "duration_s": round((len(motion_meta["qpos"]) - 1) / motion_meta["fps"], 2),
        "policy": {
            "id": policy["id"], "task": policy["task"], "steps": policy["steps"], "followed_s": policy.get("followed_s"),
            "trained_worlds": policy.get("worlds", []), "onnx": "policy.onnx", "json": "policy.json",
        },
        "checkpoints": checkpoints(checkpoints_dir, policy, since),
        "worlds": worlds,
        "episodes": episodes,
        "replay": "replay.json",
        "files": [{"name": n, "bytes": (out / n).stat().st_size, "what": what[n]} for n in copies],
    }
    # Written last and whole: a delivery.json on disk means the rest of the folder is ready.
    tmp = out / "delivery.json.tmp"
    tmp.write_text(json.dumps(delivery, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(out / "delivery.json")
    total = sum((out / n).stat().st_size for n in [*copies, "replay.json", "delivery.json"])
    print(f"{out}: {len(episodes)} episodes in {len(worlds)} worlds, {total // 1024} KB "
          f"(replay.json {(out / 'replay.json').stat().st_size // 1024} KB)")
    return out / "delivery.json"


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.deliver", description=__doc__.split("\n")[0])
    p.add_argument("policy", type=Path, help="the final policy .json (its .onnx next to it)")
    p.add_argument("--clip", type=Path, required=True, help="the PoseClip .json the policy imitates")
    p.add_argument("--out", type=Path, required=True, help="the delivery folder")
    p.add_argument("--motion", type=Path, help="RobotMotion .json (default: physics/motions/<clip_id>.json)")
    p.add_argument("--scene", type=Path, help="scene .json of the video (default: data/scenes/<clip_id>.json, if there)")
    p.add_argument("--dataset", type=Path, help="an existing dataset .zip (default: run training.rollout)")
    p.add_argument("--title", help="what the panel says (default: the video's file name)")
    p.add_argument("--checkpoints", type=Path, help="folder with the exported checkpoints, for the ladder")
    p.add_argument("--since", help="UTC ISO time the training started: older checkpoints are left out of the ladder")
    args = p.parse_args()
    deliver(args.policy, args.clip, args.out, args.motion, args.scene, args.dataset, args.title, args.checkpoints,
            args.since)


if __name__ == "__main__":
    main()
