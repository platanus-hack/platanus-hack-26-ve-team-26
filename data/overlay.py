"""Draw the subject of a PoseClip over its source video, to check the right person was followed.

    uv run --project data python -m data.overlay data/clips/<clip>.npz <video.mp4> [-o out.mp4]

Green box and skeleton: frames that made it into the clip. Red box: frames dropped and
interpolated (occluded, another person in the crop, or no pose found).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

# MediaPipe Pose body connections (face left out to keep the drawing readable).
BONES = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (27, 29), (29, 31), (27, 31), (24, 26), (26, 28), (28, 30), (30, 32), (28, 32),
]
GREEN, RED, WHITE = (80, 220, 80), (60, 60, 230), (255, 255, 255)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m data.overlay", description=__doc__.split("\n")[0])
    p.add_argument("clip", type=Path, help="the clip's .npz")
    p.add_argument("video", type=Path, help="the source video")
    p.add_argument("-o", "--out", type=Path, help="output video (default: <clip>.overlay.mp4)")
    args = p.parse_args(argv)

    d = np.load(args.clip)
    meta = json.loads(str(d["meta"]))
    frame_index, joints2d, boxes, valid = d["frame_index"], d["joints2d"], d["boxes"], d["valid"]
    by_frame = {int(f): k for k, f in enumerate(frame_index)}
    out = args.out or args.clip.with_suffix(".overlay.mp4")

    cap = cv2.VideoCapture(str(args.video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    tmp = out.with_suffix(".tmp.mp4")
    writer = cv2.VideoWriter(str(tmp), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    thick = max(2, h // 300)
    label = f"#{meta['subject']['track_id']} {meta['subject']['selected_by']}"

    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        k = by_frame.get(i)
        if k is not None:
            color = GREEN if valid[k] else RED
            x0, y0, x1, y1 = boxes[k].astype(int)
            cv2.rectangle(frame, (x0, y0), (x1, y1), color, thick)
            cv2.putText(frame, label, (x0, max(y0 - 8, 20)), cv2.FONT_HERSHEY_SIMPLEX, h / 900, color, thick)
            if valid[k]:
                pts = joints2d[k, :, :2].astype(int)
                for a, b in BONES:
                    cv2.line(frame, tuple(pts[a]), tuple(pts[b]), GREEN, thick, cv2.LINE_AA)
                for j in range(11, 33):
                    cv2.circle(frame, tuple(pts[j]), thick + 1, WHITE, -1, cv2.LINE_AA)
        writer.write(frame)
        i += 1
    cap.release()
    writer.release()

    # OpenCV's mp4v does not play everywhere (browsers, QuickTime); re-encode to H.264 when ffmpeg exists.
    if shutil.which("ffmpeg"):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-crf", "23", str(out)], check=True)
        tmp.unlink()
    else:
        tmp.rename(out)
    print(f"overlay -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
