"""Pass 2: 3D pose of the subject with MediaPipe Pose Landmarker on a crop around their box."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from .models import mediapipe_path
from .track import Subject, Tracking

# The crop is a square 1.4x the longer side of the box: MediaPipe's detector expects the whole
# body with some margin, and a square avoids squashing the person when it resizes to 256x256.
CROP_SCALE = 1.4

# COCO keypoint (YOLO) -> MediaPipe landmark, for the body joints both models share
# (shoulders, elbows, wrists, hips, knees, ankles). The face is left out: it is small and noisy.
COCO_TO_MP = {5: 11, 6: 12, 7: 13, 8: 14, 9: 15, 10: 16, 11: 23, 12: 24, 13: 25, 14: 26, 15: 27, 16: 28}

# A YOLO keypoint counts for the comparison only above this confidence (Ultralytics draws from 0.5).
KPT_CONF = 0.5

# MediaPipe and YOLO must agree on where the subject's joints are: mean distance under 15% of the
# box height (about 25 cm on an adult). Above it MediaPipe latched onto another person in the
# crop, or got the pose badly wrong, and the frame is dropped instead of polluting the clip.
MAX_DISAGREEMENT = 0.15

# Frames where MediaPipe's own mean visibility of those body joints is under 0.5 are mostly
# occluded or out of frame; their 3D is a guess.
MIN_VISIBILITY = 0.5

# A camera's focal length is unknown for uploaded videos. 65 degrees across the long side of the image
# is the typical 1x phone camera (portrait or landscape); it only sets the scale of the camera-based
# trajectory, and telephoto shots (stock footage) come out with too little travel.
HFOV_DEG = 65.0

# Window for the facing check: a real turn around takes well over a second, a misread lasts a few frames.
FLIP_WINDOW_S = 1.0

# The hips' trajectory is rebuilt from foot contacts, which jitters a few centimeters per frame.
# A centered moving average over 0.2 s removes that without lagging the motion (a step lasts ~0.5 s).
SMOOTH_S = 0.2

# MediaPipe foot points per side: ankle, heel, toe.
FEET = ((27, 29, 31), (28, 30, 32))


@dataclass
class Lifted:
    frame_index: np.ndarray  # [F] source frame of each clip frame
    joints: np.ndarray  # [F, 33, 4] x, y, z (m, y up, z toward the camera, origin hips of frame 0), visibility
    joints2d: np.ndarray  # [F, 33, 3] x, y in source pixels, visibility
    boxes: np.ndarray  # [F, 4] subject box, xyxy pixels
    valid: np.ndarray  # [F] bool: subject detected and MediaPipe agrees with the tracker
    rejected: dict[str, int]  # why frames were dropped, for the log


def _square_crop(frame: np.ndarray, box: np.ndarray) -> tuple[np.ndarray, float, float, float]:
    """Crop a square around the box, padding with black outside the frame. Returns crop, x0, y0, side."""
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    side = max(box[2] - box[0], box[3] - box[1]) * CROP_SCALE
    x0, y0 = int(round(cx - side / 2)), int(round(cy - side / 2))
    s = int(round(side))
    h, w = frame.shape[:2]
    crop = np.zeros((s, s, 3), dtype=frame.dtype)
    sx0, sy0, sx1, sy1 = max(x0, 0), max(y0, 0), min(x0 + s, w), min(y0 + s, h)
    if sx1 > sx0 and sy1 > sy0:
        crop[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = frame[sy0:sy1, sx0:sx1]
    return crop, x0, y0, s


def _mirror(coco: int) -> int:
    """Same joint on the other side (COCO body joints alternate left, right from 5 to 16)."""
    return coco + 1 if coco % 2 else coco - 1


def _facing_flips(world: np.ndarray, valid: np.ndarray, fps: float) -> np.ndarray:
    """Frames whose body faces the opposite way of the frames around them.

    MediaPipe sometimes reads a person seen from behind as facing the camera for a few frames,
    which swaps their limbs. Nobody turns around in a fraction of a second, so a frame facing
    against the median of its neighbours (within FLIP_WINDOW_S) is such a misread.
    """
    across = (world[:, 11] - world[:, 12]) + (world[:, 23] - world[:, 24])
    up = (world[:, 11] + world[:, 12]) / 2 - (world[:, 23] + world[:, 24]) / 2
    facing = np.cross(up, across)
    facing[:, 1] = 0  # only the heading on the ground matters
    facing /= np.linalg.norm(facing, axis=1, keepdims=True) + 1e-9
    half = max(1, int(round(FLIP_WINDOW_S * fps / 2)))
    flips = np.zeros(len(world), dtype=bool)
    for k in np.flatnonzero(valid):
        near = np.flatnonzero(valid[max(0, k - half) : k + half + 1]) + max(0, k - half)
        ref = np.median(facing[near], axis=0)
        flips[k] = facing[k] @ ref < 0
    return flips


def _fit_translation(world: np.ndarray, px: np.ndarray, w: np.ndarray, f: float, c: np.ndarray) -> np.ndarray | None:
    """Camera-space translation t so that the hip-centered 3D pose, moved by t, projects onto the 2D joints.

    MediaPipe world landmarks have no global position (their origin is the hips of every frame).
    With a pinhole camera, u = f (X + tx) / (Z + tz) + cx is linear in t after multiplying out,
    so t comes from a weighted least squares over the visible joints.
    """
    du, dv = px[:, 0] - c[0], px[:, 1] - c[1]
    n = len(world)
    a = np.zeros((2 * n, 3))
    b = np.zeros(2 * n)
    a[:n, 0], a[:n, 2], b[:n] = f, -du, du * world[:, 2] - f * world[:, 0]
    a[n:, 1], a[n:, 2], b[n:] = f, -dv, dv * world[:, 2] - f * world[:, 1]
    sw = np.sqrt(np.concatenate([w, w]))
    t, *_ = np.linalg.lstsq(a * sw[:, None], b * sw, rcond=None)
    return t if t[2] > 0 else None  # the person must be in front of the camera


def _mirror(coco: int) -> int:
    """Same joint on the other side (COCO body joints alternate left, right from 5 to 16)."""
    return coco + 1 if coco % 2 else coco - 1


def _facing_flips(world: np.ndarray, valid: np.ndarray, fps: float) -> np.ndarray:
    """Frames whose body faces the opposite way of the frames around them.

    MediaPipe sometimes reads a person seen from behind as facing the camera for a few frames,
    which swaps their limbs. Nobody turns around in a fraction of a second, so a frame facing
    against the median of its neighbours (within FLIP_WINDOW_S) is such a misread.
    """
    across = (world[:, 11] - world[:, 12]) + (world[:, 23] - world[:, 24])
    up = (world[:, 11] + world[:, 12]) / 2 - (world[:, 23] + world[:, 24]) / 2
    facing = np.cross(up, across)
    facing[:, 1] = 0  # only the heading on the ground matters
    facing /= np.linalg.norm(facing, axis=1, keepdims=True) + 1e-9
    half = max(1, int(round(FLIP_WINDOW_S * fps / 2)))
    flips = np.zeros(len(world), dtype=bool)
    for k in np.flatnonzero(valid):
        near = np.flatnonzero(valid[max(0, k - half) : k + half + 1]) + max(0, k - half)
        ref = np.median(facing[near], axis=0)
        flips[k] = facing[k] @ ref < 0
    return flips


def _root_from_feet(rel: np.ndarray) -> np.ndarray:
    """Hips trajectory [F, 3] from foot contacts, starting at (0, 0, 0).

    MediaPipe world landmarks are centered on the hips every frame, so they hold the pose but not
    where the body goes. Most videos come from a camera that pans to follow the person, so the image
    cannot tell either. The feet can: the lower foot is planted on the ground, so whatever it moves
    relative to the hips is the body moving the other way. Integrating that gives the walk forward
    and keeps the stance foot at a fixed height (the ground). Flight phases of a run come out flat.
    """
    # Contact point of each side: its lowest point (heel at strike, toe at push-off). [F, 2 sides, 3]
    sides = np.stack([rel[:, list(idx)] for idx in FEET], axis=1)
    contact = np.take_along_axis(sides, sides[:, :, :, 1].argmin(axis=2)[:, :, None, None], axis=2)[:, :, 0]
    stance = contact[:, :, 1].argmin(axis=1)  # the lower foot carries the weight
    root = np.zeros((len(rel), 3))
    for k in range(1, len(rel)):
        s = stance[k]  # the same foot in both frames, so a change of stance foot does not jump
        step = contact[k, s] - contact[k - 1, s]
        root[k, [0, 2]] = root[k - 1, [0, 2]] - step[[0, 2]]
    root[:, 1] = contact[0, stance[0], 1] - contact[np.arange(len(rel)), stance, 1]
    return root


def _smooth(x: np.ndarray, window: int) -> np.ndarray:
    if window < 2:
        return x
    pad = window // 2
    padded = np.pad(x, ((pad, window - 1 - pad), (0, 0)), mode="edge")
    kernel = np.ones(window) / window
    return np.stack([np.convolve(padded[:, j], kernel, mode="valid") for j in range(x.shape[1])], axis=1)


def _fill_gaps(x: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Linear interpolation over invalid frames (edges hold the nearest valid frame)."""
    idx = np.flatnonzero(valid)
    flat = x.reshape(len(x), -1)
    out = np.empty_like(flat)
    for j in range(flat.shape[1]):
        out[:, j] = np.interp(np.arange(len(x)), idx, flat[idx, j])
    return out.reshape(x.shape)


