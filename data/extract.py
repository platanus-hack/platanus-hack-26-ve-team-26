"""Video (or .zip of videos) -> PoseClip of one subject, as docs/contrato.md defines it.

    uv run --project data python -m data.extract <video.mp4|videos.zip> [--click x,y] [--out data/clips]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
import traceback
import zipfile
from datetime import date
from pathlib import Path

import numpy as np

from .lift import lift_subject
from .track import select_subject, track_people

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
DEFAULT_OUT = Path(__file__).parent / "clips"


class Progress:
    """One line per video, rewritten in place: stage and percent."""

    def __init__(self, label: str):
        self.label = label
        self.last = ""

    def __call__(self, stage: str, i: int, total: int) -> None:
        pct = f"{100 * i // total}%" if total > 0 else f"{i} frames"
        line = f"{self.label} {stage} {pct}"
        if line != self.last:
            print(f"\r{line}\033[K", end="", file=sys.stderr, flush=True)
            self.last = line

    def done(self, msg: str) -> None:
        print(f"\r{self.label} {msg}\033[K", file=sys.stderr, flush=True)


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "video"


def _clip_id(stem: str, out: Path) -> str:
    base = f"clip_{date.today().isoformat()}_{_slug(stem)}"
    n = 1
    while (out / f"{base}_{n:02d}.json").exists():
        n += 1
    return f"{base}_{n:02d}"


def extract(video: Path, source_file: str, out: Path, click: tuple[float, float] | None, progress: Progress) -> Path:
    tracking = track_people(video, progress)
    subject = select_subject(tracking, click)
    lifted = lift_subject(video, tracking, subject, progress)

    out.mkdir(parents=True, exist_ok=True)
    clip_id = _clip_id(Path(source_file).stem, out)
    fps = tracking.fps
    t = (lifted.frame_index - lifted.frame_index[0]) / fps
    joints = np.round(lifted.joints, 4)
    clip = {
        "id": clip_id,
        "source": "upload",
        "source_file": source_file,
        "fps": round(fps, 3),
        "skeleton": "mediapipe33",
        "units": "m",
        "origin": "hips",
        "subject": {"track_id": subject.track_id, "selected_by": subject.selected_by},
        "frames": [{"t": round(float(ti), 4), "joints": j.tolist()} for ti, j in zip(t, joints)],
        "quality": {"valid_ratio": round(float(lifted.valid.mean()), 3)},
    }
    json_path = out / f"{clip_id}.json"
    json_path.write_text(json.dumps(clip, separators=(",", ":")))
    # Same data for training, plus what the overlay needs to check the subject on the source video.
    meta = {k: v for k, v in clip.items() if k != "frames"}
    np.savez_compressed(
        out / f"{clip_id}.npz",
        joints=lifted.joints.astype(np.float32),  # [F, 33, 4]
        t=t.astype(np.float32),
        valid=lifted.valid,  # [F] frames detected, not interpolated
        frame_index=lifted.frame_index,  # [F] source video frame
        joints2d=lifted.joints2d.astype(np.float32),  # [F, 33, 3] pixels + visibility
        boxes=lifted.boxes.astype(np.float32),  # [F, 4] subject box
        meta=json.dumps(meta),
    )
    dropped = ", ".join(f"{k} {v}" for k, v in lifted.rejected.items() if v)
    progress.done(f"track #{subject.track_id} ({subject.selected_by}), valid {clip['quality']['valid_ratio']:.0%}"
                  + (f", dropped: {dropped}" if dropped else ""))
    return json_path


def _parse_click(s: str) -> tuple[float, float]:
    try:
        x, y = (float(v) for v in s.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError("--click must be x,y in pixels of the first frame, e.g. 640,360")
    return x, y


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m data.extract", description=__doc__.split("\n")[0])
    p.add_argument("input", type=Path, help="a video or a .zip of videos")
    p.add_argument("--click", type=_parse_click, help="x,y in the first frame: follow the person there")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output folder (default: data/clips)")
    args = p.parse_args(argv)

    if not args.input.exists():
        p.error(f"{args.input} does not exist")

    if args.input.suffix.lower() != ".zip":
        start = time.time()
        progress = Progress(args.input.name)
        try:
            path = extract(args.input, args.input.name, args.out, args.click, progress)
        except RuntimeError as e:
            progress.done(f"failed: {e}")
            return 1
        progress.done(f"ok -> {path} ({time.time() - start:.0f} s)")
        return 0

    if args.click:
        p.error("--click picks a person in one video; it cannot apply to every video in a .zip")
    with zipfile.ZipFile(args.input) as zf, tempfile.TemporaryDirectory() as tmp:
        members = [
            m for m in zf.infolist()
            if not m.is_dir() and Path(m.filename).suffix.lower() in VIDEO_EXTS
            and not Path(m.filename).name.startswith(".") and "__MACOSX" not in m.filename
        ]
        if not members:
            p.error(f"{args.input.name} has no videos ({', '.join(sorted(VIDEO_EXTS))})")
        ok, failed = [], []
        for n, m in enumerate(members, 1):
            name = Path(m.filename).name
            progress = Progress(f"[{n}/{len(members)}] {name}")
            start = time.time()
            # One video at a time: extracted, processed and deleted, so a large .zip never fills the disk.
            video = Path(tmp) / f"{n}{Path(name).suffix}"
            try:
                with zf.open(m) as src, open(video, "wb") as dst:
                    while chunk := src.read(1 << 20):
                        dst.write(chunk)
                path = extract(video, name, args.out, None, progress)
                ok.append(path)
                progress.done(f"ok -> {path.name} ({time.time() - start:.0f} s)")
            except Exception as e:  # a broken video must not stop the batch
                failed.append(name)
                progress.done(f"failed: {e}")
                if not isinstance(e, RuntimeError):
                    traceback.print_exc(file=sys.stderr)
            finally:
                video.unlink(missing_ok=True)
        print(f"{len(ok)} clips in {args.out}, {len(failed)} failed{': ' + ', '.join(failed) if failed else ''}",
              file=sys.stderr)
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
