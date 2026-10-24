"""Live progress of a training run, from its progress.csv: how far along, how long is left, and
whether it is learning.

    uv run --project training python -m training.watch training/runs/<run> --steps 30000000

ppo.py appends a row to <run>/progress.csv every update (about every 4,000 steps), so this only
reads that file: it can watch a run started by anyone, from any terminal, and stopping it (Ctrl+C)
never touches the training.
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

# An episode ends at 20 s (training/env.py EPISODE_STEPS at 50 Hz): 20 s per attempt means it
# never fell in that stretch.
EPISODE_CAP_S = 20.0
BAR = 32  # characters of the progress bar
SPARK = "▁▂▃▄▅▆▇█"
# The curve and the "now" numbers average the last rows: a single update is noisy (64 robots, a few
# episodes each), 25 updates are ~100k steps.
RECENT = 25


def read(path: Path) -> list[dict[str, float]]:
    """The rows of progress.csv. An update where no episode ended has episode_s = nan: it is
    carried from the previous row, so averages and the curve never see a NaN."""
    rows = []
    with path.open() as f:
        for row in csv.DictReader(f):
            parsed = {k: float(v) for k, v in row.items()}
            if parsed["episode_s"] != parsed["episode_s"]:  # NaN
                parsed["episode_s"] = rows[-1]["episode_s"] if rows else 0.0
            rows.append(parsed)
    return rows


def duration(seconds: float) -> str:
    seconds = int(seconds)
    return f"{seconds // 3600} h {seconds % 3600 // 60:02d} min" if seconds >= 3600 else f"{seconds // 60} min {seconds % 60:02d} s"


def sparkline(values: list[float], width: int = 40) -> str:
    """The episode length over the whole run, squeezed into `width` characters (0 to 20 s)."""
    if not values:
        return ""
    step = max(1, len(values) // width)
    chunks = [values[i : i + step] for i in range(0, len(values), step)][-width:]
    return "".join(SPARK[min(len(SPARK) - 1, int(sum(c) / len(c) / EPISODE_CAP_S * len(SPARK)))] for c in chunks)


def render(run: Path, rows: list[dict[str, float]], total: int) -> str:
    if not rows:
        return f"{run.name}: esperando la primera fila de progress.csv…"
    last = rows[-1]
    recent = rows[-RECENT:]
    done = min(1.0, last["step"] / total)
    speed = sum(r["steps_per_s"] for r in recent) / len(recent)
    left = (total - last["step"]) / speed if speed > 0 else float("nan")
    episode = sum(r["episode_s"] for r in recent) / len(recent)
    reward = sum(r["reward_per_step"] for r in recent) / len(recent)
    filled = int(done * BAR)
    lines = [
        f"{run.name}   {'█' * filled}{'░' * (BAR - filled)}  {100 * done:5.1f} %",
        f"  pasos      {last['step'] / 1e6:6.2f} M de {total / 1e6:g} M   ({speed / 1e3:.1f} mil por segundo)",
        f"  tiempo     lleva {duration(last['seconds'])} · faltan ~{duration(left)}" if left == left else "",
        f"  de pie     {episode:4.1f} s por intento, de {EPISODE_CAP_S:g} (sube = está aprendiendo)",
        f"  premio     {reward:.3f} por paso",
        f"  curva      {sparkline([r['episode_s'] for r in rows])}  (segundos de pie, todo el run)",
    ]
    if last["step"] >= total:
        lines.append("  terminado")
    return "\n".join(line for line in lines if line)


def main() -> int:
    p = argparse.ArgumentParser(prog="python -m training.watch", description=__doc__.split("\n")[0])
    p.add_argument("run", type=Path, help="the run folder, e.g. training/runs/stand-v5")
    p.add_argument("--steps", type=int, required=True, help="the --steps the run was started with")
    p.add_argument("--every", type=float, default=2.0, help="seconds between refreshes")
    p.add_argument("--once", action="store_true", help="print once and exit")
    args = p.parse_args()
    csv_path = args.run / "progress.csv"
    try:
        while True:
            text = render(args.run, read(csv_path) if csv_path.exists() else [], args.steps)
            if args.once:
                print(text)
                return 0
            # Redraw the whole screen: moving the cursor up over the previous block breaks as soon as
            # a line wraps in a narrow terminal, and then the block repeats instead of updating.
            sys.stdout.write("\033[H\033[2J" + text + "\n")
            sys.stdout.flush()
            if text.endswith("terminado"):
                return 0
            time.sleep(args.every)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