def lift_subject(video: Path, tr: Tracking, subject: Subject, progress: Callable[[str, int, int], None]) -> Lifted:
    frames = sorted(subject.boxes)
    first, last = frames[0], frames[-1]
    n = last - first + 1

    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(mediapipe_path())),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
    )
    world = np.zeros((n, 33, 3))
    joints2d = np.zeros((n, 33, 3))
    boxes = np.zeros((n, 4))
    valid = np.zeros(n, dtype=bool)
    body = list(COCO_TO_MP.values())
    f = max(tr.width, tr.height) / (2 * np.tan(np.radians(HFOV_DEG) / 2))
    c = np.array([tr.width / 2, tr.height / 2])
    cam = np.zeros((n, 3))
    rejected = {"no_box": 0, "no_pose": 0, "other_person": 0, "occluded": 0, "no_fit": 0}

    cap = cv2.VideoCapture(str(video))
    # Skip to the first frame by decoding: seeking by index is not frame-exact on every codec.
    for _ in range(first):
        cap.grab()
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        last_box = None
        for k in range(n):
            ok, frame = cap.read()
            if not ok:
                break
            i = first + k
            box = subject.boxes.get(i)
            progress("3d", k + 1, n)
            if box is None:
                # Subject not tracked here (occluded or stitched gap): keep the last box for the overlay.
                boxes[k] = last_box if last_box is not None else 0
                rejected["no_box"] += 1
                continue
            boxes[k] = last_box = box
            crop, x0, y0, side = _square_crop(frame, box)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
            # VIDEO mode needs strictly increasing timestamps in ms; the source frame time gives them.
            res = landmarker.detect_for_video(image, int(round(i * 1000 / tr.fps)))
            if not res.pose_world_landmarks:
                rejected["no_pose"] += 1
                continue
            lm = res.pose_landmarks[0]
            wl = res.pose_world_landmarks[0]
            vis = np.array([p.visibility for p in lm])
            px = np.array([[x0 + p.x * side, y0 + p.y * side] for p in lm])
            joints2d[k] = np.column_stack([px, vis])
            world[k] = [[p.x, p.y, p.z] for p in wl]

            # Same person as the tracker? Compare the shared body joints.
            kp = subject.kpts[i]
            pairs = [(ci, mi) for ci, mi in COCO_TO_MP.items() if kp[ci, 2] >= KPT_CONF]
            box_h = box[3] - box[1]
            if len(pairs) >= 4:
                # Seen from behind, one model may swap left and right while the other does not: it is
                # still the same person, so the mirrored match counts too. Flips are handled below.
                same = np.mean([np.linalg.norm(kp[ci, :2] - px[mi]) for ci, mi in pairs])
                mirrored = np.mean([np.linalg.norm(kp[ci, :2] - px[COCO_TO_MP[_mirror(ci)]]) for ci, _ in pairs])
                d = min(same, mirrored) / box_h
                if d > MAX_DISAGREEMENT:
                    rejected["other_person"] += 1
                    continue
            if vis[body].mean() < MIN_VISIBILITY:
                rejected["occluded"] += 1
                continue
            t = _fit_translation(world[k][body], px[body], vis[body], f, c)
            if t is None:
                rejected["no_fit"] += 1
                continue
            cam[k] = t
            valid[k] = True
    cap.release()

    flipped = valid & _facing_flips(world, valid, tr.fps)
    valid &= ~flipped
    rejected["flipped"] = int(flipped.sum())

    if valid.sum() < 2:
        raise RuntimeError(f"la pose 3D del sujeto salió en {int(valid.sum())} cuadros y hacen falta al menos 2: que se vea el cuerpo entero")

    # Trim to the first and last good frame: the clip starts when the subject is really there.
    lo, hi = np.flatnonzero(valid)[[0, -1]]
    sl = slice(lo, hi + 1)
    world, cam, joints2d, boxes, valid = world[sl], cam[sl], joints2d[sl], boxes[sl], valid[sl]
    # Camera space (x right, y down, z away) -> contract space (x right, y up, z toward the camera):
    # a 180 degree turn about x, which keeps the axes right-handed.
    body_rel = _fill_gaps(world, valid) * np.array([1, -1, -1])
    window = max(1, int(round(SMOOTH_S * tr.fps)))
    feet = _root_from_feet(body_rel)
    camera = (_fill_gaps(cam, valid) - cam[0]) * np.array([1, -1, -1])
    # Each estimate fails by seeing too little motion: the camera one when the camera pans to follow
    # the person, the feet one along the depth axis (MediaPipe barely sees feet move toward the camera).
    # So on each ground axis we keep the one that travelled further. Height always comes from the feet.
    root = feet.copy()
    for axis in (0, 2):
        if np.ptp(camera[:, axis]) > np.ptp(feet[:, axis]):
            root[:, axis] = camera[:, axis]
    root = _smooth(root, window)
    pos = body_rel + root[:, None, :]
    # Smoothing moves the first frame a little; the contract's origin is exactly its hips' center.
    pos -= (pos[0, 23] + pos[0, 24]) / 2

    vis = joints2d[:, :, 2].copy()
    vis[~valid] = 0  # interpolated frames are flagged with zero visibility
    joints = np.concatenate([pos, vis[:, :, None]], axis=2)
    return Lifted(np.arange(first + lo, first + hi + 1), joints, joints2d, boxes, valid, rejected)
