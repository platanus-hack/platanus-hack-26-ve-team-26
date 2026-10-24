"""Model weights, downloaded on first use into data/models/ (git-ignored)."""

from __future__ import annotations

import urllib.request
from pathlib import Path

MODELS_DIR = Path(__file__).parent / "models"

# The small pose model: on an M2 it tracks a 720p frame in ~20 ms on MPS and, unlike the nano
# model, keeps people 100+ px tall detected. Its boxes and 17 keypoints only pick and follow the
# subject; the 3D comes from MediaPipe, so a bigger YOLO would cost time without improving the clip.
YOLO_WEIGHTS = "yolo11s-pose.pt"

# The heavy landmarker: videos are processed offline, so we trade speed (~40 ms per crop)
# for the most stable world landmarks MediaPipe offers. The live camera uses "lite" in the browser.
MEDIAPIPE_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
)


def yolo_path() -> Path:
    # Ultralytics downloads the weights to this exact path when it does not exist yet.
    MODELS_DIR.mkdir(exist_ok=True)
    return MODELS_DIR / YOLO_WEIGHTS


def mediapipe_path() -> Path:
    MODELS_DIR.mkdir(exist_ok=True)
    path = MODELS_DIR / "pose_landmarker_heavy.task"
    if not path.exists():
        print(f"Downloading {path.name}...")
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(MEDIAPIPE_URL, tmp)
        tmp.rename(path)
    return path
