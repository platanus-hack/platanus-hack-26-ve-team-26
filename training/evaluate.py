"""Does a checkpoint stand, and does it survive the web's push?

    uv run --project training python -m training.evaluate training/runs/stand-v1/step_*.pt

Each checkpoint stands for 20 s with no random pushes, and takes the "Empujar" push of physics/
(250 N for 0.1 s on the torso) at 4, 8, 12 and 16 s, from the front, left, back and right. It
reports how long it stood and how many pushes it survived, over several starting wobbles.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import torch

from .env import EPISODE_STEPS, G1Env
from .ppo import ActorCritic

PUSH_N = 250.0  # physics/src/sim.js
PUSHES = [(4, 0.0), (8, np.pi / 2), (12, np.pi), (16, 3 * np.pi / 2)]  # (second, direction)
TRIALS = 5


def run(model: ActorCritic | None, seed: int) -> tuple[float, int]:
    env = G1Env(seed=seed, push=False)
    obs = env.reset()
    survived = 0
    for k in range(EPISODE_STEPS):
        for second, angle in PUSHES:
            if k == second * 50:
                env.push_now(PUSH_N, angle)
            if k == second * 50 + 100:  # still up 2 s after the push
                survived += 1
        if model is None:
            action = np.zeros(29)  # no policy: hold the standing targets, like physics/ today
        else:
            with torch.no_grad():
                action = model.actor(model.norm(torch.as_tensor(obs)[None]))[0].numpy()
        obs, _, fell, _, _ = env.step(action)
        if fell:
            return k / 50, survived
    return EPISODE_STEPS / 50, survived


def evaluate(model: ActorCritic | None) -> tuple[float, float]:
    results = [run(model, seed) for seed in range(TRIALS)]
    return float(np.mean([r[0] for r in results])), float(np.mean([r[1] for r in results]))


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.evaluate", description=__doc__.split("\n")[0])
    p.add_argument("checkpoints", nargs="+", type=Path)
    args = p.parse_args()
    stood, pushes = evaluate(None)
    print(f"{'sin política':>14}: de pie {stood:5.1f} s de 20, empujones aguantados {pushes:.1f} de 4")
    for path in sorted(args.checkpoints, key=lambda q: int(re.findall(r"\d+", q.stem)[-1])):
        model = ActorCritic()
        model.load_state_dict(torch.load(path)["model"])
        model.eval()
        stood, pushes = evaluate(model)
        print(f"{path.stem:>14}: de pie {stood:5.1f} s de 20, empujones aguantados {pushes:.1f} de 4")


if __name__ == "__main__":
    main()
