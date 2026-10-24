"""How well does a walking checkpoint follow its clip?

    uv run --project training python -m training.evaluate_walk training/runs/walk-v1/step_*.pt

Each checkpoint starts at the beginning of the clip, standing in its first pose, and walks it to
the end with no exploration noise. Reports how many seconds it followed before falling or leaving
the path, how far the pelvis was from the reference on average, and the distance walked.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import torch

from .imitate import MIMIC_OBS_DIM, MimicEnv
from .ppo import ActorCritic


def run(model: ActorCritic | None) -> tuple[float, float, float, float]:
    env = MimicEnv(seed=0)
    env.reset()
    obs = env.reset_at(0.0)  # from the start of the clip, not a random instant
    errors = []
    start = env.data.qpos[:2].copy()
    while True:
        if model is None:
            action = np.zeros(29)  # no policy: the reference pose played through the motors
        else:
            with torch.no_grad():
                action = model.actor(model.norm(torch.as_tensor(obs)[None]))[0].numpy()
        obs, _, fell, done, _ = env.step(action)
        ref = env.motion.sample(env.t)[0]
        errors.append(np.linalg.norm(env.data.qpos[:2] - ref[:2]))
        if fell or done:
            walked = float(np.linalg.norm(env.data.qpos[:2] - start))
            return env.t, env.motion.duration, float(np.mean(errors)), walked


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m training.evaluate_walk", description=__doc__.split("\n")[0])
    p.add_argument("checkpoints", nargs="+", type=Path)
    args = p.parse_args()
    t, total, err, walked = run(None)
    print(f"{'sin política':>14}: sigue el clip {t:4.1f} s de {total:.1f}, error de pelvis {err:.2f} m, camina {walked:.1f} m")
    for path in sorted(args.checkpoints, key=lambda q: int(re.findall(r"\d+", q.stem)[-1])):
        model = ActorCritic(MIMIC_OBS_DIM)
        model.load_state_dict(torch.load(path)["model"])
        model.eval()
        t, total, err, walked = run(model)
        print(f"{path.stem:>14}: sigue el clip {t:4.1f} s de {total:.1f}, error de pelvis {err:.2f} m, camina {walked:.1f} m")


if __name__ == "__main__":
    main()
