"""Checks data/scene.py's geometry without a video: a known camera, a person and two chairs.

    uv run --project data python -m data.check_scene

A camera 1.5 m above a level floor films a person 4 m away walking 1 m to the right. A chair stands
2 m behind them and 1.5 m to the left; another one stands half a meter from where they walked. Their boxes are
projected into the image the way YOLO would draw them, and build_scene must find the first chair
where it is, with its size, and push the second off the path.
"""

from __future__ import annotations

import sys

import numpy as np

from .lift import Lifted
from .scene import PATH_CLEARANCE_M, _clearance, build_scene

W, H = 1280, 720
F = W / (2 * np.tan(np.radians(65) / 2))  # the field of view data/lift.py assumes
CAM_HEIGHT = 1.5
FPS = 30


def project(p: np.ndarray) -> np.ndarray:
    return np.array([F * p[0] / p[2] + W / 2, F * p[1] / p[2] + H / 2])


def chair_box(x: float, z: float, width=0.5, depth=0.5, height=0.9) -> np.ndarray:
    """Camera space (y down, floor at y = CAM_HEIGHT) -> the image box of a chair centered at (x, z)."""
    corners = np.array([[x + sx * width / 2, CAM_HEIGHT - sy * height, z + sz * depth / 2]
                        for sx in (-1, 1) for sy in (0, 1) for sz in (-1, 1)])
    uv = np.array([project(c) for c in corners])
    return np.concatenate([uv.min(axis=0), uv.max(axis=0)])


def person(n: int) -> Lifted:
    """A person 4 m away walking 1 m to the right over n frames, in camera space and in clip space."""
    cam = np.zeros((n, 33, 3))
    for k in range(n):
        x = k / (n - 1)  # 1 m to the right
        hips_y = CAM_HEIGHT - 0.9
        cam[k, :] = [x, hips_y, 4.0]
        cam[k, [11, 12], 1] = CAM_HEIGHT - 1.4  # shoulders
        cam[k, 27:33, 1] = CAM_HEIGHT  # feet on the floor
        cam[k, [23, 11, 27, 29, 31], 2] -= 0.1  # left side nearer the camera
        cam[k, [24, 12, 28, 30, 32], 2] += 0.1
    hips0 = cam[0, [23, 24]].mean(axis=0)
    joints = np.concatenate([(cam - hips0) * [1, -1, -1], np.ones((n, 33, 1))], axis=2)
    return Lifted(np.arange(n), joints, np.zeros((n, 33, 3)), np.zeros((n, 4)), np.ones(n, bool), {}, cam, F)


def main() -> int:
    fail = []
    lifted = person(FPS)
    detections = [("chair", 0.9, chair_box(-1.5, 6.0)), ("chair", 0.8, chair_box(0.5, 4.5)), ("cup", 0.9, chair_box(2, 5))]
    scene = build_scene(detections, lifted, FPS, (W, H), "clip_check")
    objs = scene["objects"]
    if len(objs) != 2:
        fail.append(f"2 chairs and no cup expected, got {[o['label'] for o in objs]}")
    else:
        far, near = objs
        # Scene axes: x = PoseClip z (toward the camera), y = PoseClip x. The chair is 2 m further
        # from the camera than the hips and 1.5 m to their left: (-2, -1.5).
        err = np.linalg.norm(np.array(far["pos"]) - [-2.0, -1.5])
        if err > 0.15:
            fail.append(f"chair at {far['pos']}, expected [-2.0, -1.5] (off by {err:.2f} m)")
        # Off to the side, the box's far edge comes from a back corner, so the width reads ~0.1 m wide.
        if abs(far["size"][1] - 0.5) > 0.15 or abs(far["size"][2] - 0.9) > 0.1:
            fail.append(f"chair size {far['size']}, expected 0.5 wide and 0.9 high")
        if abs(far["yaw"]) > 0.05:
            fail.append(f"walking along the image, the chair's yaw should be 0, got {far['yaw']}")
        hips = lifted.joints[:, [23, 24], :3].mean(axis=1)
        path = np.column_stack([hips[:, 2], hips[:, 0]])
        gap = _clearance(np.array(near["pos"]), np.array(near["size"][:2]) / 2, near["yaw"], path)
        if gap < PATH_CLEARANCE_M - 0.05:
            fail.append(f"the chair on the path stayed {gap:.2f} m from it, at {near['pos']}")
        print(f"chair at {far['pos']} size {far['size']}; the one on the path moved to {near['pos']}")
    if scene["floor"]["friction_hint"] is not None:
        fail.append("no kitchen or bathroom objects: friction_hint must be null")
    if "1.50 m de altura" not in scene["why"]:
        fail.append(f"the camera height must come out 1.50 m: {scene['why'][:160]}")
    if fail:
        print("check failed:\n- " + "\n- ".join(fail))
        return 1
    print("check ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
