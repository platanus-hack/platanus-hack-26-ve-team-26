"""Pass 1: find every person with YOLO11-pose + ByteTrack, then pick and follow the subject."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .models import yolo_path

TRACKER_CFG = Path(__file__).parent / "bytetrack.yaml"

# A track seen in less than this share of the video is a passer-by or a false detection:
# it never wins the automatic choice unless nobody else is on screen long enough.
MIN_PRESENCE = 0.2

# Stitching: ByteTrack hands out a new id when the subject is hidden longer than its buffer.
# A new track that starts within 1 s of the subject's last box, near it (center within one box
# height) and of similar size (height ratio within 1.5x) is taken as the same person.
STITCH_MAX_GAP_S = 1.0
STITCH_MAX_DIST = 1.0
STITCH_MAX_SCALE = 1.5


@dataclass
class Track:
    id: int
    frames: list[int] = field(default_factory=list)
    boxes: list[np.ndarray] = field(default_factory=list)  # xyxy, pixels
    kpts: list[np.ndarray] = field(default_factory=list)  # [17, 3]: x, y, conf (COCO order)


@dataclass
class Tracking:
    fps: float
    width: int
    height: int
    n_frames: int
    tracks: dict[int, Track]


@dataclass
class Subject:
    track_id: int  # the id the subject was chosen by (first id of the chain)
    selected_by: str  # "auto" | "user"
    boxes: dict[int, np.ndarray]  # frame index -> xyxy
    kpts: dict[int, np.ndarray]  # frame index -> [17, 3]


def _device() -> str:
    import torch

    return "mps" if torch.backends.mps.is_available() else "cpu"


def track_people(video: Path, progress: Callable[[str, int, int], None]) -> Tracking:
    from ultralytics import YOLO

    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {video}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    model = YOLO(str(yolo_path()))
    device = _device()
    tracks: dict[int, Track] = {}
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        # classes=[0]: the pose model only knows "person"; persist keeps ByteTrack state between calls.
        result = model.track(
            frame, persist=True, tracker=str(TRACKER_CFG), classes=[0], device=device, verbose=False
        )[0]
        if result.boxes is not None and result.boxes.id is not None:
            ids = result.boxes.id.int().cpu().numpy()
            boxes = result.boxes.xyxy.cpu().numpy()
            kpts = result.keypoints.data.cpu().numpy()
            for tid, box, kp in zip(ids, boxes, kpts):
                t = tracks.setdefault(int(tid), Track(int(tid)))
                t.frames.append(i)
                t.boxes.append(box)
                t.kpts.append(kp)
        i += 1
        progress("tracking", i, total)
    cap.release()
    if i == 0:
        raise RuntimeError(f"no frames could be read from {video.name}")
    return Tracking(fps, width, height, i, tracks)


def score(track: Track, tr: Tracking) -> float:
    """Size x closeness to the center x time on screen, each in [0, 1]."""
    boxes = np.array(track.boxes)
    # Box height, not area: area grows with the square of closeness, so one person a bit
    # nearer the camera would swamp everyone else.
    size = np.mean((boxes[:, 3] - boxes[:, 1]) / tr.height)
    centers = np.stack([(boxes[:, 0] + boxes[:, 2]) / 2, (boxes[:, 1] + boxes[:, 3]) / 2], axis=1)
    half_diag = np.hypot(tr.width, tr.height) / 2
    dist = np.linalg.norm(centers - [tr.width / 2, tr.height / 2], axis=1) / half_diag
    centrality = np.mean(1 - dist)
    presence = len(track.frames) / tr.n_frames
    return float(size * centrality * presence)


def _pick_auto(tr: Tracking) -> Track:
    candidates = [t for t in tr.tracks.values() if len(t.frames) / tr.n_frames >= MIN_PRESENCE]
    if not candidates:
        candidates = list(tr.tracks.values())
    return max(candidates, key=lambda t: score(t, tr))


def _pick_click(tr: Tracking, x: float, y: float) -> Track:
    # The click is on the first frame of the video, as shown to the user.
    first = [t for t in tr.tracks.values() if t.frames[0] == 0]
    hits = [t for t in first if t.boxes[0][0] <= x <= t.boxes[0][2] and t.boxes[0][1] <= y <= t.boxes[0][3]]
    if not hits:
        found = ", ".join(f"#{t.id} {np.round(t.boxes[0]).astype(int).tolist()}" for t in first) or "none"
        raise RuntimeError(f"no person contains ({x:.0f}, {y:.0f}) in the first frame. People there: {found}")
    # Overlapping boxes: the person whose center is nearest the click is the one being pointed at.
    def dist(t: Track) -> float:
        b = t.boxes[0]
        return float(np.hypot((b[0] + b[2]) / 2 - x, (b[1] + b[3]) / 2 - y))

    return min(hits, key=dist)


def _stitch(chain_end: Track, tr: Tracking, used: set[int]) -> Track | None:
    last = chain_end.boxes[-1]
    last_h = last[3] - last[1]
    last_c = np.array([(last[0] + last[2]) / 2, (last[1] + last[3]) / 2])
    best, best_d = None, np.inf
    for t in tr.tracks.values():
        if t.id in used:
            continue
        gap = t.frames[0] - chain_end.frames[-1]
        if not 0 < gap <= STITCH_MAX_GAP_S * tr.fps:
            continue
        b = t.boxes[0]
        h = b[3] - b[1]
        d = np.linalg.norm(np.array([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]) - last_c) / last_h
        if d <= STITCH_MAX_DIST and 1 / STITCH_MAX_SCALE <= h / last_h <= STITCH_MAX_SCALE and d < best_d:
            best, best_d = t, d
    return best


def select_subject(tr: Tracking, click: tuple[float, float] | None) -> Subject:
    if not tr.tracks:
        raise RuntimeError("no person detected in the video")
    first = _pick_click(tr, *click) if click else _pick_auto(tr)
    boxes, kpts = {}, {}
    used, current = {first.id}, first
    while current is not None:
        for f, b, k in zip(current.frames, current.boxes, current.kpts):
            boxes[f], kpts[f] = b, k
        current = _stitch(current, tr, used)
        if current is not None:
            used.add(current.id)
    return Subject(first.id, "user" if click else "auto", boxes, kpts)
