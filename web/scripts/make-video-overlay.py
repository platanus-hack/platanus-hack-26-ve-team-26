"""Writes the 2D skeleton of a preloaded clip, over its source video, for the Simulaciones overlay.

data/ keeps each clip's MediaPipe landmarks in image pixels (`joints2d` in the .npz). The web plays
a smaller copy of the video (public/media), so the points are stored here as a share of the frame
(0 to 1), per video frame, with their visibility. Only the body (points 11 to 32) and the nose: the
face points are a few pixels apart and read as noise at this size.

Run from the repo root: python3 web/scripts/make-video-overlay.py <clip.npz> <width> <height> <out.json>
(width and height of the ORIGINAL video the clip was extracted from: caminar-perfil.mp4 is 1280x720,
checked by drawing the points over a frame of web/public/media/caminar.mp4).
"""
import json
import sys

import numpy as np

npz, width, height, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
data = np.load(npz, allow_pickle=True)
points = data["joints2d"]  # [frames, 33, 3]: x px, y px, visibility
keep = [0, *range(11, 33)]
frames = [
    [[round(float(p[0]) / width, 4), round(float(p[1]) / height, 4), round(float(p[2]), 2)] for p in frame[keep]]
    for frame in points
]
with open(out, "w") as f:
    json.dump({"fps": float(len(frames) / (data["t"][-1] + data["t"][1])), "points": keep, "frames": frames}, f, separators=(",", ":"))
print(f"{out}: {len(frames)} frames")
