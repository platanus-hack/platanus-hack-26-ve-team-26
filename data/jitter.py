"""How much a PoseClip shakes: frame-to-frame speed and acceleration of the leg joints.

    uv run --project data python -m data.jitter data/clips/<clip>.json [more.json ...]

Per joint group (hips, knees, ankles, and the pelvis center) it prints the p50 and p95 of the
speed and of the acceleration between consecutive frames, plus valid_ratio, and three things
smoothing must keep: how much the planted foot slides, how high the feet swing, and how far the
body travels. A real step has a smooth speed curve; MediaPipe's per-frame noise shows up as large
p95 accelerations and as a vertical pelvis speed far above what a walk does (a few tenths of a m/s).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

# MediaPipe foot points per side: ankle, heel, toe.
FEET = ((27, 29, 31), (28, 30, 32))
GROUPS = {"hips": (23, 24), "knees": (25, 26), "ankles": (27, 28)}


def load(path: Path) -> tuple[np.ndarray, float, float]:
    clip = json.loads(path.read_text())
    joints = np.array([f["joints"] for f in clip["frames"]])[:, :, :3]
    return joints, float(clip["fps"]), float(clip["quality"]["valid_ratio"])


def stats(joints: np.ndarray, fps: float) -> dict[str, tuple[float, float, float, float]]:
    """Per group: speed p50, p95 (m/s) and acceleration p50, p95 (m/s²)."""
    out = {}
    series = {name: joints[:, list(idx)] for name, idx in GROUPS.items()}
    series["pelvis"] = joints[:, [23, 24]].mean(axis=1, keepdims=True)
    for name, x in series.items():
        v = np.diff(x, axis=0) * fps
        a = np.diff(v, axis=0) * fps
        sp, ac = np.linalg.norm(v, axis=-1).ravel(), np.linalg.norm(a, axis=-1).ravel()
        out[name] = (*np.percentile(sp, [50, 95]), *np.percentile(ac, [50, 95]))
    # The pelvis height alone: a walk raises and lowers it a few centimeters per step.
    vy = np.abs(np.diff(series["pelvis"][:, 0, 1]) * fps)
    out["pelvis_y"] = (*np.percentile(vy, [50, 95]), float(vy.max()), float("nan"))
    return out


def gait(joints: np.ndarray, fps: float) -> dict[str, float]:
    """What smoothing must not change: the planted foot stays put, the swing keeps its height, and
    the body covers the same ground."""
    feet = np.stack([joints[:, list(idx)] for idx in FEET], axis=1)  # [F, side, 3 points, 3]
    low = feet[..., 1].min(axis=2)  # [F, side]: lowest point of each foot
    stance = low.argmin(axis=1)
    contact = feet.mean(axis=2)[np.arange(len(joints)), stance]  # [F, 3] the planted foot
    # Same foot in consecutive frames only, so a change of stance foot is not counted as sliding.
    same = stance[1:] == stance[:-1]
    slide = np.linalg.norm(np.diff(contact[:, [0, 2]], axis=0), axis=1)[same] * fps
    pelvis = joints[:, [23, 24]].mean(axis=1)
    return {
        "stance_slide": float(np.median(slide)),  # m/s, horizontal speed of the planted foot
        "swing": float(np.mean(np.percentile(low, 95, axis=0) - np.percentile(low, 5, axis=0))),  # m
        "travel": float(np.linalg.norm(pelvis[-1, [0, 2]] - pelvis[0, [0, 2]])),  # m
    }


def main(argv: list[str]) -> int:
    for arg in argv:
        joints, fps, valid = load(Path(arg))
        print(f"{Path(arg).stem}  ({len(joints)} frames, {fps:g} fps, valid_ratio {valid:.3f})")
        print(f"  {'':9} {'speed p50':>10} {'p95':>7} {'accel p50':>10} {'p95':>7}")
        for name, (s50, s95, a50, a95) in stats(joints, fps).items():
            if name == "pelvis_y":
                print(f"  {'pelvis y':9} {s50:10.2f} {s95:7.2f}   max {a50:.2f} m/s")
            else:
                print(f"  {name:9} {s50:10.2f} {s95:7.2f} {a50:10.1f} {a95:7.1f}")
        g = gait(joints, fps)
        print(f"  planted foot slides {g['stance_slide']:.2f} m/s, swing {100 * g['swing']:.1f} cm, travel {g['travel']:.2f} m")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
